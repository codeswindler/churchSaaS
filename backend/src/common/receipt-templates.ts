export const DEFAULT_FUND_RECEIPT_TEMPLATE =
  'Dear {name}, we acknowledge receipt of your {account} contribution of KES {amount}';

export const DEFAULT_GENERAL_RECEIPT_TEMPLATE =
  'Dear {name}, we acknowledge receipt of your contribution of KES {amount}';

export const OLD_FUND_RECEIPT_TEMPLATE =
  'Dear {name}, we acknowledge receipt of KES {amount} towards {account}';

/**
 * Only the retired `general` account used the account-less wording, because it
 * had no meaningful fund name to print. The fallback is now Offering, a real
 * named account, so it uses the standard wording and {account} renders as
 * "Offering". This branch is retained solely for unmigrated legacy rows.
 */
export function getDefaultReceiptTemplateForFundCode(code?: string | null) {
  return `${code || ''}`.trim().toLowerCase() === 'general'
    ? DEFAULT_GENERAL_RECEIPT_TEMPLATE
    : DEFAULT_FUND_RECEIPT_TEMPLATE;
}

export function normalizeReceiptTemplateDefaultWording(
  template: string | null | undefined,
  code?: string | null,
) {
  const defaultTemplate = getDefaultReceiptTemplateForFundCode(code);
  const value = `${template || ''}`;
  if (!value) {
    return defaultTemplate;
  }

  const isGeneral = `${code || ''}`.trim().toLowerCase() === 'general';
  const replaceablePrefixes = isGeneral
    ? [OLD_FUND_RECEIPT_TEMPLATE, DEFAULT_FUND_RECEIPT_TEMPLATE]
    : [OLD_FUND_RECEIPT_TEMPLATE];

  for (const prefix of replaceablePrefixes) {
    if (value.startsWith(prefix)) {
      return `${defaultTemplate}${value.slice(prefix.length)}`;
    }
  }

  return value;
}
