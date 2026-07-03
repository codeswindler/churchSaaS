import { ContributionsService } from './contributions.service';
import { ChurchBillingModel } from '../entities/church.entity';
import { ContributionChannel } from '../entities/contribution.entity';

describe('ContributionsService date filters', () => {
  const service = new ContributionsService(
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

  it('treats date-only start filters as Kenya calendar-day start', () => {
    const date = service.parseDateFilterBoundary('2026-06-18', 'start');

    expect(date.toISOString()).toBe('2026-06-17T21:00:00.000Z');
  });

  it('treats date-only end filters as Kenya calendar-day end', () => {
    const date = service.parseDateFilterBoundary('2026-06-18', 'end');

    expect(date.toISOString()).toBe('2026-06-18T20:59:59.999Z');
  });
});

describe('ContributionsService commission privacy', () => {
  const service = new ContributionsService(
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

  it('does not subtract stale stored commission when current church commission is disabled', () => {
    const amount = service.getContributionCreditedAmount(
      {
        amount: 1000,
        channel: ContributionChannel.MPESA,
        commissionAmount: 50,
      },
      {
        billingModel: ChurchBillingModel.COMMISSION,
        commissionRatePct: 0,
      },
    );

    expect(amount).toBe(1000);
  });

  it('keeps stored commission when current church commission is enabled', () => {
    const amount = service.getContributionCreditedAmount(
      {
        amount: 1000,
        channel: ContributionChannel.MPESA,
        commissionAmount: 50,
      },
      {
        billingModel: ChurchBillingModel.COMMISSION,
        commissionRatePct: 0.5,
      },
    );

    expect(amount).toBe(950);
  });
});
