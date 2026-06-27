import { SmsService } from './sms.service';
import { SmsUnitPurchaseStatus } from '../entities/sms-unit-purchase.entity';

describe('SmsService outbox filtering', () => {
  it('searches recipient names, contributor names, and visible phone numbers', async () => {
    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    const service = Object.create(SmsService.prototype) as SmsService;
    (service as any).smsOutboxRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };

    await service.listOutbox('church-1', { search: ' Geoffrey ' });

    expect(queryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'message.contributor',
      'contributor',
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(message.recipientName LIKE :search OR contributor.name LIKE :search OR message.recipientMobile LIKE :search)',
      { search: '%Geoffrey%' },
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(50);
  });
});

describe('SmsService SMS unit C2B confirmations', () => {
  function createService(purchase: any) {
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(purchase),
    };
    const savePurchase = jest.fn(async (value) => value);
    const saveBatch = jest.fn(async (value) => value);
    const service = Object.create(SmsService.prototype) as SmsService;
    (service as any).logger = {
      log: jest.fn(),
      warn: jest.fn(),
    };
    (service as any).smsUnitPurchaseRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      save: savePurchase,
    };
    (service as any).smsBatchRepo = {
      save: saveBatch,
    };
    return { service, queryBuilder, savePurchase, saveBatch };
  }

  it('confirms a pending SMS unit purchase from a C2B confirmation reference', async () => {
    const paidAt = new Date('2026-06-27T11:17:27.000Z');
    const purchase = {
      id: '978490d1-1111-4222-8333-abcdefabcdef',
      churchId: 'church-1',
      batchId: 'batch-1',
      amountKes: 2,
      payerPhone: '254700000000',
      status: SmsUnitPurchaseStatus.STK_SENT,
      providerRawResponse: null,
    };
    const { service, queryBuilder, savePurchase, saveBatch } =
      createService(purchase);

    const result = await service.handleSmsUnitPurchaseC2BConfirmation({
      transId: 'UFR9N92C9A',
      billRefNumber: 'SMS-978490d1',
      amount: 2,
      phoneForContributor: '254724075174',
      receivedAt: paidAt,
      raw: { TransID: 'UFR9N92C9A' },
    });

    expect(result).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'purchase.id LIKE :prefix',
      { prefix: '978490d1%' },
    );
    expect(savePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SmsUnitPurchaseStatus.CONFIRMED,
        statusDescription: 'SMS unit payment confirmed',
        mpesaReceipt: 'UFR9N92C9A',
        payerPhone: '254724075174',
        paidAt,
      }),
    );
    expect(saveBatch).toHaveBeenCalledWith({
      id: 'batch-1',
      status: 'payment_confirmed',
    });
  });

  it('does not store hashed C2B MSISDN values in the payer phone column', async () => {
    const purchase = {
      id: '2714ae53-1111-4222-8333-abcdefabcdef',
      churchId: 'church-1',
      batchId: 'batch-1',
      amountKes: 1,
      payerPhone: '254724075174',
      status: SmsUnitPurchaseStatus.STK_SENT,
      providerRawResponse: null,
    };
    const { service, savePurchase } = createService(purchase);

    await service.handleSmsUnitPurchaseC2BConfirmation({
      transId: 'UFRMB8YG85',
      billRefNumber: 'SMS-2714ae53',
      amount: 1,
      phone:
        'aae790296afb910a6e1fc37cb9732802edde8cb20e3f4041f984e80061e2015a',
      phoneForContributor: null,
      raw: { MSISDN: 'aae790296afb910a6e1fc37cb9732802edde8cb20e3f4041f984e80061e2015a' },
    });

    expect(savePurchase).toHaveBeenCalledWith(
      expect.objectContaining({
        status: SmsUnitPurchaseStatus.CONFIRMED,
        payerPhone: '254724075174',
        mpesaReceipt: 'UFRMB8YG85',
      }),
    );
  });

  it('handles unknown SMS unit C2B references without falling through to contributions', async () => {
    const { service } = createService(null);

    const result = await service.handleSmsUnitPurchaseC2BConfirmation({
      transId: 'UFR9N92F41',
      billRefNumber: 'SMS-1149e852',
      amount: 2,
    });

    expect(result).toEqual({
      ResultCode: 0,
      ResultDesc: 'SMS unit purchase not found',
    });
  });
});
