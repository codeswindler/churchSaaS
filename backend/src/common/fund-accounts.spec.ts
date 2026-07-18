import {
  DEFAULT_FUND_ACCOUNT_SEEDS,
  findConflictingFundAliases,
  isFallbackFundAccount,
  matchesFundAccountReference,
  MAX_FUND_ALIASES,
  normalizeFundAliasList,
  normalizeFundReference,
  pickFallbackFundAccount,
} from './fund-accounts';

describe('normalizeFundReference', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(normalizeFundReference('Tithes & Offerings')).toBe(
      'tithesofferings',
    );
    expect(normalizeFundReference('  tithes-offerings  ')).toBe(
      'tithesofferings',
    );
    expect(normalizeFundReference('TITHES_OFFERINGS')).toBe('tithesofferings');
  });

  it('returns empty string for blank input', () => {
    expect(normalizeFundReference(null)).toBe('');
    expect(normalizeFundReference('   ')).toBe('');
    expect(normalizeFundReference('!!!')).toBe('');
  });
});

describe('normalizeFundAliasList', () => {
  it('accepts arrays and delimited strings', () => {
    expect(normalizeFundAliasList(['Tithes', 'Zaka'])).toEqual([
      'Tithes',
      'Zaka',
    ]);
    expect(normalizeFundAliasList('Tithes, Zaka')).toEqual(['Tithes', 'Zaka']);
    expect(normalizeFundAliasList('Tithes\nZaka')).toEqual(['Tithes', 'Zaka']);
  });

  it('drops blanks and de-duplicates on the normalized key', () => {
    expect(normalizeFundAliasList(['Tithes', '  ', 'tithes', 'TITHES'])).toEqual(
      ['Tithes'],
    );
  });

  it('preserves the original casing of the first occurrence', () => {
    expect(normalizeFundAliasList(['Sadaka ya Kumi', 'sadakayakumi'])).toEqual([
      'Sadaka ya Kumi',
    ]);
  });

  it('caps the list length', () => {
    const many = Array.from({ length: 40 }, (_, i) => `alias${i}`);
    expect(normalizeFundAliasList(many)).toHaveLength(MAX_FUND_ALIASES);
  });
});

describe('matchesFundAccountReference', () => {
  const tithe = {
    name: 'Tithe',
    code: 'tithe',
    aliases: ['Tithes', 'Zaka', 'Sadaka ya Kumi'],
  };

  it('matches on name, code and aliases', () => {
    expect(matchesFundAccountReference(tithe, 'Tithe')).toBe(true);
    expect(matchesFundAccountReference(tithe, 'tithe')).toBe(true);
    expect(matchesFundAccountReference(tithe, 'ZAKA')).toBe(true);
    expect(matchesFundAccountReference(tithe, 'sadaka ya kumi')).toBe(true);
    expect(matchesFundAccountReference(tithe, 'sadaka-ya-kumi')).toBe(true);
  });

  it('does not match unrelated or blank references', () => {
    expect(matchesFundAccountReference(tithe, 'Harambee')).toBe(false);
    expect(matchesFundAccountReference(tithe, '')).toBe(false);
    expect(matchesFundAccountReference(tithe, null)).toBe(false);
  });

  it('handles an account with no aliases', () => {
    expect(
      matchesFundAccountReference({ name: 'Building', code: 'building' }, 'building'),
    ).toBe(true);
  });
});

describe('isFallbackFundAccount', () => {
  it('honours the explicit flag', () => {
    expect(
      isFallbackFundAccount({ code: 'offering', isFallback: true }),
    ).toBe(true);
  });

  it('falls back to the legacy general code for unmigrated rows', () => {
    expect(isFallbackFundAccount({ code: 'general' })).toBe(true);
    expect(isFallbackFundAccount({ name: 'General' })).toBe(true);
  });

  it('is false for ordinary accounts and nullish input', () => {
    expect(isFallbackFundAccount({ code: 'tithe' })).toBe(false);
    expect(isFallbackFundAccount(null)).toBe(false);
  });
});

describe('pickFallbackFundAccount', () => {
  it('prefers the flagged account over code matches', () => {
    const accounts = [
      { code: 'general', name: 'General' },
      { code: 'harambee', name: 'Harambee', isFallback: true },
      { code: 'offering', name: 'Offering' },
    ];
    expect(pickFallbackFundAccount(accounts)?.code).toBe('harambee');
  });

  it('degrades to offering, then to legacy general', () => {
    expect(
      pickFallbackFundAccount([
        { code: 'general', name: 'General' },
        { code: 'offering', name: 'Offering' },
      ])?.code,
    ).toBe('offering');

    expect(
      pickFallbackFundAccount([{ code: 'general', name: 'General' }])?.code,
    ).toBe('general');
  });

  it('returns null when nothing qualifies', () => {
    expect(pickFallbackFundAccount([{ code: 'tithe', name: 'Tithe' }])).toBeNull();
  });
});

describe('findConflictingFundAliases', () => {
  const others = [
    { name: 'Harambee', code: 'harambee', aliases: ['Fundraising'] },
  ];

  it('flags aliases claimed by another account', () => {
    const conflicts = findConflictingFundAliases(
      ['Fundraising'],
      { name: 'Tithe', code: 'tithe' },
      others,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictsWith).toBe('Harambee');
  });

  it('flags aliases matching another account name or code', () => {
    expect(
      findConflictingFundAliases(
        ['harambee'],
        { name: 'Tithe', code: 'tithe' },
        others,
      ),
    ).toHaveLength(1);
  });

  it('flags redundant aliases matching the account itself', () => {
    const conflicts = findConflictingFundAliases(
      ['Tithe'],
      { name: 'Tithe', code: 'tithe' },
      others,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].conflictsWith).toContain('own name or code');
  });

  it('allows genuinely distinct aliases', () => {
    expect(
      findConflictingFundAliases(
        ['Zaka'],
        { name: 'Tithe', code: 'tithe' },
        others,
      ),
    ).toHaveLength(0);
  });
});

describe('DEFAULT_FUND_ACCOUNT_SEEDS', () => {
  it('no longer seeds a General account', () => {
    expect(DEFAULT_FUND_ACCOUNT_SEEDS.map((s) => s.code)).not.toContain(
      'general',
    );
  });

  it('nominates exactly one fallback, and it is Offering', () => {
    const fallbacks = DEFAULT_FUND_ACCOUNT_SEEDS.filter((s) => s.isFallback);
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0].code).toBe('offering');
  });

  it('keeps "General" as an Offering alias so old references still route', () => {
    const offering = DEFAULT_FUND_ACCOUNT_SEEDS.find(
      (s) => s.code === 'offering',
    );
    expect(matchesFundAccountReference(offering!, 'General')).toBe(true);
  });

  it('has no alias collisions across the seeded accounts', () => {
    for (const seed of DEFAULT_FUND_ACCOUNT_SEEDS) {
      const others = DEFAULT_FUND_ACCOUNT_SEEDS.filter((s) => s !== seed);
      expect(
        findConflictingFundAliases(seed.aliases, seed, others),
      ).toHaveLength(0);
    }
  });
});
