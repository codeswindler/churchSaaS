/**
 * Fallback fund account resolution.
 *
 * Historically the fallback account for unmatched M-Pesa account references was
 * identified by the magic string `code === 'general'`. That sentinel is gone:
 * the fallback is now marked explicitly with `fundAccount.isFallback`, and the
 * default fallback is the church's Offering account.
 *
 * `FALLBACK_FUND_ACCOUNT_CODE` is only used when provisioning a church that has
 * no fallback yet. Once the flag is set, resolution never looks at the code.
 */
export const FALLBACK_FUND_ACCOUNT_CODE = 'offering';
export const FALLBACK_FUND_ACCOUNT_NAME = 'Offering';
export const FALLBACK_FUND_ACCOUNT_DESCRIPTION =
  'General church offering. Also receives payments whose M-Pesa account reference does not match another fund account.';

/** Code of the retired fallback account, kept only for migration/back-compat. */
export const LEGACY_FALLBACK_FUND_ACCOUNT_CODE = 'general';

/**
 * Accounts seeded for a newly provisioned church. Shared by the public signup
 * controller and the platform admin provisioning path so the two cannot drift.
 * Aliases cover the common spellings contributors type as M-Pesa references.
 */
export const DEFAULT_FUND_ACCOUNT_SEEDS: {
  name: string;
  code: string;
  description: string;
  aliases: string[];
  isFallback?: boolean;
}[] = [
  {
    name: 'Tithe',
    code: 'tithe',
    description: 'Regular tithe contributions',
    aliases: ['Tithes', 'Zaka', 'Sadaka ya Kumi'],
  },
  {
    name: 'Offering',
    code: 'offering',
    description: FALLBACK_FUND_ACCOUNT_DESCRIPTION,
    aliases: ['Offerings', 'Sadaka', 'General', 'Michango'],
    isFallback: true,
  },
  {
    name: 'Harambee',
    code: 'harambee',
    description: 'Special fundraising support',
    aliases: ['Fundraising', 'Mchango'],
  },
];

type FundAccountLike = {
  code?: string | null;
  name?: string | null;
  aliases?: string[] | null;
  isFallback?: boolean | null;
};

export function normalizeFundCode(value?: string | null) {
  return `${value || ''}`.trim().toLowerCase();
}

/** Max aliases per account, to keep the reference index small and the UI sane. */
export const MAX_FUND_ALIASES = 12;

/**
 * Collapses a reference to a comparable key: lowercase, alphanumerics only.
 * "Tithes & Offerings" and "tithes-offerings" both become "tithesofferings".
 */
export function normalizeFundReference(value?: string | null) {
  return `${value || ''}`.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Cleans a raw alias list: trims, drops blanks, de-duplicates on the normalized
 * key while preserving the admin's original casing, and caps the length.
 */
export function normalizeFundAliasList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : `${value ?? ''}`.split(/[\n,]/);

  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of raw) {
    const trimmed = `${entry ?? ''}`.trim();
    if (!trimmed) continue;
    const key = normalizeFundReference(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
    if (result.length >= MAX_FUND_ALIASES) break;
  }

  return result;
}

/** Every reference that should resolve to this account, as normalized keys. */
export function getFundAccountReferenceKeys(account: FundAccountLike) {
  return new Set(
    [account.name, account.code, ...(account.aliases || [])]
      .map(normalizeFundReference)
      .filter(Boolean),
  );
}

export function matchesFundAccountReference(
  account: FundAccountLike,
  reference?: string | null,
) {
  const key = normalizeFundReference(reference);
  if (!key) {
    return false;
  }
  return getFundAccountReferenceKeys(account).has(key);
}

/**
 * Finds aliases that would be ambiguous — either colliding with another
 * account's name/code/alias, or with this account's own name/code (redundant).
 * Returns the offending alias strings so the API can reject them with detail.
 */
export function findConflictingFundAliases(
  aliases: string[],
  self: FundAccountLike,
  otherAccounts: FundAccountLike[],
): { alias: string; conflictsWith: string }[] {
  const conflicts: { alias: string; conflictsWith: string }[] = [];
  const selfName = normalizeFundReference(self.name);
  const selfCode = normalizeFundReference(self.code);

  for (const alias of aliases) {
    const key = normalizeFundReference(alias);
    if (!key) continue;

    if (key === selfName || key === selfCode) {
      conflicts.push({ alias, conflictsWith: 'this account’s own name or code' });
      continue;
    }

    const clash = otherAccounts.find((account) =>
      getFundAccountReferenceKeys(account).has(key),
    );
    if (clash) {
      conflicts.push({ alias, conflictsWith: clash.name || clash.code || 'another account' });
    }
  }

  return conflicts;
}

/**
 * True when the account is the church's fallback. Falls back to the legacy
 * `general` code so churches whose rows have not been migrated yet keep
 * working — remove the code check once the migration has run everywhere.
 */
export function isFallbackFundAccount(account?: FundAccountLike | null) {
  if (!account) {
    return false;
  }
  if (account.isFallback) {
    return true;
  }
  return (
    normalizeFundCode(account.code) === LEGACY_FALLBACK_FUND_ACCOUNT_CODE ||
    normalizeFundCode(account.name) === LEGACY_FALLBACK_FUND_ACCOUNT_CODE
  );
}

/**
 * Picks the fallback account from a list, preferring the explicit flag and
 * degrading to the Offering account, then the legacy General account.
 */
export function pickFallbackFundAccount<T extends FundAccountLike>(
  accounts: T[],
): T | null {
  return (
    accounts.find((account) => account.isFallback) ||
    accounts.find(
      (account) => normalizeFundCode(account.code) === FALLBACK_FUND_ACCOUNT_CODE,
    ) ||
    accounts.find(
      (account) =>
        normalizeFundCode(account.code) === LEGACY_FALLBACK_FUND_ACCOUNT_CODE,
    ) ||
    null
  );
}
