import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Repository } from 'typeorm';
import { ChurchSmsConfig, getChurchSmsShortcodes } from '../common/church.utils';
import { Church } from '../entities/church.entity';
import {
  Contribution,
  ContributionChannel,
  ContributionStatus,
} from '../entities/contribution.entity';
import { Contributor, ContributorGender } from '../entities/contributor.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsBatch, SmsBatchAudience } from '../entities/sms-batch.entity';
import {
  SmsDeliveryStatus,
  SmsMessageType,
  SmsOutbox,
  SmsSendStatus,
} from '../entities/sms-outbox.entity';

type ResolvedSmsConfig = {
  partnerId: string;
  apiKey: string;
  shortCode: string;
  baseUrl: string;
};

type BulkRecipient = {
  contributorId: string | null;
  name: string | null;
  firstName: string | null;
  mobile: string;
  isHashedRecipient: boolean;
  dedupeKey?: string;
};

type PreparedBulkRecipient = BulkRecipient & {
  messageBody: string;
  estimatedUnits: number;
};

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly partnerId: string;
  private readonly apiKey: string;
  private readonly shortCode: string;
  private readonly baseUrl: string;

  constructor(
    private configService: ConfigService,
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(Contributor)
    private readonly contributorRepo: Repository<Contributor>,
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(SmsAddressBookContact)
    private readonly addressBookContactRepo: Repository<SmsAddressBookContact>,
    @InjectRepository(SmsBatch)
    private readonly smsBatchRepo: Repository<SmsBatch>,
    @InjectRepository(SmsOutbox)
    private readonly smsOutboxRepo: Repository<SmsOutbox>,
  ) {
    this.partnerId = this.configService.get<string>('ADVANTA_PARTNER_ID') || '';
    this.apiKey = this.configService.get<string>('ADVANTA_API_KEY') || '';
    this.shortCode = this.configService.get<string>('ADVANTA_SHORTCODE') || '';
    // Advanta services endpoint: https://quicksms.advantasms.com/api/services
    const rawUrl =
      this.configService.get<string>('ADVANTA_BASE_URL') ||
      'https://quicksms.advantasms.com';
    this.baseUrl = rawUrl.replace(/\/$/, '');
  }

  /**
   * Send OTP via Advanta SMS API
   */
  async sendOtp(
    phone: string,
    otp: string,
    isFlash = false,
    config: ChurchSmsConfig = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const cleanPhone = this.formatPhone(phone);
    // Official OTP endpoint for transactional/OTP messages
    const url = `${resolved.baseUrl}/api/services/sendotp`;
    const message = this.sanitizeGsm7(
      `Your PulseLynk code is: ${otp}. Valid for 5 minutes.`,
    );

    const data: any = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: cleanPhone,
      message: message,
      shortcode: resolved.shortCode,
    };

    if (isFlash) {
      data.isFlash = 1; // Support Flash delivery if account is enabled
    }

    try {
      this.logger.log(
        `[SMS] Sending OTP to ${this.maskPhone(cleanPhone)}${isFlash ? ' (FLASH)' : ''} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      // Official Advanta OTP response is wrapped in 'responses' array
      const success =
        response.data?.responses?.[0]?.['response-code'] == 200 ||
        response.data?.['response-code'] == 200;

      if (success) {
        this.logger.log(
          `[SMS] OTP sent successfully to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      this.logger.error(
        `[SMS] Advanta OTP error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      this.logger.error(
        `[SMS] Failed to send OTP | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Send Notification SMS
   */
  async sendSms(
    phone: string,
    message: string,
    config: ChurchSmsConfig = {},
    options: {
      messageType?: SmsMessageType;
      contributorId?: string | null;
      createdByUserId?: string | null;
      recipientName?: string | null;
      batchId?: string | null;
    } = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const cleanPhone = this.formatPhone(phone);
    const url = `${resolved.baseUrl}/api/services/sendsms`;
    const messageBody = this.sanitizeGsm7(message);
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: cleanPhone,
      message: messageBody,
      shortcode: resolved.shortCode,
    };

    try {
      this.logger.log(
        `[SMS] Sending notification to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      const success =
        response.data?.['response-code'] == 200 ||
        response.data?.responses?.[0]?.['response-code'] == 200;
      if (success) {
        await this.recordOutboxMessage({
          churchId: config.churchId || null,
          batchId: options.batchId || null,
          contributorId: options.contributorId || null,
          createdByUserId: options.createdByUserId || null,
          recipientName: options.recipientName || null,
          recipientMobile: cleanPhone,
          isHashedRecipient: false,
          messageType: options.messageType || SmsMessageType.RECEIPT,
          messageBody,
          estimatedUnits: this.estimateGsm7Units(messageBody),
          providerResponse: response.data,
          sendStatus: SmsSendStatus.ACCEPTED,
        });
        this.logger.log(
          `[SMS] Notification sent successfully to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      await this.recordOutboxMessage({
        churchId: config.churchId || null,
        batchId: options.batchId || null,
        contributorId: options.contributorId || null,
        createdByUserId: options.createdByUserId || null,
        recipientName: options.recipientName || null,
        recipientMobile: cleanPhone,
        isHashedRecipient: false,
        messageType: options.messageType || SmsMessageType.RECEIPT,
        messageBody,
        estimatedUnits: this.estimateGsm7Units(messageBody),
        providerResponse: response.data,
        sendStatus: SmsSendStatus.FAILED,
      });
      this.logger.error(
        `[SMS] Advanta notification error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      await this.recordOutboxMessage({
        churchId: config.churchId || null,
        batchId: options.batchId || null,
        contributorId: options.contributorId || null,
        createdByUserId: options.createdByUserId || null,
        recipientName: options.recipientName || null,
        recipientMobile: cleanPhone,
        isHashedRecipient: false,
        messageType: options.messageType || SmsMessageType.RECEIPT,
        messageBody,
        estimatedUnits: this.estimateGsm7Units(messageBody),
        sendStatus: SmsSendStatus.FAILED,
        providerCode: axios.isAxiosError(e)
          ? `${e.response?.status || 'error'}`
          : 'error',
        providerDescription: e?.message || 'SMS request failed',
      });
      this.logger.error(
        `[SMS] Failed to send SMS | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Send transactional SMS to Safaricom hashed MSISDN values.
   */
  async sendSmsToHashedSafaricomNumber(
    hashedMobile: string,
    message: string,
    config: ChurchSmsConfig = {},
    options: {
      messageType?: SmsMessageType;
      contributorId?: string | null;
      createdByUserId?: string | null;
      recipientName?: string | null;
      batchId?: string | null;
    } = {},
  ): Promise<boolean> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const url = `${resolved.baseUrl}/api/services/sendotp`;
    const messageBody = this.sanitizeGsm7(message);
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: hashedMobile,
      message: messageBody,
      shortcode: resolved.shortCode,
      hashed: true,
    };

    try {
      this.logger.log(
        `[SMS] Sending hashed Safaricom notification to ${this.maskHashedMobile(hashedMobile)} | ${this.formatDiagnostics(diagnostics)}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });

      const success =
        response.data?.['response-code'] == 200 ||
        response.data?.responses?.[0]?.['response-code'] == 200;
      if (success) {
        await this.recordOutboxMessage({
          churchId: config.churchId || null,
          batchId: options.batchId || null,
          contributorId: options.contributorId || null,
          createdByUserId: options.createdByUserId || null,
          recipientName: options.recipientName || null,
          recipientMobile: hashedMobile,
          isHashedRecipient: true,
          messageType: options.messageType || SmsMessageType.RECEIPT,
          messageBody,
          estimatedUnits: this.estimateGsm7Units(messageBody),
          providerResponse: response.data,
          sendStatus: SmsSendStatus.ACCEPTED,
        });
        this.logger.log(
          `[SMS] Hashed Safaricom notification sent successfully to ${this.maskHashedMobile(hashedMobile)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      await this.recordOutboxMessage({
        churchId: config.churchId || null,
        batchId: options.batchId || null,
        contributorId: options.contributorId || null,
        createdByUserId: options.createdByUserId || null,
        recipientName: options.recipientName || null,
        recipientMobile: hashedMobile,
        isHashedRecipient: true,
        messageType: options.messageType || SmsMessageType.RECEIPT,
        messageBody,
        estimatedUnits: this.estimateGsm7Units(messageBody),
        providerResponse: response.data,
        sendStatus: SmsSendStatus.FAILED,
      });
      this.logger.error(
        `[SMS] Advanta hashed error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      await this.recordOutboxMessage({
        churchId: config.churchId || null,
        batchId: options.batchId || null,
        contributorId: options.contributorId || null,
        createdByUserId: options.createdByUserId || null,
        recipientName: options.recipientName || null,
        recipientMobile: hashedMobile,
        isHashedRecipient: true,
        messageType: options.messageType || SmsMessageType.RECEIPT,
        messageBody,
        estimatedUnits: this.estimateGsm7Units(messageBody),
        sendStatus: SmsSendStatus.FAILED,
        providerCode: axios.isAxiosError(e)
          ? `${e.response?.status || 'error'}`
          : 'error',
        providerDescription: e?.message || 'Hashed SMS request failed',
      });
      this.logger.error(
        `[SMS] Failed to send hashed SMS | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return false;
    }
  }

  /**
   * Check SMS Balance
   */
  async getBalance(config: ChurchSmsConfig = {}): Promise<number> {
    const resolved = this.resolveConfig(config);
    const diagnostics = this.buildDiagnostics(config, resolved);
    const url = `${resolved.baseUrl}/api/services/getbalance`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
    };

    try {
      const response = await axios.post(url, data, { timeout: 10000 });
      if (response.data?.['response-code'] == 200) {
        // Success response uses "credit" field
        return parseFloat(response.data?.credit || '0');
      }
      this.logger.error(
        `[SMS] Balance failed | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return 0;
    } catch (e) {
      this.logger.error(
        `[SMS] Balance check failed | ${this.formatDiagnostics(diagnostics)} | ${this.describeAxiosError(e)}`,
      );
      return 0;
    }
  }

  async sendBulkMessages(
    churchId: string,
    createdByUserId: string,
    body: {
      audience: SmsBatchAudience;
      message: string;
      pastedContacts?: string;
      addressBookIds?: string[];
      smsShortcode?: string;
    },
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new Error('Church not found');
    }

    const messageBody = this.sanitizeGsm7(body.message || '');
    if (!messageBody.trim()) {
      throw new Error('Message is required');
    }

    const recipients = await this.resolveBulkRecipients(churchId, body);
    const uniqueRecipients = this.dedupeRecipients(recipients);
    if (uniqueRecipients.length === 0) {
      throw new BadRequestException('No valid SMS recipients were found');
    }
    const preparedRecipients = uniqueRecipients.map((recipient) => {
      const renderedMessage = this.renderBulkMessage(messageBody, recipient);
      return {
        ...recipient,
        messageBody: renderedMessage,
        estimatedUnits: this.estimateGsm7Units(renderedMessage),
      };
    });
    const totalUnits = preparedRecipients.reduce(
      (sum, recipient) => sum + recipient.estimatedUnits,
      0,
    );

    const batch = await this.smsBatchRepo.save(
      this.smsBatchRepo.create({
        churchId,
        createdByUserId,
        audience: body.audience,
        messageBody,
        recipientCount: preparedRecipients.length,
        totalUnits,
        status: 'sending',
      }),
    );

    const config = this.getConfigFromChurch(church, body.smsShortcode);
    const resolved = this.resolveConfig(config);
    const url = `${resolved.baseUrl}/api/services/sendbulk`;
    const plainRecipients = preparedRecipients.filter(
      (recipient) => !recipient.isHashedRecipient,
    );
    const hashedRecipients = preparedRecipients.filter(
      (recipient) => recipient.isHashedRecipient,
    );

    for (let index = 0; index < plainRecipients.length; index += 1000) {
      const chunk = plainRecipients.slice(index, index + 1000);
      const outboxRows = await this.smsOutboxRepo.save(
        chunk.map((recipient) =>
          this.smsOutboxRepo.create({
            churchId,
            batchId: batch.id,
            contributorId: recipient.contributorId,
            createdByUserId,
            recipientName: recipient.name || null,
            recipientMobile: recipient.mobile,
            isHashedRecipient: recipient.isHashedRecipient,
            messageType: SmsMessageType.BULK,
            messageBody: recipient.messageBody,
            estimatedUnits: recipient.estimatedUnits,
            sendStatus: SmsSendStatus.PENDING,
            deliveryStatus: SmsDeliveryStatus.PENDING,
          }),
        ),
      );

      const clientSmsIdByRowId = new Map<string, string>();
      const smslist = outboxRows.map((row, rowIndex) => {
        const clientsmsid = `${Date.now().toString().slice(-8)}${`${index + rowIndex}`.padStart(4, '0')}`;
        clientSmsIdByRowId.set(row.id, clientsmsid);

        return {
          partnerID: resolved.partnerId,
          apikey: resolved.apiKey,
          pass_type: 'plain',
          clientsmsid: Number(clientsmsid),
          mobile: row.recipientMobile,
          message: row.messageBody,
          shortcode: resolved.shortCode,
        };
      });

      try {
        const response = await axios.post(
          url,
          { count: smslist.length, smslist },
          { timeout: 30000 },
        );
        await this.applyBulkProviderResponse(
          outboxRows,
          response.data,
          clientSmsIdByRowId,
        );
      } catch (error) {
        await this.smsOutboxRepo.save(
          outboxRows.map((row) => ({
            ...row,
            sendStatus: SmsSendStatus.FAILED,
            providerCode: axios.isAxiosError(error)
              ? `${error.response?.status || 'error'}`
              : 'error',
            providerDescription: error?.message || 'Bulk SMS request failed',
            providerRawResponse: axios.isAxiosError(error)
              ? (error.response?.data as any)
              : null,
          })),
        );
      }
    }

    for (let index = 0; index < hashedRecipients.length; index += 100) {
      const chunk = hashedRecipients.slice(index, index + 100);
      const outboxRows = await this.smsOutboxRepo.save(
        chunk.map((recipient) =>
          this.smsOutboxRepo.create({
            churchId,
            batchId: batch.id,
            contributorId: recipient.contributorId,
            createdByUserId,
            recipientName: recipient.name || null,
            recipientMobile: recipient.mobile,
            isHashedRecipient: true,
            messageType: SmsMessageType.BULK,
            messageBody: recipient.messageBody,
            estimatedUnits: recipient.estimatedUnits,
            sendStatus: SmsSendStatus.PENDING,
            deliveryStatus: SmsDeliveryStatus.PENDING,
          }),
        ),
      );

      for (const row of outboxRows) {
        await this.sendHashedOutboxRow(row, resolved);
      }
    }

    const failed = await this.smsOutboxRepo.count({
      where: { batchId: batch.id, sendStatus: SmsSendStatus.FAILED },
    });
    batch.status = failed > 0 ? 'completed_with_failures' : 'completed';
    await this.smsBatchRepo.save(batch);

    return {
      batchId: batch.id,
      recipientCount: batch.recipientCount,
      totalUnits: batch.totalUnits,
      failed,
    };
  }

  async listOutbox(churchId: string, query: any = {}) {
    const qb = this.smsOutboxRepo
      .createQueryBuilder('message')
      .leftJoinAndSelect('message.contributor', 'contributor')
      .where('message.churchId = :churchId', { churchId })
      .orderBy('message.createdAt', 'DESC');

    if (query.from) {
      qb.andWhere('message.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('message.createdAt <= :to', { to: new Date(query.to) });
    }
    if (query.sendStatus) {
      qb.andWhere('message.sendStatus = :sendStatus', {
        sendStatus: query.sendStatus,
      });
    }
    if (query.deliveryStatus) {
      qb.andWhere('message.deliveryStatus = :deliveryStatus', {
        deliveryStatus: query.deliveryStatus,
      });
    }
    if (query.type) {
      qb.andWhere('message.messageType = :type', { type: query.type });
    }

    return qb.getMany();
  }

  async getSmsUsageSummary(churchId?: string, query: any = {}) {
    const qb = this.smsOutboxRepo
      .createQueryBuilder('message')
      .select('message.churchId', 'churchId')
      .addSelect('COUNT(message.id)', 'messageCount')
      .addSelect('SUM(message.estimatedUnits)', 'units')
      .where('message.sendStatus = :sendStatus', {
        sendStatus: SmsSendStatus.ACCEPTED,
      });

    if (churchId) {
      qb.andWhere('message.churchId = :churchId', { churchId });
    }
    if (query.from) {
      qb.andWhere('message.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('message.createdAt <= :to', { to: new Date(query.to) });
    }

    return qb.groupBy('message.churchId').getRawMany();
  }

  async handleAdvantaDlr(body: any) {
    const providerMessageId =
      body?.messageid || body?.messageID || body?.['message-id'];
    if (!providerMessageId) {
      return { accepted: false, message: 'Missing messageid' };
    }

    const outbox = await this.smsOutboxRepo.findOne({
      where: { providerMessageId: `${providerMessageId}` },
    });
    if (!outbox) {
      this.logger.warn(
        `[SMS] DLR callback received for unknown messageid=${this.maskSecret(`${providerMessageId}`)}`,
      );
      return { accepted: true, message: 'Unknown messageid' };
    }

    outbox.deliveryDescription = body?.description || null;
    outbox.deliveryTat = body?.timeTaken || body?.['delivery-tat'] || null;
    outbox.deliveryReportedAt = body?.timestamp
      ? new Date(body.timestamp)
      : new Date();
    outbox.deliveryStatus = this.mapDeliveryStatus(body?.description);
    outbox.providerRawResponse = {
      ...(outbox.providerRawResponse || {}),
      dlr: body,
    };

    await this.smsOutboxRepo.save(outbox);
    return { accepted: true };
  }

  public formatPhone(phone: string): string {
    if (!phone) return '';
    return this.normalizeKenyanPhone(phone) || phone.replace(/\D/g, '');
  }

  public normalizeKenyanPhone(phone: string): string | null {
    if (!phone) return null;

    const clean = phone.replace(/\D/g, '');
    if (/^254[17]\d{8}$/.test(clean)) {
      return clean;
    }

    if (/^0[17]\d{8}$/.test(clean)) {
      return `254${clean.slice(1)}`;
    }

    if (/^[17]\d{8}$/.test(clean)) {
      return `254${clean}`;
    }

    return null;
  }

  public estimateGsm7Units(text: string) {
    const length = this.sanitizeGsm7(text).length;
    return Math.max(1, Math.ceil(length / 160));
  }

  public getGsm7Length(text: string) {
    return this.sanitizeGsm7(text).length;
  }

  /**
   * Ensure the message only contains GSM-7 compatible characters
   * to avoid Advanta delivery failures.
   */
  public sanitizeGsm7(text: string): string {
    const gsm7Chars =
      '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
    return text
      .split('')
      .map((char) => {
        if (gsm7Chars.indexOf(char) !== -1) return char;
        // Replace common non-GSM characters with safe alternatives
        if (char === '⚡') return 'FLASH';
        if (char === '🚀') return 'READY';
        if (char === '🔐') return 'CODE';
        // Fallback for others (strip them)
        return '';
      })
      .join('');
  }

  private resolveConfig(config: ChurchSmsConfig): ResolvedSmsConfig {
    return {
      partnerId: config.smsPartnerId || this.partnerId,
      apiKey: config.smsApiKey || this.apiKey,
      shortCode: config.smsShortcode || this.shortCode,
      baseUrl: (config.smsBaseUrl || this.baseUrl).replace(/\/$/, ''),
    };
  }

  private async recordOutboxMessage(input: {
    churchId: string | null;
    batchId?: string | null;
    contributorId?: string | null;
    createdByUserId?: string | null;
    recipientName?: string | null;
    recipientMobile: string;
    isHashedRecipient: boolean;
    messageType: SmsMessageType;
    messageBody: string;
    estimatedUnits: number;
    sendStatus: SmsSendStatus;
    providerResponse?: any;
    providerCode?: string | null;
    providerDescription?: string | null;
  }) {
    if (!input.churchId) {
      return null;
    }

    const provider = this.extractProviderResult(input.providerResponse);
    return this.smsOutboxRepo.save(
      this.smsOutboxRepo.create({
        churchId: input.churchId,
        batchId: input.batchId || null,
        contributorId: input.contributorId || null,
        createdByUserId: input.createdByUserId || null,
        recipientName: input.recipientName || null,
        recipientMobile: input.recipientMobile,
        isHashedRecipient: input.isHashedRecipient,
        messageType: input.messageType,
        messageBody: input.messageBody,
        estimatedUnits: input.estimatedUnits,
        sendStatus: input.sendStatus,
        deliveryStatus:
          input.sendStatus === SmsSendStatus.ACCEPTED
            ? SmsDeliveryStatus.PENDING
            : SmsDeliveryStatus.UNKNOWN,
        providerMessageId: provider.messageId,
        providerCode: input.providerCode || provider.code,
        providerDescription:
          input.providerDescription || provider.description,
        providerRawResponse: input.providerResponse || null,
        sentAt:
          input.sendStatus === SmsSendStatus.ACCEPTED ? new Date() : null,
      }),
    );
  }

  private extractProviderResult(data: any) {
    const nested = data?.responses?.[0];
    return {
      code: `${nested?.['response-code'] ?? data?.['response-code'] ?? ''}` || null,
      description:
        nested?.['response-description'] ??
        data?.['response-description'] ??
        null,
      messageId: nested?.messageid ? `${nested.messageid}` : null,
      clientSmsId: nested?.clientsmsid ? `${nested.clientsmsid}` : null,
    };
  }

  private async applyBulkProviderResponse(
    rows: SmsOutbox[],
    data: any,
    clientSmsIdByRowId: Map<string, string>,
  ) {
    const responses = Array.isArray(data?.responses) ? data.responses : [];
    const byClientSmsId = new Map(
      responses.map((item: any) => [`${item.clientsmsid}`, item]),
    );

    await this.smsOutboxRepo.save(
      rows.map((row) => {
        const response = byClientSmsId.get(clientSmsIdByRowId.get(row.id) || row.id);
        const provider = this.extractProviderResult({ responses: [response] });
        const success = Number(provider.code || 0) === 200;

        return {
          ...row,
          sendStatus: success ? SmsSendStatus.ACCEPTED : SmsSendStatus.FAILED,
          deliveryStatus: success
            ? SmsDeliveryStatus.PENDING
            : SmsDeliveryStatus.UNKNOWN,
          providerMessageId: provider.messageId,
          providerCode: provider.code,
          providerDescription: provider.description,
          providerRawResponse: response || data,
          sentAt: success ? new Date() : null,
        };
      }),
    );
  }

  private async sendHashedOutboxRow(row: SmsOutbox, resolved: ResolvedSmsConfig) {
    const url = `${resolved.baseUrl}/api/services/sendotp`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      mobile: row.recipientMobile,
      message: row.messageBody,
      shortcode: resolved.shortCode,
      hashed: true,
    };

    try {
      const response = await axios.post(url, data, { timeout: 10000 });
      const provider = this.extractProviderResult(response.data);
      const success = Number(provider.code || 0) === 200;

      await this.smsOutboxRepo.save({
        ...row,
        sendStatus: success ? SmsSendStatus.ACCEPTED : SmsSendStatus.FAILED,
        deliveryStatus: success
          ? SmsDeliveryStatus.PENDING
          : SmsDeliveryStatus.UNKNOWN,
        providerMessageId: provider.messageId,
        providerCode: provider.code,
        providerDescription: provider.description,
        providerRawResponse: response.data,
        sentAt: success ? new Date() : null,
      });
    } catch (error) {
      await this.smsOutboxRepo.save({
        ...row,
        sendStatus: SmsSendStatus.FAILED,
        deliveryStatus: SmsDeliveryStatus.UNKNOWN,
        providerCode: axios.isAxiosError(error)
          ? `${error.response?.status || 'error'}`
          : 'error',
        providerDescription: error?.message || 'Hashed bulk SMS request failed',
        providerRawResponse: axios.isAxiosError(error)
          ? (error.response?.data as any)
          : null,
      });
    }
  }

  private async resolveBulkRecipients(
    churchId: string,
    body: {
      audience: SmsBatchAudience;
      pastedContacts?: string;
      addressBookIds?: string[];
    },
  ): Promise<BulkRecipient[]> {
    const recipients: BulkRecipient[] = [];

    if (body.audience !== SmsBatchAudience.PASTED_CONTACTS) {
      recipients.push(...(await this.resolveContributorRecipients(churchId, body.audience)));
    }

    const addressBookIds = Array.isArray(body.addressBookIds)
      ? body.addressBookIds.filter(Boolean)
      : [];
    if (addressBookIds.length > 0) {
      recipients.push(
        ...(await this.resolveAddressBookRecipients(churchId, addressBookIds)),
      );
    }

    if (body.pastedContacts) {
      recipients.push(...this.parsePastedContacts(body.pastedContacts));
    }

    return recipients;
  }

  private async resolveContributorRecipients(
    churchId: string,
    audience: SmsBatchAudience,
  ): Promise<BulkRecipient[]> {
    if (audience === SmsBatchAudience.ADDRESS_BOOKS) {
      return [];
    }

    const where: any = { churchId };
    if (audience === SmsBatchAudience.MALE_CONTRIBUTORS) {
      where.gender = ContributorGender.MALE;
    }
    if (audience === SmsBatchAudience.FEMALE_CONTRIBUTORS) {
      where.gender = ContributorGender.FEMALE;
    }

    const contributors = await this.contributorRepo.find({ where });
    const hashedByContributorId =
      await this.getLatestHashedMobileByContributor(
        churchId,
        contributors.map((contributor) => contributor.id),
      );

    return contributors
      .map((contributor) => {
        const hashedMobile = hashedByContributorId.get(contributor.id);
        if (hashedMobile) {
          const normalizedContributorPhone = this.normalizeKenyanPhone(
            contributor.phone || '',
          );
          return {
            contributorId: contributor.id,
            name: contributor.name,
            firstName: this.extractFirstName(contributor.name),
            mobile: hashedMobile,
            isHashedRecipient: true,
            dedupeKey: normalizedContributorPhone || `hashed:${hashedMobile}`,
          };
        }

        const mobile = this.formatPhone(contributor.phone || '');
        if (!this.isValidKenyanMobile(mobile)) {
          return null;
        }

        return {
          contributorId: contributor.id,
          name: contributor.name,
          firstName: this.extractFirstName(contributor.name),
          mobile,
          isHashedRecipient: false,
          dedupeKey: mobile,
        };
      })
      .filter(Boolean) as BulkRecipient[];
  }

  private async resolveAddressBookRecipients(
    churchId: string,
    addressBookIds: string[],
  ): Promise<BulkRecipient[]> {
    if (addressBookIds.length === 0) {
      return [];
    }

    const contacts = await this.addressBookContactRepo
      .createQueryBuilder('contact')
      .innerJoin('contact.addressBook', 'addressBook')
      .where('contact.churchId = :churchId', { churchId })
      .andWhere('contact.addressBookId IN (:...addressBookIds)', {
        addressBookIds,
      })
      .andWhere('addressBook.isActive = :isActive', { isActive: true })
      .getMany();

    return contacts
      .map((contact) => ({
        contributorId: null,
        name: contact.displayName,
        firstName:
          contact.firstName ||
          this.extractFirstName(contact.displayName || ''),
        mobile: contact.normalizedPhone,
        isHashedRecipient: false,
        dedupeKey: contact.normalizedPhone,
      }))
      .filter((recipient) => this.isValidKenyanMobile(recipient.mobile));
  }

  private parsePastedContacts(value: string): BulkRecipient[] {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parsed = this.parseContactLine(line);
        return {
          contributorId: null,
          name: parsed.name,
          firstName: parsed.firstName,
          mobile: this.formatPhone(parsed.phone),
          isHashedRecipient: false,
          dedupeKey: this.formatPhone(parsed.phone),
        };
      })
      .filter((recipient) => this.isValidKenyanMobile(recipient.mobile));
  }

  public parseContactLine(line: string) {
    const value = `${line || ''}`.trim();
    const commaParts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (commaParts.length > 1) {
      const phoneIndex = commaParts.findIndex((part) =>
        Boolean(this.normalizeKenyanPhone(part)),
      );
      if (phoneIndex >= 0) {
        const phone = commaParts[phoneIndex];
        const nameParts = commaParts.filter((_, index) => index !== phoneIndex);
        const name = nameParts.join(' ').trim() || null;
        return {
          name,
          firstName: this.extractFirstName(name || ''),
          phone,
        };
      }
    }

    const tokens = value.split(/\s+/).filter(Boolean);
    const phoneIndex = tokens.findIndex((token) =>
      Boolean(this.normalizeKenyanPhone(token)),
    );

    if (phoneIndex >= 0) {
      const phone = tokens[phoneIndex];
      const name = tokens.filter((_, index) => index !== phoneIndex).join(' ');
      return {
        name: name || null,
        firstName: this.extractFirstName(name),
        phone,
      };
    }

    return {
      name: null,
      firstName: null,
      phone: value,
    };
  }

  private dedupeRecipients(recipients: BulkRecipient[]) {
    const seen = new Set<string>();
    return recipients.filter((recipient) => {
      const key =
        recipient.dedupeKey ||
        `${recipient.isHashedRecipient ? 'hashed' : 'plain'}:${recipient.mobile}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private renderBulkMessage(template: string, recipient: BulkRecipient) {
    const firstName =
      recipient.firstName || this.extractFirstName(recipient.name || '') || '';
    return this.sanitizeGsm7(
      template
        .replace(/\{firstName\}/gi, firstName)
        .replace(/\{name\}/gi, recipient.name || firstName || 'Friend'),
    );
  }

  private extractFirstName(value: string | null | undefined) {
    return `${value || ''}`.trim().split(/\s+/).filter(Boolean)[0] || null;
  }

  private async getLatestHashedMobileByContributor(
    churchId: string,
    contributorIds: string[],
  ) {
    const hashedByContributorId = new Map<string, string>();
    if (contributorIds.length === 0) {
      return hashedByContributorId;
    }

    const contributions = await this.contributionRepo
      .createQueryBuilder('contribution')
      .where('contribution.churchId = :churchId', { churchId })
      .andWhere('contribution.contributorId IN (:...contributorIds)', {
        contributorIds,
      })
      .andWhere('contribution.channel = :channel', {
        channel: ContributionChannel.MPESA,
      })
      .andWhere('contribution.status = :status', {
        status: ContributionStatus.CONFIRMED,
      })
      .andWhere('contribution.providerRequestId IS NOT NULL')
      .orderBy('contribution.receivedAt', 'DESC')
      .addOrderBy('contribution.createdAt', 'DESC')
      .getMany();

    for (const contribution of contributions) {
      if (!contribution.contributorId || hashedByContributorId.has(contribution.contributorId)) {
        continue;
      }

      const candidate = `${contribution.providerRequestId || ''}`.trim();
      if (this.isLikelyHashedSafaricomMobile(candidate)) {
        hashedByContributorId.set(contribution.contributorId, candidate);
      }
    }

    return hashedByContributorId;
  }

  private isValidKenyanMobile(phone: string) {
    return /^254[17]\d{8}$/.test(phone);
  }

  private isLikelyHashedSafaricomMobile(value: string) {
    return (
      value.length >= 32 &&
      /^[a-zA-Z0-9]+$/.test(value) &&
      !this.isValidKenyanMobile(this.formatPhone(value))
    );
  }

  private getConfigFromChurch(
    church: Church,
    requestedShortcode?: string | null,
  ): ChurchSmsConfig {
    const shortcode = this.resolveChurchSmsShortcode(church, requestedShortcode);
    return {
      churchId: church.id,
      smsPartnerId: church.smsPartnerId,
      smsApiKey: church.smsApiKey,
      smsShortcode: shortcode,
      smsShortcodes: church.smsShortcodes,
      smsBaseUrl: church.smsBaseUrl,
    };
  }

  public getAvailableSmsShortcodes(church: Church) {
    return getChurchSmsShortcodes(church);
  }

  private resolveChurchSmsShortcode(
    church: Church,
    requestedShortcode?: string | null,
  ) {
    const requested = `${requestedShortcode || ''}`.trim();
    const available = getChurchSmsShortcodes(church);
    if (requested && available.includes(requested)) {
      return requested;
    }

    return church.smsShortcode || available[0] || null;
  }

  private mapDeliveryStatus(description?: string | null) {
    const normalized = `${description || ''}`.toLowerCase();
    if (normalized.includes('delivered')) {
      return SmsDeliveryStatus.DELIVERED;
    }
    if (
      normalized.includes('failed') ||
      normalized.includes('expired') ||
      normalized.includes('undelivered')
    ) {
      return SmsDeliveryStatus.FAILED;
    }
    return SmsDeliveryStatus.UNKNOWN;
  }

  private buildDiagnostics(
    config: ChurchSmsConfig,
    resolved: ResolvedSmsConfig,
  ) {
    return {
      partnerIdSource: this.resolveFieldSource(config.smsPartnerId, this.partnerId),
      apiKeySource: this.resolveFieldSource(config.smsApiKey, this.apiKey),
      shortCodeSource: this.resolveFieldSource(config.smsShortcode, this.shortCode),
      baseUrlSource: this.resolveFieldSource(config.smsBaseUrl, this.baseUrl),
      partnerIdHint: this.maskSecret(resolved.partnerId),
      shortCodeHint: this.maskSecret(resolved.shortCode),
      apiKeyPresent: Boolean(resolved.apiKey),
      baseUrl: resolved.baseUrl,
    };
  }

  private resolveFieldSource(
    churchValue: string | null | undefined,
    envValue: string | null | undefined,
  ) {
    if (churchValue) {
      return 'church';
    }

    if (envValue) {
      return 'env';
    }

    return 'missing';
  }

  private formatDiagnostics(diagnostics: ReturnType<typeof this.buildDiagnostics>) {
    return [
      `partnerIdSource=${diagnostics.partnerIdSource}`,
      `apiKeySource=${diagnostics.apiKeySource}`,
      `shortCodeSource=${diagnostics.shortCodeSource}`,
      `baseUrlSource=${diagnostics.baseUrlSource}`,
      `partnerId=${diagnostics.partnerIdHint}`,
      `shortcode=${diagnostics.shortCodeHint}`,
      `apiKeyPresent=${diagnostics.apiKeyPresent}`,
      `baseUrl=${diagnostics.baseUrl}`,
    ].join(' | ');
  }

  private describeProviderResponse(data: any) {
    if (!data) {
      return 'providerResponse=empty';
    }

    const nested = data?.responses?.[0];
    const responseCode = nested?.['response-code'] ?? data?.['response-code'];
    const responseDescription =
      nested?.['response-description'] ?? data?.['response-description'];
    const messageId = nested?.messageid ?? data?.messageid;

    return [
      `providerCode=${responseCode ?? 'unknown'}`,
      `providerDescription=${responseDescription ?? 'n/a'}`,
      `messageId=${messageId ? this.maskSecret(String(messageId)) : 'n/a'}`,
    ].join(' | ');
  }

  private describeAxiosError(error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'no-status';
      const providerResponse = this.describeProviderResponse(error.response?.data);
      return `status=${status} | message=${error.message} | ${providerResponse}`;
    }

    return `message=${error?.message || 'Unknown error'}`;
  }

  private maskSecret(value: string | null | undefined) {
    if (!value) {
      return 'missing';
    }

    if (value.length <= 4) {
      return `***${value.slice(-1)}`;
    }

    return `${'*'.repeat(Math.max(3, value.length - 4))}${value.slice(-4)}`;
  }

  private maskPhone(phone: string) {
    if (!phone) {
      return 'missing';
    }

    if (phone.length <= 6) {
      return `***${phone.slice(-2)}`;
    }

    return `${phone.slice(0, 3)}***${phone.slice(-3)}`;
  }

  private maskHashedMobile(hashedMobile: string) {
    if (!hashedMobile) {
      return 'missing';
    }

    if (hashedMobile.length <= 12) {
      return this.maskSecret(hashedMobile);
    }

    return `${hashedMobile.slice(0, 6)}...${hashedMobile.slice(-6)}`;
  }
}
