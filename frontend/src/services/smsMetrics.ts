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

export function renderSmsPreviewPlaceholders(value: string) {
  return value
    .replace(/\{name\}/gi, 'JOSEPH')
    .replace(/\{firstName\}/gi, 'JOSEPH')
    .replace(/\{amount\}/gi, '1.00')
    .replace(/\{account\}/gi, 'Sadaka')
    .replace(/\{date\}/gi, 'Jun 4, 2026')
    .replace(/\{reference\}/gi, 'ABC123');
}
