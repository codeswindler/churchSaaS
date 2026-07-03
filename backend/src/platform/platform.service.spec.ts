import { ChurchBillingModel } from '../entities/church.entity';
import { ContributionChannel } from '../entities/contribution.entity';
import { PlatformService } from './platform.service';

describe('PlatformService commission revenue', () => {
  const service = new PlatformService(
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
    null as any,
  ) as any;

  it('shows zero platform commission revenue when commission billing rate is zero', () => {
    const totals = service.decorateRevenueTotals(
      { total: 100000, revenue: 500, count: 4 },
      {
        billingModel: ChurchBillingModel.COMMISSION,
        commissionRatePct: 0,
      },
    );

    expect(totals.revenue).toBe(0);
  });

  it('ignores stale stored contribution commission when church commission is disabled', () => {
    const commission = service.getPlatformCommissionAmountForContribution({
      amount: 1000,
      channel: ContributionChannel.MPESA,
      commissionAmount: 50,
      church: {
        billingModel: ChurchBillingModel.COMMISSION,
        commissionRatePct: 0,
      },
    });

    expect(commission).toBe(0);
  });

  it('uses stored contribution commission when church commission is enabled', () => {
    const commission = service.getPlatformCommissionAmountForContribution({
      amount: 1000,
      channel: ContributionChannel.MPESA,
      commissionAmount: 50,
      church: {
        billingModel: ChurchBillingModel.COMMISSION,
        commissionRatePct: 0.5,
      },
    });

    expect(commission).toBe(50);
  });
});
