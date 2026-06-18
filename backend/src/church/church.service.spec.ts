import { BadRequestException } from '@nestjs/common';
import { ChurchService } from './church.service';

describe('ChurchService discipleship name matching', () => {
  const service = Object.create(ChurchService.prototype) as ChurchService;
  const scoreName = (left: string, right: string) =>
    (service as any).scoreDiscipleshipNameMatch(left, right) as number;

  it('matches a shortened two-part transaction name to a fuller manual name', () => {
    expect(scoreName('Wilson Mwiro', 'Wilson Murioki Mwiro')).toBeGreaterThan(
      0,
    );
  });

  it('does not fuzzy-match a single transaction name', () => {
    expect(scoreName('Wilson', 'Wilson Murioki Mwiro')).toBe(0);
    expect(scoreName('JOSEPH', 'Joseph Njunji')).toBe(0);
  });

  it('does not match names that share only one part', () => {
    expect(scoreName('Wilson Mwiro', 'Wilson Muriuki')).toBe(0);
  });

  it('matches name parts independently of case and spacing', () => {
    expect(
      scoreName('  WILSON   MWIR0 ', 'Wilson Murioki Mwiro'),
    ).toBe(0);
    expect(
      scoreName('  WILSON   MWIRO ', 'Wilson Murioki Mwiro'),
    ).toBeGreaterThan(0);
  });

  it('detects contradictory known phone numbers', () => {
    const hasConflict = (transactionPhone: string | null, memberPhone: string | null) =>
      (service as any).hasDiscipleshipPhoneConflict(
        transactionPhone,
        memberPhone,
      ) as boolean;

    expect(hasConflict('254724075174', '0724075174')).toBe(false);
    expect(hasConflict('254724075174', '254700000000')).toBe(true);
    expect(hasConflict('254724075174', '254724075174')).toBe(false);
    expect(hasConflict(null, '254724075174')).toBe(false);
  });

  it('requires a valid visibility window for newly approved fund displays', () => {
    const requireWindow = (visibleFrom?: string, visibleUntil?: string) =>
      (service as any).requireFundDisplayVisibilityWindow({
        visibleFrom,
        visibleUntil,
      });

    expect(
      requireWindow(
        '2026-06-18T09:00:00+03:00',
        '2026-06-18T18:00:00+03:00',
      ),
    ).toEqual({
      visibleFrom: '2026-06-18T06:00:00.000Z',
      visibleUntil: '2026-06-18T15:00:00.000Z',
    });
    expect(() => requireWindow()).toThrow(BadRequestException);
    expect(() =>
      requireWindow(
        '2026-06-18T18:00:00+03:00',
        '2026-06-18T09:00:00+03:00',
      ),
    ).toThrow('Visibility end time must be after the start time');
  });

  it('keeps legacy approved fund displays compatible without visibility dates', () => {
    const normalized = (service as any).normalizeFundDisplays([
      {
        id: 'legacy-display',
        fundAccountId: 'fund-1',
        startDate: '2026-01-01',
        approvalStatus: 'approved',
      },
    ]);

    expect(normalized).toEqual([
      expect.objectContaining({
        id: 'legacy-display',
        approvalStatus: 'approved',
        visibleFrom: null,
        visibleUntil: null,
      }),
    ]);
  });

  it('marks non-priest fund display edits as pending', () => {
    const previous = {
      id: 'display-1',
      title: 'Building fund',
      fundAccountId: 'fund-1',
      startDate: '2026-01-01',
      endMode: 'to_date',
      isActive: true,
      approvalStatus: 'approved',
      visibleFrom: '2026-06-18T06:00:00.000Z',
      visibleUntil: '2026-06-18T15:00:00.000Z',
    };
    const next = { ...previous, title: 'Updated building fund' };

    const result = (service as any).applyFundDisplayApprovalState(
      [previous],
      [next],
      'admin-1',
      false,
    );

    expect(result.pendingIds).toEqual(['display-1']);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        approvalStatus: 'pending',
        requestedByUserId: 'admin-1',
        approvedByUserId: null,
      }),
    );
  });

  it('uses the same outbox filters for CSV exports', async () => {
    const listOutbox = jest.fn().mockResolvedValue([]);
    (service as any).smsService = { listOutbox };
    const filters = { search: 'Geoffrey', deliveryStatus: 'delivered' };

    const csv = await service.exportSmsOutboxCsv('church-1', filters);

    expect(listOutbox).toHaveBeenCalledWith('church-1', filters);
    expect(csv).toContain('Recipient');
  });
});
