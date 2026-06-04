const GSM7_SINGLE_PART_LIMIT = 160;
const GSM7_MULTIPART_SEGMENT_LIMIT = 153;

export function getGsm7SmsMetrics(value: string) {
  const length = value.length;
  const segments =
    length <= GSM7_SINGLE_PART_LIMIT
      ? 1
      : Math.ceil(length / GSM7_MULTIPART_SEGMENT_LIMIT);
  const segmentLimit =
    segments === 1 ? GSM7_SINGLE_PART_LIMIT : GSM7_MULTIPART_SEGMENT_LIMIT;
  const usedInCurrentSegment =
    segments === 1
      ? length
      : length - GSM7_MULTIPART_SEGMENT_LIMIT * (segments - 1);
  const remainingInCurrentSegment =
    usedInCurrentSegment === 0 ? 0 : segmentLimit - usedInCurrentSegment;

  return {
    length,
    remainingInCurrentSegment,
    segmentLimit,
    segments: Math.max(1, segments),
  };
}

interface SmsPreviewPlaceholderValues {
  account?: string;
  amount?: string;
  date?: string;
  firstName?: string;
  name?: string;
  reference?: string;
}

export function renderSmsPreviewPlaceholders(
  value: string,
  values: SmsPreviewPlaceholderValues = {},
) {
  const previewValues = {
    account: values.account || 'Account',
    amount: values.amount || '1.00',
    date: values.date || 'Jun 4, 2026',
    firstName: values.firstName || values.name || 'Geoffrey',
    name: values.name || 'Geoffrey',
    reference: values.reference || 'ABC123',
  };

  return value
    .replace(/\{name\}/gi, previewValues.name)
    .replace(/\{firstName\}/gi, previewValues.firstName)
    .replace(/\{amount\}/gi, previewValues.amount)
    .replace(/\{account\}/gi, previewValues.account)
    .replace(/\{date\}/gi, previewValues.date)
    .replace(/\{reference\}/gi, previewValues.reference);
}
