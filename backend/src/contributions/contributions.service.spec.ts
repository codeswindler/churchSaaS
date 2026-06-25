import { ContributionsService } from './contributions.service';

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
