import { SmsService } from './sms.service';

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
