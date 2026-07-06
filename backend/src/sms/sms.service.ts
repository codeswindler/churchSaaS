import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { MoreThan, Repository } from 'typeorm';
import {
  ChurchMpesaConfig,
  ChurchSmsConfig,
  getChurchSmsShortcodes,
} from '../common/church.utils';
import { Church } from '../entities/church.entity';
import {
  Contribution,
  ContributionChannel,
  ContributionStatus,
} from '../entities/contribution.entity';
import { Contributor, ContributorGender } from '../entities/contributor.entity';
import {
  PLATFORM_SMS_CONFIG_ID,
  PlatformSmsConfig,
} from '../entities/platform-sms-config.entity';
import { SmsAddressBookContact } from '../entities/sms-address-book-contact.entity';
import { SmsBatch, SmsBatchAudience } from '../entities/sms-batch.entity';
import {
  SmsDeliveryStatus,
  SmsMessageType,
  SmsOutbox,
  SmsSendStatus,
} from '../entities/sms-outbox.entity';
import {
  SmsUnitPurchase,
  SmsUnitPurchaseStatus,
} from '../entities/sms-unit-purchase.entity';
import { MpesaService } from '../payments/mpesa.service';

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
    @InjectRepository(SmsUnitPurchase)
    private readonly smsUnitPurchaseRepo: Repository<SmsUnitPurchase>,
    @InjectRepository(PlatformSmsConfig)
    private readonly platformSmsConfigRepo: Repository<PlatformSmsConfig>,
    private readonly mpesaService: MpesaService,
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
    const outboxBase = {
      churchId: config.churchId || null,
      batchId: options.batchId || null,
      contributorId: options.contributorId || null,
      createdByUserId: options.createdByUserId || null,
      recipientName: options.recipientName || null,
      isHashedRecipient: false,
      messageType: options.messageType || SmsMessageType.RECEIPT,
      messageBody,
      estimatedUnits: this.estimateGsm7Units(messageBody),
    };

    if (!this.isValidKenyanMobile(cleanPhone)) {
      await this.recordOutboxMessage({
        ...outboxBase,
        recipientMobile: `${phone || ''}`,
        sendStatus: SmsSendStatus.FAILED,
        providerCode: 'invalid_phone',
        providerDescription: 'Invalid recipient phone number',
      });
      this.logger.error(
        `[SMS] Invalid recipient phone for notification | ${this.formatDiagnostics(diagnostics)}`,
      );
      return false;
    }

    if (!resolved.partnerId || !resolved.apiKey || !resolved.shortCode) {
      await this.recordOutboxMessage({
        ...outboxBase,
        recipientMobile: cleanPhone,
        sendStatus: SmsSendStatus.FAILED,
        providerCode: 'missing_sms_config',
        providerDescription: 'SMS sender credentials are not configured',
      });
      this.logger.error(
        `[SMS] Missing notification sender credentials | ${this.formatDiagnostics(diagnostics)}`,
      );
      return false;
    }

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
          ...outboxBase,
          recipientMobile: cleanPhone,
          providerResponse: response.data,
          sendStatus: SmsSendStatus.ACCEPTED,
        });
        this.logger.log(
          `[SMS] Notification sent successfully to ${this.maskPhone(cleanPhone)} | ${this.formatDiagnostics(diagnostics)}`,
        );
        return true;
      }

      await this.recordOutboxMessage({
        ...outboxBase,
        recipientMobile: cleanPhone,
        providerResponse: response.data,
        sendStatus: SmsSendStatus.FAILED,
      });
      this.logger.error(
        `[SMS] Advanta notification error | ${this.formatDiagnostics(diagnostics)} | ${this.describeProviderResponse(response.data)}`,
      );
      return false;
    } catch (e) {
      await this.recordOutboxMessage({
        ...outboxBase,
        recipientMobile: cleanPhone,
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

  async getPlatformBalanceIntelligence() {
    const config = await this.resolveSystemSmsConfig('platform');
    return this.getBalanceIntelligence(config);
  }

  async getBalanceIntelligence(config: ChurchSmsConfig = {}) {
    const balance = await this.getBalance(config);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [last24hUsage, sevenDayUsage, pendingUsage] = await Promise.all([
      this.smsOutboxRepo
        .createQueryBuilder('message')
        .select('COALESCE(SUM(message.estimatedUnits), 0)', 'units')
        .where('message.createdAt >= :since', { since: last24h })
        .getRawOne(),
      this.smsOutboxRepo
        .createQueryBuilder('message')
        .select('COALESCE(SUM(message.estimatedUnits), 0)', 'units')
        .where('message.createdAt >= :since', { since: last7d })
        .getRawOne(),
      this.smsOutboxRepo
        .createQueryBuilder('message')
        .select('COALESCE(SUM(message.estimatedUnits), 0)', 'units')
        .where('message.sendStatus = :status', {
          status: SmsSendStatus.PENDING,
        })
        .getRawOne(),
    ]);

    const last24hUnits = Number(last24hUsage?.units || 0);
    const sevenDayUnits = Number(sevenDayUsage?.units || 0);
    const pendingUnits = Number(pendingUsage?.units || 0);
    const averageDailyUnits = Number((sevenDayUnits / 7).toFixed(1));
    const estimatedDaysRemaining =
      averageDailyUnits > 0
        ? Number((Number(balance || 0) / averageDailyUnits).toFixed(1))
        : null;
    const status =
      Number(balance || 0) <= 0
        ? 'empty'
        : Number(balance || 0) <= pendingUnits
          ? 'low'
          : Number(balance || 0) < 200 ||
              (estimatedDaysRemaining !== null && estimatedDaysRemaining < 2)
            ? 'low'
            : Number(balance || 0) < 1000 ||
                (estimatedDaysRemaining !== null &&
                  estimatedDaysRemaining < 7)
              ? 'watch'
              : 'healthy';
    const label =
      status === 'empty'
        ? 'Empty'
        : status === 'low'
          ? 'Low'
          : status === 'watch'
            ? 'Watch'
            : 'Healthy';
    const hint =
      estimatedDaysRemaining === null
        ? `No recent SMS burn. ${Number(balance || 0).toLocaleString()} units available.`
        : `${Number(balance || 0).toLocaleString()} units available; ${averageDailyUnits.toLocaleString()} avg/day; about ${estimatedDaysRemaining.toLocaleString()} day${estimatedDaysRemaining === 1 ? '' : 's'} remaining.`;

    return {
      balance,
      intelligence: {
        status,
        label,
        hint,
        last24hUnits,
        sevenDayUnits,
        averageDailyUnits,
        estimatedDaysRemaining,
        pendingUnits,
      },
    };
  }

  async sendBulkMessages(
    churchId: string,
    createdByUserId: string,
    body: {
      audience?: SmsBatchAudience;
      audiences?: SmsBatchAudience[];
      genderFilter?: ContributorGender | null;
      message: string;
      pastedContacts?: string;
      addressBookIds?: string[];
      fundAccountIds?: string[];
      smsShortcode?: string;
    },
    options: { batchId?: string | null } = {},
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

    const batch = options.batchId
      ? await this.smsBatchRepo.findOne({
          where: { id: options.batchId, churchId },
        })
      : null;
    const savedBatch = await this.smsBatchRepo.save(
      batch
        ? {
            ...batch,
            createdByUserId,
            audience: this.resolveBatchAudienceLabel(body),
            messageBody,
            recipientCount: preparedRecipients.length,
            totalUnits,
            status: 'sending',
          }
        : this.smsBatchRepo.create({
            churchId,
            createdByUserId,
            audience: this.resolveBatchAudienceLabel(body),
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
            batchId: savedBatch.id,
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
              ? error.response?.data
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
            batchId: savedBatch.id,
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
      where: { batchId: savedBatch.id, sendStatus: SmsSendStatus.FAILED },
    });
    savedBatch.status = failed > 0 ? 'completed_with_failures' : 'completed';
    await this.smsBatchRepo.save(savedBatch);

    return {
      batchId: savedBatch.id,
      recipientCount: savedBatch.recipientCount,
      totalUnits: savedBatch.totalUnits,
      failed,
    };
  }

  async quoteBulkMessages(
    churchId: string,
    body: {
      audience?: SmsBatchAudience;
      audiences?: SmsBatchAudience[];
      genderFilter?: ContributorGender | null;
      message: string;
      pastedContacts?: string;
      addressBookIds?: string[];
      fundAccountIds?: string[];
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
        messageLength: this.getGsm7Length(renderedMessage),
      };
    });
    const totalUnits = preparedRecipients.reduce(
      (sum, recipient) => sum + recipient.estimatedUnits,
      0,
    );
    const unitBreakdown = Array.from(
      preparedRecipients.reduce((map, recipient) => {
        const current = map.get(recipient.estimatedUnits) || {
          unitsPerRecipient: recipient.estimatedUnits,
          recipients: 0,
          totalUnits: 0,
        };
        current.recipients += 1;
        current.totalUnits += recipient.estimatedUnits;
        map.set(recipient.estimatedUnits, current);
        return map;
      }, new Map<number, { unitsPerRecipient: number; recipients: number; totalUnits: number }>()),
    )
      .map(([, value]) => value)
      .sort((a, b) => a.unitsPerRecipient - b.unitsPerRecipient);

    const messageLengths = preparedRecipients.map(
      (recipient) => recipient.messageLength,
    );
    const smsUnitRateKes = Number(church.smsUnitRateKes || 0);

    return {
      audience: this.resolveBatchAudienceLabel(body),
      rawRecipientCount: recipients.length,
      recipientCount: preparedRecipients.length,
      duplicateCount: Math.max(
        0,
        recipients.length - preparedRecipients.length,
      ),
      plainRecipientCount: preparedRecipients.filter(
        (recipient) => !recipient.isHashedRecipient,
      ).length,
      hashedRecipientCount: preparedRecipients.filter(
        (recipient) => recipient.isHashedRecipient,
      ).length,
      templateLength: this.getGsm7Length(messageBody),
      templateUnits: this.estimateGsm7Units(messageBody),
      minRenderedLength:
        messageLengths.length > 0 ? Math.min(...messageLengths) : 0,
      maxRenderedLength:
        messageLengths.length > 0 ? Math.max(...messageLengths) : 0,
      totalUnits,
      unitBreakdown,
      smsUnitRateKes,
      amountKes: Number((totalUnits * smsUnitRateKes).toFixed(2)),
      sampleRecipients: preparedRecipients.slice(0, 5).map((recipient) => ({
        name: recipient.name,
        isHashedRecipient: recipient.isHashedRecipient,
        messageLength: recipient.messageLength,
        estimatedUnits: recipient.estimatedUnits,
        messageBody: recipient.messageBody,
      })),
    };
  }

  async createBulkSmsPurchase(
    churchId: string,
    createdByUserId: string,
    body: {
      audience?: SmsBatchAudience;
      audiences?: SmsBatchAudience[];
      genderFilter?: ContributorGender | null;
      message: string;
      pastedContacts?: string;
      addressBookIds?: string[];
      fundAccountIds?: string[];
      smsShortcode?: string;
      payerPhone?: string;
    },
  ) {
    const payerPhone = this.normalizeKenyanPhone(body.payerPhone || '');
    if (!payerPhone) {
      throw new BadRequestException(
        'Enter a valid M-Pesa phone number for SMS unit payment',
      );
    }

    const quote = await this.quoteBulkMessages(churchId, body);
    if (Number(quote.smsUnitRateKes || 0) <= 0) {
      throw new BadRequestException(
        'SMS unit rate is not configured for this church',
      );
    }
    if (Number(quote.amountKes || 0) <= 0) {
      throw new BadRequestException('SMS unit amount must be greater than zero');
    }

    const activeCutoff = new Date(Date.now() - this.getSmsUnitPaymentTimeoutMs());
    const activePurchase = await this.smsUnitPurchaseRepo.findOne({
      where: {
        churchId,
        createdByUserId,
        payerPhone,
        status: SmsUnitPurchaseStatus.STK_SENT,
        createdAt: MoreThan(activeCutoff),
      },
      order: { createdAt: 'DESC' },
    });
    if (activePurchase) {
      this.logger.warn(
        `[SMS] Reusing active SMS unit STK request instead of starting duplicate | purchase=${activePurchase.id} | church=${churchId} | user=${createdByUserId} | phone=${this.maskPhone(payerPhone)}`,
      );
      return this.sanitizeSmsUnitPurchase(activePurchase);
    }

    const messagePayload = {
      audiences: body.audiences || [],
      genderFilter: body.genderFilter || null,
      message: body.message,
      pastedContacts: body.pastedContacts || '',
      addressBookIds: Array.isArray(body.addressBookIds)
        ? body.addressBookIds
        : [],
      fundAccountIds: Array.isArray(body.fundAccountIds)
        ? body.fundAccountIds
        : [],
      smsShortcode: body.smsShortcode || '',
    };

    const batch = await this.smsBatchRepo.save(
      this.smsBatchRepo.create({
        churchId,
        createdByUserId,
        audience: quote.audience,
        messageBody: this.sanitizeGsm7(body.message || ''),
        recipientCount: quote.recipientCount,
        totalUnits: quote.totalUnits,
        status: 'awaiting_payment',
      }),
    );

    let purchase = await this.smsUnitPurchaseRepo.save(
      this.smsUnitPurchaseRepo.create({
        churchId,
        createdByUserId,
        batchId: batch.id,
        messagePayload,
        quoteSnapshot: quote,
        recipientCount: quote.recipientCount,
        totalUnits: quote.totalUnits,
        smsUnitRateKes: quote.smsUnitRateKes,
        amountKes: quote.amountKes,
        payerPhone,
        status: SmsUnitPurchaseStatus.STK_SENT,
        statusDescription: 'Preparing M-Pesa STK push',
      }),
    );

    try {
      const mpesaConfig = await this.getPlatformMpesaConfigForSmsPurchases();
      const stkResponse = await this.mpesaService.stkPush(
        payerPhone,
        Number(quote.amountKes),
        `SMS-${purchase.id.slice(0, 8)}`,
        `SMS units for ${quote.recipientCount} recipients`,
        mpesaConfig,
      );

      purchase.checkoutRequestId = stkResponse.CheckoutRequestID || null;
      purchase.merchantRequestId = stkResponse.MerchantRequestID || null;
      purchase.statusDescription =
        'STK push sent. Complete the M-Pesa prompt on the payment phone. This usually confirms within a few seconds; you can retry if no confirmation arrives in about 3 minutes.';
      purchase.providerRawResponse = {
        ...(purchase.providerRawResponse || {}),
        stkPush: stkResponse,
      };
      purchase = await this.smsUnitPurchaseRepo.save(purchase);

      return this.sanitizeSmsUnitPurchase(purchase);
    } catch (error) {
      const failureMessage = this.getExceptionMessage(
        error,
        'Unable to initiate SMS unit STK push',
      );
      purchase.status = SmsUnitPurchaseStatus.FAILED;
      purchase.statusDescription = failureMessage;
      purchase.providerRawResponse = {
        ...(purchase.providerRawResponse || {}),
        stkPushError: axios.isAxiosError(error)
          ? error.response?.data || error.message
          : `${error}`,
      };
      await this.smsUnitPurchaseRepo.save(purchase);
      await this.smsBatchRepo.save({ ...batch, status: 'payment_failed' });
      throw new BadRequestException(failureMessage);
    }
  }

  async getSmsUnitPurchase(churchId: string, purchaseId: string) {
    let purchase = await this.smsUnitPurchaseRepo.findOne({
      where: { id: purchaseId, churchId },
    });
    if (!purchase) {
      throw new BadRequestException('SMS unit purchase not found');
    }
    purchase = await this.expireStaleSmsUnitPurchase(purchase);
    return this.sanitizeSmsUnitPurchase(purchase);
  }

  async sendConfirmedSmsUnitPurchase(
    churchId: string,
    performedByUserId: string,
    purchaseId: string,
  ) {
    const purchase = await this.smsUnitPurchaseRepo.findOne({
      where: { id: purchaseId, churchId },
    });
    if (!purchase) {
      throw new BadRequestException('SMS unit purchase not found');
    }
    if (purchase.status === SmsUnitPurchaseStatus.SENT) {
      return this.sanitizeSmsUnitPurchase(purchase);
    }
    if (purchase.status !== SmsUnitPurchaseStatus.CONFIRMED) {
      throw new BadRequestException(
        'SMS unit payment must be confirmed before sending',
      );
    }

    purchase.status = SmsUnitPurchaseStatus.SENDING;
    purchase.statusDescription = 'Payment confirmed. Sending bulk SMS.';
    await this.smsUnitPurchaseRepo.save(purchase);

    try {
      const result = await this.sendBulkMessages(
        churchId,
        purchase.createdByUserId || performedByUserId,
        purchase.messagePayload as any,
        { batchId: purchase.batchId },
      );
      purchase.status = SmsUnitPurchaseStatus.SENT;
      purchase.statusDescription = `Bulk SMS sent to ${result.recipientCount} recipients`;
      purchase.sentAt = new Date();
      purchase.providerRawResponse = {
        ...(purchase.providerRawResponse || {}),
        sendResult: result,
      };
      await this.smsUnitPurchaseRepo.save(purchase);
      return this.sanitizeSmsUnitPurchase(purchase);
    } catch (error) {
      purchase.status = SmsUnitPurchaseStatus.SEND_FAILED;
      purchase.statusDescription =
        error?.message || 'Payment confirmed, but SMS sending failed';
      purchase.providerRawResponse = {
        ...(purchase.providerRawResponse || {}),
        sendError: `${error?.message || error}`,
      };
      await this.smsUnitPurchaseRepo.save(purchase);
      if (purchase.batchId) {
        await this.smsBatchRepo.save({
          id: purchase.batchId,
          status: 'send_failed',
        });
      }
      throw new BadRequestException(purchase.statusDescription);
    }
  }

  async handleSmsUnitPurchaseMpesaWebhook(body: any) {
    const callback = body?.Body?.stkCallback;
    if (!callback?.CheckoutRequestID) {
      this.logger.warn('Ignored SMS unit payment webhook without CheckoutRequestID');
      return { ResultCode: 0, ResultDesc: 'Ignored' };
    }

    const purchase = await this.smsUnitPurchaseRepo.findOne({
      where: { checkoutRequestId: callback.CheckoutRequestID },
    });
    if (!purchase) {
      this.logger.warn(
        `No SMS unit purchase matched checkoutRequestId=${callback.CheckoutRequestID}`,
      );
      return { ResultCode: 0, ResultDesc: 'SMS unit purchase not found' };
    }
    if (
      [
        SmsUnitPurchaseStatus.CONFIRMED,
        SmsUnitPurchaseStatus.SENDING,
        SmsUnitPurchaseStatus.SENT,
      ].includes(purchase.status)
    ) {
      return { ResultCode: 0, ResultDesc: 'Already processed' };
    }

    purchase.providerRawResponse = {
      ...(purchase.providerRawResponse || {}),
      stkCallback: body,
    };

    if (Number(callback.ResultCode) === 0) {
      const metadataItems = callback.CallbackMetadata?.Item || [];
      for (const item of metadataItems) {
        if (item.Name === 'MpesaReceiptNumber') {
          purchase.mpesaReceipt = `${item.Value || ''}`;
        }
        if (item.Name === 'PhoneNumber') {
          purchase.payerPhone = `${item.Value || purchase.payerPhone}`;
        }
        if (item.Name === 'Amount') {
          purchase.amountKes = Number(item.Value || purchase.amountKes);
        }
      }
      purchase.status = SmsUnitPurchaseStatus.CONFIRMED;
      purchase.statusDescription = 'SMS unit payment confirmed';
      purchase.paidAt = new Date();
      await this.smsUnitPurchaseRepo.save(purchase);
      if (purchase.batchId) {
        await this.smsBatchRepo.save({
          id: purchase.batchId,
          status: 'payment_confirmed',
        });
      }
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    purchase.status = SmsUnitPurchaseStatus.FAILED;
    purchase.statusDescription =
      callback.ResultDesc || 'SMS unit payment failed';
    await this.smsUnitPurchaseRepo.save(purchase);
    if (purchase.batchId) {
      await this.smsBatchRepo.save({
        id: purchase.batchId,
        status: 'payment_failed',
      });
    }
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async handleSmsUnitPurchaseC2BValidation(payload: {
    billRefNumber?: string | null;
    amount?: number | null;
  }) {
    if (!this.extractSmsUnitPurchaseReferenceToken(payload.billRefNumber)) {
      return null;
    }

    const purchase = await this.findSmsUnitPurchaseByC2BReference(
      payload.billRefNumber,
    );
    if (!purchase) {
      this.logger.warn(
        `[SMS] Rejected SMS unit C2B validation; no purchase matched ref=${payload.billRefNumber || 'n/a'}`,
      );
      return {
        ResultCode: 1,
        ResultDesc: 'SMS unit purchase not found',
      };
    }

    const paidAmount = Number(payload.amount || 0);
    const expectedAmount = Number(purchase.amountKes || 0);
    if (
      Number.isFinite(paidAmount) &&
      Number.isFinite(expectedAmount) &&
      paidAmount > 0 &&
      expectedAmount > 0 &&
      paidAmount + 0.01 < expectedAmount
    ) {
      this.logger.warn(
        `[SMS] Rejected SMS unit C2B validation for purchase=${purchase.id}; paid=${paidAmount} expected=${expectedAmount}`,
      );
      return {
        ResultCode: 1,
        ResultDesc: 'SMS unit payment amount is below expected amount',
      };
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async handleSmsUnitPurchaseC2BConfirmation(payload: {
    transId?: string | null;
    amount?: number | null;
    billRefNumber?: string | null;
    phone?: string | null;
    phoneForContributor?: string | null;
    customerName?: string | null;
    shortcode?: string | null;
    receivedAt?: Date | null;
    raw?: any;
  }) {
    if (!this.extractSmsUnitPurchaseReferenceToken(payload.billRefNumber)) {
      return null;
    }

    const purchase = await this.findSmsUnitPurchaseByC2BReference(
      payload.billRefNumber,
    );
    if (!purchase) {
      this.logger.warn(
        `[SMS] SMS unit C2B confirmation ignored; no purchase matched ref=${payload.billRefNumber || 'n/a'} receipt=${payload.transId || 'n/a'}`,
      );
      return { ResultCode: 0, ResultDesc: 'SMS unit purchase not found' };
    }

    if (
      [
        SmsUnitPurchaseStatus.CONFIRMED,
        SmsUnitPurchaseStatus.SENDING,
        SmsUnitPurchaseStatus.SENT,
      ].includes(purchase.status)
    ) {
      return { ResultCode: 0, ResultDesc: 'Already processed' };
    }

    const paidAmount = Number(payload.amount || 0);
    const expectedAmount = Number(purchase.amountKes || 0);
    purchase.providerRawResponse = {
      ...(purchase.providerRawResponse || {}),
      c2bConfirmation: payload.raw || payload,
    };

    if (
      Number.isFinite(paidAmount) &&
      Number.isFinite(expectedAmount) &&
      paidAmount > 0 &&
      expectedAmount > 0 &&
      paidAmount + 0.01 < expectedAmount
    ) {
      purchase.status = SmsUnitPurchaseStatus.FAILED;
      purchase.statusDescription = `SMS unit payment amount mismatch. Paid KES ${paidAmount}, expected KES ${expectedAmount}`;
      await this.smsUnitPurchaseRepo.save(purchase);
      if (purchase.batchId) {
        await this.smsBatchRepo.save({
          id: purchase.batchId,
          status: 'payment_failed',
        });
      }
      this.logger.warn(
        `[SMS] SMS unit C2B payment amount mismatch | purchase=${purchase.id} | paid=${paidAmount} | expected=${expectedAmount} | receipt=${payload.transId || 'n/a'}`,
      );
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    purchase.status = SmsUnitPurchaseStatus.CONFIRMED;
    purchase.statusDescription = 'SMS unit payment confirmed';
    purchase.mpesaReceipt = payload.transId || purchase.mpesaReceipt;
    const safePayerPhone =
      payload.phoneForContributor ||
      (payload.phone && `${payload.phone}`.length <= 30
        ? `${payload.phone}`
        : null);
    if (safePayerPhone) {
      purchase.payerPhone = safePayerPhone;
    }
    if (Number.isFinite(paidAmount) && paidAmount > 0) {
      purchase.amountKes = paidAmount;
    }
    purchase.paidAt = payload.receivedAt || new Date();

    await this.smsUnitPurchaseRepo.save(purchase);
    if (purchase.batchId) {
      await this.smsBatchRepo.save({
        id: purchase.batchId,
        status: 'payment_confirmed',
      });
    }

    this.logger.log(
      `[SMS] SMS unit payment confirmed from C2B | purchase=${purchase.id} | church=${purchase.churchId} | receipt=${payload.transId || 'n/a'} | ref=${payload.billRefNumber || 'n/a'} | amount=${paidAmount || purchase.amountKes}`,
    );

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  async listOutbox(churchId: string, query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 100);
    const qb = this.buildOutboxQuery(churchId, query);
    const [items, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  private async findSmsUnitPurchaseByC2BReference(
    reference?: string | null,
  ) {
    const token = this.extractSmsUnitPurchaseReferenceToken(reference);
    if (!token) {
      return null;
    }

    return this.smsUnitPurchaseRepo
      .createQueryBuilder('purchase')
      .where('purchase.id LIKE :prefix', { prefix: `${token}%` })
      .orderBy('purchase.createdAt', 'DESC')
      .getOne();
  }

  private extractSmsUnitPurchaseReferenceToken(reference?: string | null) {
    const match = `${reference || ''}`.trim().match(/^SMS-([a-f0-9]{8})$/i);
    return match?.[1]?.toLowerCase() || null;
  }

  async listOutboxRows(churchId: string, query: any = {}) {
    return this.buildOutboxQuery(churchId, query).getMany();
  }

  async listOutboxRecipients(churchId: string, query: any = {}) {
    const search = `${query.search || ''}`.trim();
    if (search.length < 2) {
      return [];
    }
    const rows = await this.smsOutboxRepo
      .createQueryBuilder('message')
      .leftJoin('message.contributor', 'contributor')
      .select('message.contributorId', 'contributorId')
      .addSelect('message.recipientMobile', 'recipientMobile')
      .addSelect(
        "COALESCE(MAX(message.recipientName), MAX(contributor.name), 'Recipient')",
        'recipientName',
      )
      .addSelect('COUNT(message.id)', 'messageCount')
      .addSelect('MAX(message.createdAt)', 'lastMessageAt')
      .where('message.churchId = :churchId', { churchId })
      .andWhere(
        '(message.recipientName LIKE :search OR contributor.name LIKE :search OR message.recipientMobile LIKE :search)',
        { search: `%${search}%` },
      )
      .groupBy('message.contributorId')
      .addGroupBy('message.recipientMobile')
      .orderBy('lastMessageAt', 'DESC')
      .limit(10)
      .getRawMany();

    return rows.map((row: any) => ({
      recipientKey: this.encodeOutboxRecipientKey(
        row.contributorId
          ? { type: 'contributor', value: row.contributorId }
          : { type: 'mobile', value: row.recipientMobile },
      ),
      recipientName: row.recipientName || 'Recipient',
      recipientMobile:
        `${row.recipientMobile || ''}`.length >= 32
          ? null
          : row.recipientMobile || null,
      isHashedRecipient: `${row.recipientMobile || ''}`.length >= 32,
      messageCount: Number(row.messageCount || 0),
      lastMessageAt: row.lastMessageAt || null,
    }));
  }

  private buildOutboxQuery(churchId: string, query: any = {}) {
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
    if (`${query.search || ''}`.trim()) {
      qb.andWhere(
        '(message.recipientName LIKE :search OR contributor.name LIKE :search OR message.recipientMobile LIKE :search)',
        { search: `%${`${query.search}`.trim()}%` },
      );
    }
    if (query.recipientKey) {
      const recipient = this.decodeOutboxRecipientKey(query.recipientKey);
      if (recipient.type === 'contributor') {
        qb.andWhere('message.contributorId = :recipientContributorId', {
          recipientContributorId: recipient.value,
        });
      } else {
        qb.andWhere('message.recipientMobile = :recipientMobile', {
          recipientMobile: recipient.value,
        });
      }
    }

    return qb;
  }

  private encodeOutboxRecipientKey(input: {
    type: 'contributor' | 'mobile';
    value: string;
  }) {
    return Buffer.from(`${input.type}:${input.value}`, 'utf8').toString(
      'base64url',
    );
  }

  private decodeOutboxRecipientKey(value: unknown) {
    try {
      const decoded = Buffer.from(`${value || ''}`, 'base64url').toString(
        'utf8',
      );
      const separator = decoded.indexOf(':');
      const type = decoded.slice(0, separator);
      const recipientValue = decoded.slice(separator + 1);
      if (
        (type !== 'contributor' && type !== 'mobile') ||
        !recipientValue
      ) {
        throw new Error('Invalid recipient key');
      }
      return {
        type: type as 'contributor' | 'mobile',
        value: recipientValue,
      };
    } catch {
      throw new BadRequestException('Invalid outbox recipient');
    }
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

  async fetchOutboxDeliveryReport(churchId: string, messageId: string) {
    const outbox = await this.smsOutboxRepo.findOne({
      where: { id: messageId, churchId },
    });
    if (!outbox) {
      throw new BadRequestException('SMS outbox message not found');
    }

    return this.fetchDeliveryReportForOutboxRow(outbox);
  }

  async refreshPendingDeliveryReports(
    churchId: string,
    query: { batchId?: string; limit?: number; hashedOnly?: boolean } = {},
  ) {
    const limit = Math.max(1, Math.min(100, Number(query.limit || 50)));
    const qb = this.smsOutboxRepo
      .createQueryBuilder('message')
      .where('message.churchId = :churchId', { churchId })
      .andWhere('message.sendStatus = :sendStatus', {
        sendStatus: SmsSendStatus.ACCEPTED,
      })
      .andWhere('message.providerMessageId IS NOT NULL')
      .andWhere('message.deliveryStatus IN (:...statuses)', {
        statuses: [SmsDeliveryStatus.PENDING, SmsDeliveryStatus.UNKNOWN],
      })
      .orderBy('message.createdAt', 'ASC')
      .take(limit);

    if (query.batchId) {
      qb.andWhere('message.batchId = :batchId', { batchId: query.batchId });
    }
    if (query.hashedOnly) {
      qb.andWhere('message.isHashedRecipient = :hashedOnly', {
        hashedOnly: true,
      });
    }

    const rows = await qb.getMany();
    const results: Array<{
      id: string;
      providerMessageId: string | null;
      deliveryStatus: SmsDeliveryStatus;
      deliveryDescription: string | null;
      deliveryTat?: string | null;
      providerCode: string;
    }> = [];
    for (const row of rows) {
      results.push(await this.fetchDeliveryReportForOutboxRow(row));
    }

    return {
      checked: results.length,
      delivered: results.filter(
        (item: any) => item.deliveryStatus === SmsDeliveryStatus.DELIVERED,
      ).length,
      failed: results.filter(
        (item: any) => item.deliveryStatus === SmsDeliveryStatus.FAILED,
      ).length,
      pending: results.filter(
        (item: any) => item.deliveryStatus === SmsDeliveryStatus.PENDING,
      ).length,
      unknown: results.filter(
        (item: any) => item.deliveryStatus === SmsDeliveryStatus.UNKNOWN,
      ).length,
      results,
    };
  }

  private async fetchDeliveryReportForOutboxRow(row: SmsOutbox) {
    if (!row.providerMessageId) {
      throw new BadRequestException('SMS message does not have a provider ID');
    }

    const church = await this.churchRepo.findOne({
      where: { id: row.churchId },
    });
    if (!church) {
      throw new BadRequestException('Church not found for SMS message');
    }

    const resolved = this.resolveConfig(this.getConfigFromChurch(church));
    const url = `${resolved.baseUrl}/api/services/getdlr`;
    const data = {
      apikey: resolved.apiKey,
      partnerID: resolved.partnerId,
      messageID: row.providerMessageId,
    };

    try {
      this.logger.log(
        `[SMS] Fetching DLR for messageId=${this.maskSecret(row.providerMessageId)} | outboxId=${row.id} | batchId=${row.batchId || 'n/a'}`,
      );
      const response = await axios.post(url, data, { timeout: 10000 });
      const providerCode = `${response.data?.['response-code'] || ''}`;
      const deliveryDescription =
        response.data?.['delivery-description'] ||
        response.data?.['response-description'] ||
        null;
      const deliveryStatus =
        Number(providerCode) === 200
          ? this.mapDeliveryStatus(deliveryDescription)
          : Number(providerCode) === 1009
            ? SmsDeliveryStatus.PENDING
            : SmsDeliveryStatus.UNKNOWN;

      const updated = await this.smsOutboxRepo.save({
        ...row,
        deliveryStatus,
        deliveryDescription:
          deliveryDescription ||
          (Number(providerCode) === 1009 ? 'No dlr' : row.deliveryDescription),
        deliveryTat: response.data?.['delivery-tat'] || row.deliveryTat,
        deliveryReportedAt:
          response.data?.['delivery-time'] || response.data?.timestamp
            ? new Date(
                response.data?.['delivery-time'] || response.data?.timestamp,
              )
            : new Date(),
        providerRawResponse: {
          ...(row.providerRawResponse || {}),
          fetchedDlr: response.data,
        },
      });

      return {
        id: updated.id,
        providerMessageId: updated.providerMessageId,
        deliveryStatus: updated.deliveryStatus,
        deliveryDescription: updated.deliveryDescription,
        deliveryTat: updated.deliveryTat,
        providerCode,
      };
    } catch (error) {
      await this.smsOutboxRepo.save({
        ...row,
        deliveryStatus: SmsDeliveryStatus.UNKNOWN,
        deliveryDescription: 'DLR fetch failed',
        providerRawResponse: {
          ...(row.providerRawResponse || {}),
          fetchedDlrError: axios.isAxiosError(error)
            ? error.response?.data || error.message
            : `${error}`,
        },
      });
      this.logger.error(
        `[SMS] Failed to fetch DLR for messageId=${this.maskSecret(row.providerMessageId)} | outboxId=${row.id} | ${this.describeAxiosError(error)}`,
      );
      return {
        id: row.id,
        providerMessageId: row.providerMessageId,
        deliveryStatus: SmsDeliveryStatus.UNKNOWN,
        deliveryDescription: 'DLR fetch failed',
        providerCode: axios.isAxiosError(error)
          ? `${error.response?.status || 'error'}`
          : 'error',
      };
    }
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
    return length <= 160 ? 1 : Math.ceil(length / 153);
  }

  public getGsm7Length(text: string) {
    return this.sanitizeGsm7(text).length;
  }

  public async resolveSystemSmsConfig(
    churchId: string,
  ): Promise<ChurchSmsConfig> {
    return (
      (await this.getPlatformSmsConfig(churchId)) ||
      this.getSystemSmsConfigFromEnv(churchId) || { churchId }
    );
  }

  public async getPlatformSmsConfigForAdmin() {
    const config = await this.platformSmsConfigRepo.findOne({
      where: { id: PLATFORM_SMS_CONFIG_ID },
    });
    const envConfigured = Boolean(this.getSystemSmsConfigFromEnv('platform'));
    const configured = Boolean(
      config?.smsPartnerId && config?.smsApiKey && config?.smsShortcode,
    );

    return {
      smsPartnerId: config?.smsPartnerId || '',
      smsApiKey: config?.smsApiKey || '',
      smsShortcode: config?.smsShortcode || '',
      smsBaseUrl: config?.smsBaseUrl || this.baseUrl,
      mpesaEnvironment: config?.mpesaEnvironment || 'sandbox',
      mpesaConsumerKey: config?.mpesaConsumerKey || '',
      mpesaConsumerSecret: config?.mpesaConsumerSecret || '',
      mpesaPasskey: config?.mpesaPasskey || '',
      mpesaShortcode: config?.mpesaShortcode || '',
      mpesaCallbackUrl:
        config?.mpesaCallbackUrl ||
        this.configService.get<string>('SMS_UNITS_MPESA_CALLBACK_URL') ||
        '',
      mpesaConfigured: Boolean(
        config?.mpesaConsumerKey &&
          config?.mpesaConsumerSecret &&
          config?.mpesaPasskey &&
          config?.mpesaShortcode &&
          (config?.mpesaCallbackUrl ||
            this.configService.get<string>('SMS_UNITS_MPESA_CALLBACK_URL')),
      ),
      configured,
      fallbackConfigured: !configured && envConfigured,
      source: configured ? 'platform' : envConfigured ? 'env' : 'missing',
    };
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

  private getSystemSmsConfigFromEnv(churchId: string): ChurchSmsConfig | null {
    const smsPartnerId =
      this.configService.get<string>('SYSTEM_SMS_PARTNER_ID') ||
      this.configService.get<string>('PLATFORM_SMS_PARTNER_ID') ||
      this.configService.get<string>('ADVANTA_PARTNER_ID');
    const smsApiKey =
      this.configService.get<string>('SYSTEM_SMS_API_KEY') ||
      this.configService.get<string>('PLATFORM_SMS_API_KEY') ||
      this.configService.get<string>('ADVANTA_API_KEY');
    const smsShortcode =
      this.configService.get<string>('SYSTEM_SMS_SHORTCODE') ||
      this.configService.get<string>('PLATFORM_SMS_SHORTCODE') ||
      this.configService.get<string>('ADVANTA_SHORTCODE');

    if (!smsPartnerId || !smsApiKey || !smsShortcode) {
      return null;
    }

    return {
      churchId,
      smsPartnerId,
      smsApiKey,
      smsShortcode,
      smsConfigSource: 'env',
      smsBaseUrl:
        this.configService.get<string>('SYSTEM_SMS_BASE_URL') ||
        this.configService.get<string>('PLATFORM_SMS_BASE_URL') ||
        this.configService.get<string>('ADVANTA_BASE_URL') ||
        undefined,
    };
  }

  private async getPlatformSmsConfig(
    churchId: string,
  ): Promise<ChurchSmsConfig | null> {
    const config = await this.platformSmsConfigRepo.findOne({
      where: { id: PLATFORM_SMS_CONFIG_ID },
    });

    if (!config?.smsPartnerId || !config?.smsApiKey || !config?.smsShortcode) {
      return null;
    }

    return {
      churchId,
      smsPartnerId: config.smsPartnerId,
      smsApiKey: config.smsApiKey,
      smsShortcode: config.smsShortcode,
      smsBaseUrl: config.smsBaseUrl || undefined,
      smsConfigSource: 'platform',
    };
  }

  private async getPlatformMpesaConfigForSmsPurchases(): Promise<ChurchMpesaConfig> {
    const config = await this.platformSmsConfigRepo.findOne({
      where: { id: PLATFORM_SMS_CONFIG_ID },
    });
    const callbackUrl =
      config?.mpesaCallbackUrl ||
      this.configService.get<string>('SMS_UNITS_MPESA_CALLBACK_URL') ||
      this.configService.get<string>('PLATFORM_MPESA_CALLBACK_URL') ||
      undefined;

    const mpesaConfig = {
      mpesaEnvironment:
        config?.mpesaEnvironment ||
        this.configService.get<string>('PLATFORM_MPESA_ENV') ||
        this.configService.get<string>('MPESA_ENV') ||
        'sandbox',
      mpesaConsumerKey:
        config?.mpesaConsumerKey ||
        this.configService.get<string>('PLATFORM_MPESA_CONSUMER_KEY') ||
        undefined,
      mpesaConsumerSecret:
        config?.mpesaConsumerSecret ||
        this.configService.get<string>('PLATFORM_MPESA_CONSUMER_SECRET') ||
        undefined,
      mpesaPasskey:
        config?.mpesaPasskey ||
        this.configService.get<string>('PLATFORM_MPESA_PASSKEY') ||
        undefined,
      mpesaShortcode:
        config?.mpesaShortcode ||
        this.configService.get<string>('PLATFORM_MPESA_SHORTCODE') ||
        undefined,
      mpesaCallbackUrl: callbackUrl,
    };

    this.mpesaService.assertConfigured(mpesaConfig);
    return mpesaConfig;
  }

  private sanitizeSmsUnitPurchase(purchase: SmsUnitPurchase) {
    return {
      id: purchase.id,
      churchId: purchase.churchId,
      batchId: purchase.batchId,
      recipientCount: purchase.recipientCount,
      totalUnits: purchase.totalUnits,
      smsUnitRateKes: Number(purchase.smsUnitRateKes || 0),
      amountKes: Number(purchase.amountKes || 0),
      payerPhone: purchase.payerPhone,
      checkoutRequestId: purchase.checkoutRequestId,
      merchantRequestId: purchase.merchantRequestId,
      mpesaReceipt: purchase.mpesaReceipt,
      status: purchase.status,
      statusDescription: purchase.statusDescription,
      quoteSnapshot: purchase.quoteSnapshot,
      paidAt: purchase.paidAt,
      sentAt: purchase.sentAt,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
    };
  }

  private async expireStaleSmsUnitPurchase(purchase: SmsUnitPurchase) {
    if (purchase.status !== SmsUnitPurchaseStatus.STK_SENT) {
      return purchase;
    }

    const createdAtMs = new Date(purchase.createdAt || Date.now()).getTime();
    if (!Number.isFinite(createdAtMs)) {
      return purchase;
    }

    const timeoutMs = this.getSmsUnitPaymentTimeoutMs();
    if (Date.now() - createdAtMs < timeoutMs) {
      return purchase;
    }

    purchase.status = SmsUnitPurchaseStatus.FAILED;
    purchase.statusDescription =
      'No M-Pesa confirmation was received in time. If you completed payment, wait a moment and refresh; otherwise retry the payment.';

    const saved = await this.smsUnitPurchaseRepo.save(purchase);
    if (saved.batchId) {
      await this.smsBatchRepo.save({
        id: saved.batchId,
        status: 'payment_failed',
      });
    }
    this.logger.warn(
      `[SMS] SMS unit payment timed out while polling | purchase=${saved.id} | church=${saved.churchId} | checkout=${saved.checkoutRequestId || 'n/a'}`,
    );

    return saved;
  }

  private getSmsUnitPaymentTimeoutMs() {
    const seconds = Number(
      this.configService.get<string>('SMS_UNIT_PAYMENT_TIMEOUT_SECONDS') ||
        process.env.SMS_UNIT_PAYMENT_TIMEOUT_SECONDS ||
        180,
    );
    const safeSeconds = Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, 60), 900)
      : 180;
    return safeSeconds * 1000;
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
        providerDescription: input.providerDescription || provider.description,
        providerRawResponse: input.providerResponse || null,
        sentAt: input.sendStatus === SmsSendStatus.ACCEPTED ? new Date() : null,
      }),
    );
  }

  private extractProviderResult(data: any) {
    const nested = data?.responses?.[0];
    const messageId =
      nested?.messageid ||
      nested?.messageID ||
      nested?.['message-id'] ||
      data?.messageid ||
      data?.messageID ||
      data?.['message-id'];
    const clientSmsId =
      nested?.clientsmsid ||
      nested?.clientSmsId ||
      data?.clientsmsid ||
      data?.clientSmsId;

    return {
      code:
        `${nested?.['response-code'] ?? data?.['response-code'] ?? ''}` || null,
      description:
        nested?.['response-description'] ??
        data?.['response-description'] ??
        null,
      messageId: messageId ? `${messageId}` : null,
      clientSmsId: clientSmsId ? `${clientSmsId}` : null,
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
        const response = byClientSmsId.get(
          clientSmsIdByRowId.get(row.id) || row.id,
        );
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

  private async sendHashedOutboxRow(
    row: SmsOutbox,
    resolved: ResolvedSmsConfig,
  ) {
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
      this.logger.log(
        `[SMS] Sending hashed bulk message to ${this.maskHashedMobile(row.recipientMobile)} | batchId=${row.batchId || 'n/a'} | partnerId=${this.maskSecret(resolved.partnerId)} | shortcode=${this.maskSecret(resolved.shortCode)} | baseUrl=${resolved.baseUrl}`,
      );
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

      if (success) {
        this.logger.log(
          `[SMS] Hashed bulk message accepted for ${this.maskHashedMobile(row.recipientMobile)} | batchId=${row.batchId || 'n/a'} | messageId=${provider.messageId || 'n/a'} | providerCode=${provider.code || 'n/a'} | providerDescription=${provider.description || 'n/a'}`,
        );
      } else {
        this.logger.error(
          `[SMS] Hashed bulk message rejected for ${this.maskHashedMobile(row.recipientMobile)} | batchId=${row.batchId || 'n/a'} | providerCode=${provider.code || 'n/a'} | providerDescription=${provider.description || 'n/a'}`,
        );
      }
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
          ? error.response?.data
          : null,
      });
      this.logger.error(
        `[SMS] Failed to send hashed bulk message to ${this.maskHashedMobile(row.recipientMobile)} | batchId=${row.batchId || 'n/a'} | ${this.describeAxiosError(error)}`,
      );
    }
  }

  private async resolveBulkRecipients(
    churchId: string,
    body: {
      audience?: SmsBatchAudience;
      audiences?: SmsBatchAudience[];
      genderFilter?: ContributorGender | null;
      pastedContacts?: string;
      addressBookIds?: string[];
      fundAccountIds?: string[];
    },
  ): Promise<BulkRecipient[]> {
    const recipients: BulkRecipient[] = [];
    const audiences = this.resolveBulkAudiences(body);
    const genderFilter = this.normalizeGender(body.genderFilter || '');

    for (const audience of audiences) {
      recipients.push(
        ...(await this.resolveContributorRecipients(
          churchId,
          audience,
          genderFilter,
        )),
      );
    }

    const fundAccountIds = Array.isArray(body.fundAccountIds)
      ? Array.from(new Set(body.fundAccountIds.filter(Boolean)))
      : [];
    if (fundAccountIds.length > 0) {
      recipients.push(
        ...(await this.resolveFundAccountRecipients(
          churchId,
          fundAccountIds,
          genderFilter,
        )),
      );
    }

    const addressBookIds = Array.isArray(body.addressBookIds)
      ? body.addressBookIds.filter(Boolean)
      : [];
    if (addressBookIds.length > 0) {
      recipients.push(
        ...(await this.resolveAddressBookRecipients(
          churchId,
          addressBookIds,
          genderFilter,
        )),
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
    genderFilter: ContributorGender | null = null,
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
    if (audience === SmsBatchAudience.ALL_CONTRIBUTORS && genderFilter) {
      where.gender = genderFilter;
    }

    const contributors = await this.contributorRepo.find({ where });
    return this.mapContributorsToBulkRecipients(churchId, contributors);
  }

  private async resolveFundAccountRecipients(
    churchId: string,
    fundAccountIds: string[],
    genderFilter: ContributorGender | null = null,
  ): Promise<BulkRecipient[]> {
    if (fundAccountIds.length === 0) {
      return [];
    }

    const qb = this.contributorRepo
      .createQueryBuilder('contributor')
      .innerJoin(
        'contributor.contributions',
        'contribution',
        [
          'contribution.churchId = :churchId',
          'contribution.fundAccountId IN (:...fundAccountIds)',
          'contribution.status = :status',
        ].join(' AND '),
        {
          churchId,
          fundAccountIds,
          status: ContributionStatus.CONFIRMED,
        },
      )
      .where('contributor.churchId = :churchId', { churchId })
      .distinct(true);

    if (genderFilter) {
      qb.andWhere('contributor.gender = :genderFilter', { genderFilter });
    }

    const contributors = await qb.getMany();
    return this.mapContributorsToBulkRecipients(churchId, contributors);
  }

  private async resolveAddressBookRecipients(
    churchId: string,
    addressBookIds: string[],
    genderFilter: ContributorGender | null = null,
  ): Promise<BulkRecipient[]> {
    if (addressBookIds.length === 0) {
      return [];
    }

    const contactsQb = this.addressBookContactRepo
      .createQueryBuilder('contact')
      .innerJoin('contact.addressBook', 'addressBook')
      .where('contact.churchId = :churchId', { churchId })
      .andWhere('contact.addressBookId IN (:...addressBookIds)', {
        addressBookIds,
      })
      .andWhere('addressBook.isActive = :isActive', { isActive: true });

    if (genderFilter) {
      contactsQb.andWhere('contact.gender = :genderFilter', {
        genderFilter,
      });
    }

    const contacts = await contactsQb.getMany();

    return contacts
      .map((contact) => ({
        contributorId: null,
        name: contact.displayName,
        firstName:
          contact.firstName || this.extractFirstName(contact.displayName || ''),
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
        const genderIndex = commaParts.findIndex((part, index) => {
          return index !== phoneIndex && Boolean(this.normalizeGender(part));
        });
        const nameParts = commaParts.filter(
          (_, index) => index !== phoneIndex && index !== genderIndex,
        );
        const name = nameParts.join(' ').trim() || null;
        return {
          name,
          firstName: this.extractFirstName(name || ''),
          phone,
          gender:
            genderIndex >= 0
              ? this.normalizeGender(commaParts[genderIndex])
              : null,
        };
      }
    }

    const tokens = value.split(/\s+/).filter(Boolean);
    const phoneIndex = tokens.findIndex((token) =>
      Boolean(this.normalizeKenyanPhone(token)),
    );

    if (phoneIndex >= 0) {
      const genderIndex = tokens.findIndex((token, index) => {
        return index !== phoneIndex && Boolean(this.normalizeGender(token));
      });
      const phone = tokens[phoneIndex];
      const name = tokens
        .filter((_, index) => index !== phoneIndex && index !== genderIndex)
        .join(' ');
      return {
        name: name || null,
        firstName: this.extractFirstName(name),
        phone,
        gender:
          genderIndex >= 0 ? this.normalizeGender(tokens[genderIndex]) : null,
      };
    }

    return {
      name: null,
      firstName: null,
      phone: value,
      gender: null,
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

  private resolveBulkAudiences(body: {
    audience?: SmsBatchAudience;
    audiences?: SmsBatchAudience[];
  }) {
    const rawAudiences = Array.isArray(body.audiences)
      ? body.audiences
      : body.audience
        ? [body.audience]
        : [];
    const allowed = new Set([
      SmsBatchAudience.ALL_CONTRIBUTORS,
      SmsBatchAudience.MALE_CONTRIBUTORS,
      SmsBatchAudience.FEMALE_CONTRIBUTORS,
    ]);
    const unique = new Set<SmsBatchAudience>();
    rawAudiences.forEach((audience) => {
      if (allowed.has(audience)) {
        unique.add(audience);
      }
    });
    return Array.from(unique);
  }

  private resolveBatchAudienceLabel(body: {
    audience?: SmsBatchAudience;
    audiences?: SmsBatchAudience[];
    addressBookIds?: string[];
    fundAccountIds?: string[];
    pastedContacts?: string;
  }) {
    const audiences = this.resolveBulkAudiences(body);
    const selectedTargetGroups =
      audiences.length +
      (body.fundAccountIds?.length ? 1 : 0) +
      (body.addressBookIds?.length ? 1 : 0) +
      (body.pastedContacts?.trim() ? 1 : 0);

    if (selectedTargetGroups > 1) {
      return SmsBatchAudience.MULTIPLE;
    }
    if (audiences.length === 1) {
      return audiences[0];
    }
    if (body.fundAccountIds?.length) {
      return SmsBatchAudience.FUND_ACCOUNTS;
    }
    if (body.addressBookIds?.length) {
      return SmsBatchAudience.ADDRESS_BOOKS;
    }
    if (body.pastedContacts?.trim()) {
      return SmsBatchAudience.PASTED_CONTACTS;
    }
    return SmsBatchAudience.ALL_CONTRIBUTORS;
  }

  private async mapContributorsToBulkRecipients(
    churchId: string,
    contributors: Contributor[],
  ): Promise<BulkRecipient[]> {
    const hashedByContributorId = await this.getLatestHashedMobileByContributor(
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

  private renderBulkMessage(template: string, recipient: BulkRecipient) {
    const firstName =
      recipient.firstName || this.extractFirstName(recipient.name || '') || '';
    const recipientName = recipient.name || firstName || 'Friend';
    return this.sanitizeGsm7(
      template
        .replace(/\{firstName\}/gi, firstName)
        .replace(/\{name\}/gi, recipientName)
        .replace(/\bname\b/gi, recipientName),
    );
  }

  public normalizeGender(value: string | null | undefined) {
    const normalized = `${value || ''}`.trim().toLowerCase();
    if (['male', 'm'].includes(normalized)) {
      return ContributorGender.MALE;
    }
    if (['female', 'f'].includes(normalized)) {
      return ContributorGender.FEMALE;
    }
    return null;
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
      if (
        !contribution.contributorId ||
        hashedByContributorId.has(contribution.contributorId)
      ) {
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
    const shortcode = this.resolveChurchSmsShortcode(
      church,
      requestedShortcode,
    );
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
    const configSource = config.smsConfigSource || 'church';
    return {
      partnerIdSource: this.resolveFieldSource(
        config.smsPartnerId,
        this.partnerId,
        configSource,
      ),
      apiKeySource: this.resolveFieldSource(
        config.smsApiKey,
        this.apiKey,
        configSource,
      ),
      shortCodeSource: this.resolveFieldSource(
        config.smsShortcode,
        this.shortCode,
        configSource,
      ),
      baseUrlSource: this.resolveFieldSource(
        config.smsBaseUrl,
        this.baseUrl,
        configSource,
      ),
      partnerIdHint: this.maskSecret(resolved.partnerId),
      shortCodeHint: this.maskSecret(resolved.shortCode),
      apiKeyPresent: Boolean(resolved.apiKey),
      baseUrl: resolved.baseUrl,
    };
  }

  private resolveFieldSource(
    churchValue: string | null | undefined,
    envValue: string | null | undefined,
    configSource = 'church',
  ) {
    if (churchValue) {
      return configSource;
    }

    if (envValue) {
      return 'env';
    }

    return 'missing';
  }

  private formatDiagnostics(
    diagnostics: ReturnType<typeof this.buildDiagnostics>,
  ) {
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
    const messageId =
      nested?.messageid ??
      nested?.messageID ??
      nested?.['message-id'] ??
      data?.messageid ??
      data?.messageID ??
      data?.['message-id'];

    return [
      `providerCode=${responseCode ?? 'unknown'}`,
      `providerDescription=${responseDescription ?? 'n/a'}`,
      `messageId=${messageId ? this.maskSecret(String(messageId)) : 'n/a'}`,
    ].join(' | ');
  }

  private getExceptionMessage(error: any, fallback: string) {
    if (typeof error?.getResponse === 'function') {
      const response = error.getResponse();
      if (typeof response === 'string' && response.trim()) {
        return response;
      }
      if (Array.isArray(response?.message) && response.message.length > 0) {
        return response.message.join(', ');
      }
      if (typeof response?.message === 'string' && response.message.trim()) {
        return response.message;
      }
      if (typeof response?.error === 'string' && response.error.trim()) {
        return response.error;
      }
    }

    const axiosMessage =
      error?.response?.data?.errorMessage ||
      error?.response?.data?.ResponseDescription ||
      error?.response?.data?.message;
    if (typeof axiosMessage === 'string' && axiosMessage.trim()) {
      return axiosMessage;
    }

    if (
      typeof error?.message === 'string' &&
      error.message.trim() &&
      !/^Request failed with status code \d+$/i.test(error.message.trim())
    ) {
      return error.message;
    }

    return fallback;
  }

  private describeAxiosError(error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 'no-status';
      const providerResponse = this.describeProviderResponse(
        error.response?.data,
      );
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
