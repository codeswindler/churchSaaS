import { BadRequestException } from '@nestjs/common';
import { MobileB2cWithdrawalStatus } from '../entities/mobile-b2c-withdrawal.entity';
import { MobileB2cService } from './mobile-b2c.service';

describe('MobileB2cService', () => {
  const churchRepo = {
    findOne: jest.fn(),
  };
  const withdrawalRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({
      id: value.id || 'withdrawal-1',
      createdAt: value.createdAt || new Date('2026-06-27T08:00:00.000Z'),
      updatedAt: new Date('2026-06-27T08:00:00.000Z'),
      ...value,
    })),
    findAndCount: jest.fn(),
    findOne: jest.fn(),
  };
  const fundAccountRepo = {
    findOne: jest.fn(),
  };
  const mpesaService = {
    b2cPayment: jest.fn(),
  };

  let service: MobileB2cService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MobileB2cService(
      churchRepo as any,
      withdrawalRepo as any,
      fundAccountRepo as any,
      mpesaService as any,
    );
    churchRepo.findOne.mockResolvedValue({
      id: 'church-1',
      mpesaEnvironment: 'production',
      mpesaB2cConsumerKey: 'church-key',
      mpesaB2cConsumerSecret: 'church-secret',
      mpesaB2cShortcode: '4319651',
      mpesaB2cInitiatorName: 'initiator',
      mpesaB2cSecurityCredential: 'encrypted-credential',
      mpesaB2cCommandId: 'BusinessPayment',
    });
  });

  it('creates a tenant withdrawal and submits it to Daraja B2C', async () => {
    fundAccountRepo.findOne.mockResolvedValue({
      id: 'fund-1',
      churchId: 'church-1',
      isActive: true,
    });
    mpesaService.b2cPayment.mockResolvedValue({
      ResponseCode: '0',
      ResponseDescription: 'Accepted',
      OriginatorConversationID: 'originator-1',
      ConversationID: 'conversation-1',
    });

    const result = await service.createWithdrawal('church-1', 'priest-1', {
      phoneNumber: '0712345678',
      amount: 1000,
      recipientName: 'Jane Member',
      remarks: 'Welfare support',
      occasion: 'Pastoral care',
      fundAccountId: 'fund-1',
    });

    expect(fundAccountRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'fund-1', churchId: 'church-1', isActive: true },
    });
    expect(mpesaService.b2cPayment).toHaveBeenCalledWith(
      {
        phoneNumber: '254712345678',
        amount: 1000,
        remarks: 'Welfare support',
        occasion: 'Pastoral care',
      },
      expect.objectContaining({
        id: 'church-1',
        mpesaB2cConsumerKey: 'church-key',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'withdrawal-1',
        churchId: 'church-1',
        requestedByUserId: 'priest-1',
        phoneNumber: '254712345678',
        amount: 1000,
        status: MobileB2cWithdrawalStatus.SUBMITTED,
        originatorConversationId: 'originator-1',
        conversationId: 'conversation-1',
      }),
    );
  });

  it('rejects invalid Kenyan MSISDNs before creating a request', async () => {
    await expect(
      service.createWithdrawal('church-1', 'priest-1', {
        phoneNumber: '12345',
        amount: 1000,
        remarks: 'Reason',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(withdrawalRepo.save).not.toHaveBeenCalled();
    expect(mpesaService.b2cPayment).not.toHaveBeenCalled();
  });

  it('updates a submitted withdrawal from a successful result callback', async () => {
    withdrawalRepo.findOne.mockResolvedValue({
      id: 'withdrawal-1',
      churchId: 'church-1',
      requestedByUserId: 'priest-1',
      phoneNumber: '254712345678',
      amount: 1000,
      recipientName: null,
      remarks: 'Reason',
      occasion: null,
      fundAccountId: null,
      status: MobileB2cWithdrawalStatus.SUBMITTED,
      resultCode: '0',
      resultDesc: 'Accepted',
      originatorConversationId: 'originator-1',
      conversationId: 'conversation-1',
      transactionId: null,
      completedAt: null,
      createdAt: new Date('2026-06-27T08:00:00.000Z'),
      updatedAt: new Date('2026-06-27T08:00:00.000Z'),
    });

    const response = await service.handleResultCallback({
      Result: {
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        OriginatorConversationID: 'originator-1',
        ConversationID: 'conversation-1',
        TransactionID: 'QFR123ABC',
      },
    });

    expect(response).toEqual({ ResultCode: 0, ResultDesc: 'Accepted' });
    expect(withdrawalRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MobileB2cWithdrawalStatus.SUCCESSFUL,
        resultCode: '0',
        transactionId: 'QFR123ABC',
        completedAt: expect.any(Date),
      }),
    );
  });
});
