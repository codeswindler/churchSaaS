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
});
