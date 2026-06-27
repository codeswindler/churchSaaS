import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Church } from '../entities/church.entity';
import { FundAccount } from '../entities/fund-account.entity';
import {
  MobileB2cWithdrawal,
  MobileB2cWithdrawalStatus,
} from '../entities/mobile-b2c-withdrawal.entity';
import { MpesaService } from '../payments/mpesa.service';

@Injectable()
export class MobileB2cService {
  private readonly logger = new Logger(MobileB2cService.name);

  constructor(
    @InjectRepository(Church)
    private readonly churchRepo: Repository<Church>,
    @InjectRepository(MobileB2cWithdrawal)
    private readonly withdrawalRepo: Repository<MobileB2cWithdrawal>,
    @InjectRepository(FundAccount)
    private readonly fundAccountRepo: Repository<FundAccount>,
    private readonly mpesaService: MpesaService,
  ) {}

  async listWithdrawals(churchId: string, query: any = {}) {
    const page = Math.max(Number(query.page || 1), 1);
    const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
    const [items, total] = await this.withdrawalRepo.findAndCount({
      where: { churchId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: items.map((item) => this.mapWithdrawal(item)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  async createWithdrawal(
    churchId: string,
    requestedByUserId: string,
    body: any = {},
  ) {
    const church = await this.churchRepo.findOne({ where: { id: churchId } });
    if (!church) {
      throw new NotFoundException('Church not found');
    }
    const phoneNumber = this.normalizeKenyanMsisdn(body.phoneNumber);
    const amount = this.normalizeAmount(body.amount);
    const remarks = this.normalizeRequiredText(body.remarks, 'Remarks', 100);
    const recipientName = this.normalizeOptionalText(
      body.recipientName,
      180,
    );
    const occasion = this.normalizeOptionalText(body.occasion, 120);
    const fundAccountId = await this.resolveFundAccountId(
      churchId,
      body.fundAccountId,
    );

    let withdrawal = await this.withdrawalRepo.save(
      this.withdrawalRepo.create({
        churchId,
        requestedByUserId,
        phoneNumber,
        amount,
        recipientName,
        remarks,
        occasion,
        fundAccountId,
        status: MobileB2cWithdrawalStatus.CREATED,
      }),
    );
    this.logger.log(
      `B2C withdrawal created | withdrawal=${withdrawal.id} | church=${churchId} | user=${requestedByUserId} | amount=${amount} | phone=${this.maskPhone(phoneNumber)} | fund=${fundAccountId || 'none'}`,
    );

    try {
      const response = await this.mpesaService.b2cPayment({
        phoneNumber,
        amount,
        remarks,
        occasion,
      }, church);
      withdrawal.status = MobileB2cWithdrawalStatus.SUBMITTED;
      withdrawal.resultCode = this.stringifyProviderValue(
        response?.ResponseCode,
      );
      withdrawal.resultDesc = this.stringifyProviderValue(
        response?.ResponseDescription || response?.CustomerMessage,
      );
      withdrawal.originatorConversationId =
        this.stringifyProviderValue(response?.OriginatorConversationID) || null;
      withdrawal.conversationId =
        this.stringifyProviderValue(response?.ConversationID) || null;
      withdrawal = await this.withdrawalRepo.save(withdrawal);
      this.logger.log(
        `B2C withdrawal submitted | withdrawal=${withdrawal.id} | church=${churchId} | originator=${withdrawal.originatorConversationId || 'n/a'} | conversation=${withdrawal.conversationId || 'n/a'} | code=${withdrawal.resultCode || 'n/a'}`,
      );
    } catch (error: any) {
      withdrawal.status = MobileB2cWithdrawalStatus.FAILED;
      withdrawal.resultCode = 'SUBMIT_FAILED';
      withdrawal.resultDesc =
        error?.response?.data?.errorMessage ||
        error?.response?.data?.ResponseDescription ||
        error?.message ||
        'Unable to submit B2C request';
      withdrawal.completedAt = new Date();
      withdrawal = await this.withdrawalRepo.save(withdrawal);
      this.logger.warn(
        `B2C withdrawal failed before submission | withdrawal=${withdrawal.id} | church=${churchId} | reason=${withdrawal.resultDesc}`,
      );
    }

    return this.mapWithdrawal(withdrawal);
  }

  async handleResultCallback(body: any) {
    return this.handleCallback(body, 'result');
  }

  async handleTimeoutCallback(body: any) {
    return this.handleCallback(body, 'timeout');
  }

  private async handleCallback(body: any, type: 'result' | 'timeout') {
    const result = body?.Result || body?.result || body || {};
    const originatorConversationId = this.stringifyProviderValue(
      result.OriginatorConversationID || result.originatorConversationId,
    );
    const conversationId = this.stringifyProviderValue(
      result.ConversationID || result.conversationId,
    );
    const transactionId =
      this.stringifyProviderValue(
        result.TransactionID || result.TransactionId || result.transactionId,
      ) ||
      this.stringifyProviderValue(
        this.findResultParameter(result, 'TransactionID') ||
          this.findResultParameter(result, 'TransactionReceipt'),
      );
    const resultCode = this.stringifyProviderValue(
      result.ResultCode ?? result.resultCode ?? (type === 'timeout' ? 'TIMEOUT' : null),
    );
    const resultDesc =
      this.stringifyProviderValue(result.ResultDesc || result.resultDesc) ||
      (type === 'timeout' ? 'B2C request timed out' : null);

    const withdrawal = await this.findWithdrawalByProviderIds({
      originatorConversationId,
      conversationId,
      transactionId,
    });
    if (!withdrawal) {
      this.logger.warn(
        `B2C ${type} callback ignored; no withdrawal matched originator=${originatorConversationId || 'n/a'} conversation=${conversationId || 'n/a'} transaction=${transactionId || 'n/a'}`,
      );
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    withdrawal.originatorConversationId =
      originatorConversationId || withdrawal.originatorConversationId;
    withdrawal.conversationId = conversationId || withdrawal.conversationId;
    withdrawal.transactionId = transactionId || withdrawal.transactionId;
    withdrawal.resultCode = resultCode || withdrawal.resultCode;
    withdrawal.resultDesc = resultDesc || withdrawal.resultDesc;
    withdrawal.completedAt = new Date();
    withdrawal.status =
      type === 'timeout'
        ? MobileB2cWithdrawalStatus.TIMED_OUT
        : resultCode === '0'
          ? MobileB2cWithdrawalStatus.SUCCESSFUL
          : MobileB2cWithdrawalStatus.FAILED;

    await this.withdrawalRepo.save(withdrawal);
    if (withdrawal.status === MobileB2cWithdrawalStatus.SUCCESSFUL) {
      this.logger.log(
        `B2C withdrawal successful | withdrawal=${withdrawal.id} | church=${withdrawal.churchId} | transaction=${withdrawal.transactionId || 'n/a'} | amount=${Number(withdrawal.amount || 0)}`,
      );
    } else if (withdrawal.status === MobileB2cWithdrawalStatus.TIMED_OUT) {
      this.logger.warn(
        `B2C withdrawal timed out | withdrawal=${withdrawal.id} | church=${withdrawal.churchId} | originator=${withdrawal.originatorConversationId || 'n/a'}`,
      );
    } else {
      this.logger.warn(
        `B2C withdrawal failed | withdrawal=${withdrawal.id} | church=${withdrawal.churchId} | code=${withdrawal.resultCode || 'n/a'} | desc=${withdrawal.resultDesc || 'n/a'}`,
      );
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  private async findWithdrawalByProviderIds(ids: {
    originatorConversationId?: string | null;
    conversationId?: string | null;
    transactionId?: string | null;
  }) {
    const where = [
      ids.originatorConversationId
        ? { originatorConversationId: ids.originatorConversationId }
        : null,
      ids.conversationId ? { conversationId: ids.conversationId } : null,
      ids.transactionId ? { transactionId: ids.transactionId } : null,
    ].filter(Boolean) as FindOptionsWhere<MobileB2cWithdrawal>[];

    if (where.length === 0) {
      return null;
    }

    return this.withdrawalRepo.findOne({ where });
  }

  private async resolveFundAccountId(churchId: string, value: unknown) {
    const fundAccountId = this.normalizeOptionalText(value, 36);
    if (!fundAccountId) {
      return null;
    }

    const fundAccount = await this.fundAccountRepo.findOne({
      where: { id: fundAccountId, churchId, isActive: true },
    });
    if (!fundAccount) {
      throw new NotFoundException('Fund account not found');
    }

    return fundAccount.id;
  }

  private normalizeKenyanMsisdn(value: unknown) {
    let digits = `${value || ''}`.replace(/\D/g, '');
    if (digits.startsWith('0')) {
      digits = `254${digits.slice(1)}`;
    }
    if (digits.startsWith('7') || digits.startsWith('1')) {
      digits = `254${digits}`;
    }

    if (!/^254(?:7|1)\d{8}$/.test(digits)) {
      throw new BadRequestException(
        'Phone number must be a valid Kenyan mobile number in 2547XXXXXXXX or 2541XXXXXXXX format',
      );
    }

    return digits;
  }

  private normalizeAmount(value: unknown) {
    const amount = Number(value);
    const min = Math.max(Number(process.env.MPESA_B2C_MIN_AMOUNT || 1), 1);
    const max = Math.max(
      Number(process.env.MPESA_B2C_MAX_AMOUNT || 150000),
      min,
    );
    if (!Number.isFinite(amount) || amount < min || amount > max) {
      throw new BadRequestException(
        `Amount must be between KES ${min} and KES ${max}`,
      );
    }
    if (!Number.isInteger(amount)) {
      throw new BadRequestException('Amount must be a whole number of KES');
    }

    return amount;
  }

  private normalizeRequiredText(
    value: unknown,
    label: string,
    maxLength: number,
  ) {
    const normalized = this.normalizeOptionalText(value, maxLength);
    if (!normalized) {
      throw new BadRequestException(`${label} is required`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number) {
    const normalized = `${value ?? ''}`.trim();
    if (!normalized) {
      return null;
    }

    return normalized.slice(0, maxLength);
  }

  private findResultParameter(result: any, key: string) {
    const params = result?.ResultParameters?.ResultParameter;
    const list = Array.isArray(params) ? params : params ? [params] : [];
    return list.find((item: any) => item?.Key === key || item?.Name === key)
      ?.Value;
  }

  private stringifyProviderValue(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }
    const normalized = `${value}`.trim();
    return normalized || null;
  }

  private mapWithdrawal(withdrawal: MobileB2cWithdrawal) {
    return {
      id: withdrawal.id,
      churchId: withdrawal.churchId,
      requestedByUserId: withdrawal.requestedByUserId,
      phoneNumber: withdrawal.phoneNumber,
      amount: Number(withdrawal.amount || 0),
      recipientName: withdrawal.recipientName,
      remarks: withdrawal.remarks,
      occasion: withdrawal.occasion,
      fundAccountId: withdrawal.fundAccountId,
      status: withdrawal.status,
      resultCode: withdrawal.resultCode,
      resultDesc: withdrawal.resultDesc,
      originatorConversationId: withdrawal.originatorConversationId,
      conversationId: withdrawal.conversationId,
      transactionId: withdrawal.transactionId,
      createdAt: withdrawal.createdAt,
      completedAt: withdrawal.completedAt,
      updatedAt: withdrawal.updatedAt,
    };
  }

  private maskPhone(value: string | null | undefined) {
    const digits = `${value || ''}`.replace(/\D/g, '');
    if (digits.length <= 6) {
      return '***';
    }
    return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
  }
}
