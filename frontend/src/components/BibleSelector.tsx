import { useEffect, useMemo, useState } from 'react';

export type SelectedBibleVerse = {
  reference: string;
  text: string;
  version: BibleVersionCode;
  versionLabel: string;
};

export type BibleVersionCode = 'kjv' | 'niv' | 'gnt';

export const bibleVersions: Array<{
  code: BibleVersionCode;
  label: string;
  lookupCode?: string;
}> = [
  { code: 'kjv', label: 'KJV', lookupCode: 'kjv' },
  { code: 'niv', label: 'NIV' },
  { code: 'gnt', label: 'Good News' },
];

export const bibleBooks = [
  ['Genesis', 50],
  ['Exodus', 40],
  ['Leviticus', 27],
  ['Numbers', 36],
  ['Deuteronomy', 34],
  ['Joshua', 24],
  ['Judges', 21],
  ['Ruth', 4],
  ['1 Samuel', 31],
  ['2 Samuel', 24],
  ['1 Kings', 22],
  ['2 Kings', 25],
  ['1 Chronicles', 29],
  ['2 Chronicles', 36],
  ['Ezra', 10],
  ['Nehemiah', 13],
  ['Esther', 10],
  ['Job', 42],
  ['Psalm', 150],
  ['Proverbs', 31],
  ['Ecclesiastes', 12],
  ['Song of Solomon', 8],
  ['Isaiah', 66],
  ['Jeremiah', 52],
  ['Lamentations', 5],
  ['Ezekiel', 48],
  ['Daniel', 12],
  ['Hosea', 14],
  ['Joel', 3],
  ['Amos', 9],
  ['Obadiah', 1],
  ['Jonah', 4],
  ['Micah', 7],
  ['Nahum', 3],
  ['Habakkuk', 3],
  ['Zephaniah', 3],
  ['Haggai', 2],
  ['Zechariah', 14],
  ['Malachi', 4],
  ['Matthew', 28],
  ['Mark', 16],
  ['Luke', 24],
  ['John', 21],
  ['Acts', 28],
  ['Romans', 16],
  ['1 Corinthians', 16],
  ['2 Corinthians', 13],
  ['Galatians', 6],
  ['Ephesians', 6],
  ['Philippians', 4],
  ['Colossians', 4],
  ['1 Thessalonians', 5],
  ['2 Thessalonians', 3],
  ['1 Timothy', 6],
  ['2 Timothy', 4],
  ['Titus', 3],
  ['Philemon', 1],
  ['Hebrews', 13],
  ['James', 5],
  ['1 Peter', 5],
  ['2 Peter', 3],
  ['1 John', 5],
  ['2 John', 1],
  ['3 John', 1],
  ['Jude', 1],
  ['Revelation', 22],
] as const;

const chapterVerseCountCache = new Map<string, number>();

export function getBibleVersionLabel(version?: string | null) {
  return (
    bibleVersions.find((item) => item.code === version)?.label ||
    bibleVersions[0].label
  );
}

function getBibleVersion(version?: string | null) {
  return (
    bibleVersions.find((item) => item.code === version) || bibleVersions[0]
  );
}

export function parseBibleReference(reference?: string | null) {
  const cleanReference = `${reference || ''}`.trim();
  const lowerReference = cleanReference.toLowerCase();
  const matchedBook = [...bibleBooks]
    .sort((a, b) => b[0].length - a[0].length)
    .find(([book]) =>
      book === 'Psalm'
        ? lowerReference.startsWith('psalm')
        : lowerReference.startsWith(book.toLowerCase()),
  );

  if (!matchedBook) {
    return {
      book: 'John',
      startChapter: 3,
      startVerse: 16,
      endChapter: 3,
      endVerse: 16,
    };
  }

  const matchedLength =
    matchedBook[0] === 'Psalm' && lowerReference.startsWith('psalms')
      ? 'Psalms'.length
      : matchedBook[0].length;
  const rest = cleanReference.slice(matchedLength).trim();
  const match = rest.match(/^(\d+)(?::(\d+))?(?:\s*-\s*(?:(\d+):)?(\d+))?/);
  const chapterCount = getBibleChapterCount(matchedBook[0]);
  const startChapter = Math.min(
    chapterCount,
    Math.max(1, Number(match?.[1] || 1)),
  );
  const startVerse = Math.max(1, Number(match?.[2] || 1));
  const endChapter = Math.min(
    chapterCount,
    Math.max(startChapter, Number(match?.[3] || startChapter)),
  );
  const parsedEndVerse = Number(match?.[4] || startVerse);
  const endVerse =
    endChapter === startChapter
      ? Math.max(startVerse, parsedEndVerse)
      : Math.max(1, parsedEndVerse);

  return {
    book: matchedBook[0],
    startChapter,
    startVerse,
    endChapter,
    endVerse,
  };
}

export function getBibleChapterCount(book: string) {
  return bibleBooks.find(([name]) => name === book)?.[1] || 1;
}

async function fetchChapterVerseCount(book: string, chapter: number) {
  const cacheKey = `${book}:${chapter}:kjv`;
  const cachedCount = chapterVerseCountCache.get(cacheKey);
  if (cachedCount) return cachedCount;

  const response = await fetch(
    `https://thebibleapi.netlify.app/.netlify/functions/getChapter?book=${encodeURIComponent(
      book,
    )}&chapter=${chapter}&translation=kjv`,
  );

  if (!response.ok) {
    throw new Error('Chapter lookup failed');
  }

  const data = await response.json();
  const verseCount = Array.isArray(data?.verses) ? data.verses.length : 0;

  if (!verseCount) {
    throw new Error('Chapter has no verses');
  }

  chapterVerseCountCache.set(cacheKey, verseCount);
  return verseCount;
}

async function fetchVerseRange(
  book: string,
  chapter: number,
  startVerse: number,
  endVerse: number,
  version: BibleVersionCode,
) {
  const bibleVersion = getBibleVersion(version);
  if (!bibleVersion.lookupCode) {
    throw new Error('Translation text lookup is not configured');
  }

  const response = await fetch(
    `https://thebibleapi.netlify.app/.netlify/functions/getChapter?book=${encodeURIComponent(
      book,
    )}&chapter=${chapter}&translation=${bibleVersion.lookupCode}`,
  );

  if (!response.ok) {
    throw new Error('Verse lookup failed');
  }

  const data = await response.json();
  const verses = Array.isArray(data?.verses) ? data.verses : [];
  return verses
    .slice(startVerse - 1, endVerse)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type BibleSelectorProps = {
  buttonClassName?: string;
  className?: string;
  defaultReference?: string | null;
  inputClassName?: string;
  labelClassName?: string;
  defaultVersion?: string | null;
  onSelect: (verse: SelectedBibleVerse) => void;
};

export function BibleSelector({
  buttonClassName = 'btn-secondary justify-center',
  className = '',
  defaultReference,
  defaultVersion,
  inputClassName = 'input-compact mt-1.5',
  labelClassName = 'label-compact',
  onSelect,
}: BibleSelectorProps) {
  const parsedReference = useMemo(
    () => parseBibleReference(defaultReference),
    [defaultReference],
  );
  const [book, setBook] = useState(parsedReference.book);
  const [startChapter, setStartChapter] = useState(
    parsedReference.startChapter,
  );
  const [startVerse, setStartVerse] = useState(parsedReference.startVerse);
  const [endVerse, setEndVerse] = useState(parsedReference.endVerse);
  const [version, setVersion] = useState<BibleVersionCode>(
    getBibleVersion(defaultVersion).code,
  );
  const [startVerseCount, setStartVerseCount] = useState(1);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const chapterCount = getBibleChapterCount(book);
  const reference =
    startVerse === endVerse
      ? `${book} ${startChapter}:${startVerse}`
      : `${book} ${startChapter}:${startVerse}-${endVerse}`;
  const selectedVersion = getBibleVersion(version);

  useEffect(() => {
    setBook(parsedReference.book);
    setStartChapter(parsedReference.startChapter);
    setStartVerse(parsedReference.startVerse);
    setEndVerse(parsedReference.endVerse);
  }, [parsedReference]);

  useEffect(() => {
    setVersion(getBibleVersion(defaultVersion).code);
  }, [defaultVersion]);

  useEffect(() => {
    let isActive = true;

    const loadVerseCounts = async () => {
      setIsValidating(true);
      setValidationError('');

      try {
        const nextStartVerseCount = await fetchChapterVerseCount(
          book,
          startChapter,
        );

        if (!isActive) return;

        setStartVerseCount(nextStartVerseCount);
        setStartVerse((current) =>
          Math.min(Math.max(1, current), nextStartVerseCount),
        );
        setEndVerse((current) => {
          return Math.min(Math.max(startVerse, current), nextStartVerseCount);
        });
      } catch {
        if (!isActive) return;
        setValidationError('Could not validate this chapter right now.');
      } finally {
        if (isActive) {
          setIsValidating(false);
        }
      }
    };

    loadVerseCounts();

    return () => {
      isActive = false;
    };
  }, [book, startChapter, startVerse]);

  const chapters = Array.from({ length: chapterCount }, (_, index) => index + 1);
  const startVerses = Array.from(
    { length: startVerseCount },
    (_, index) => index + 1,
  );
  const endVerses = Array.from(
    { length: Math.max(0, startVerseCount - startVerse + 1) },
    (_, index) => startVerse + index,
  );

  const selectVerse = async () => {
    setIsLoading(true);
    setLookupError('');

    try {
      const text = await fetchVerseRange(
        book,
        startChapter,
        startVerse,
        endVerse,
        version,
      );
      onSelect({
        reference,
        text,
        version,
        versionLabel: selectedVersion.label,
      });
    } catch {
      setLookupError(
        selectedVersion.lookupCode
          ? 'Could not fetch the text. Reference was applied.'
          : `${selectedVersion.label} text needs a licensed Bible source. Reference was applied so you can paste the text.`,
      );
      onSelect({
        reference,
        text: '',
        version,
        versionLabel: selectedVersion.label,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-[120px_minmax(150px,1.2fr)_96px_96px_96px_auto]">
        <div>
          <label className={labelClassName}>Version</label>
          <select
            className={inputClassName}
            value={version}
            onChange={(event) =>
              setVersion(event.target.value as BibleVersionCode)
            }
          >
            {bibleVersions.map((bibleVersion) => (
              <option key={bibleVersion.code} value={bibleVersion.code}>
                {bibleVersion.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Book</label>
          <select
            className={inputClassName}
            value={book}
            onChange={(event) => {
              setBook(event.target.value);
              setStartChapter(1);
              setStartVerse(1);
              setEndVerse(1);
            }}
          >
            {bibleBooks.map(([bookName]) => (
              <option key={bookName} value={bookName}>
                {bookName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Chapter</label>
          <select
            className={inputClassName}
            value={startChapter}
            onChange={(event) => {
              const nextChapter = Number(event.target.value);
              setStartChapter(nextChapter);
              setStartVerse(1);
              setEndVerse(1);
            }}
          >
            {chapters.map((chapterNumber) => (
              <option key={chapterNumber} value={chapterNumber}>
                {chapterNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>From</label>
          <select
            className={inputClassName}
            disabled={isValidating}
            value={startVerse}
            onChange={(event) => {
              const nextVerse = Number(event.target.value);
              setStartVerse(nextVerse);
              if (endVerse < nextVerse) {
                setEndVerse(nextVerse);
              }
            }}
          >
            {startVerses.map((verseNumber) => (
              <option key={verseNumber} value={verseNumber}>
                {verseNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>To</label>
          <select
            className={inputClassName}
            disabled={isValidating}
            value={endVerse}
            onChange={(event) => setEndVerse(Number(event.target.value))}
          >
            {endVerses.map((verseNumber) => (
              <option key={verseNumber} value={verseNumber}>
                {verseNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            className={buttonClassName}
            disabled={isLoading || isValidating || Boolean(validationError)}
            type="button"
            onClick={selectVerse}
          >
            {isLoading || isValidating ? 'Checking...' : 'Use verse'}
          </button>
        </div>
      </div>
      {!selectedVersion.lookupCode ? (
        <p className="mt-2 text-xs font-medium text-amber-300">
          {selectedVersion.label} is selectable and saved, but the text must be
          pasted because this translation requires a licensed source.
        </p>
      ) : null}
      {validationError ? (
        <p className="mt-2 text-xs font-medium text-amber-300">
          {validationError}
        </p>
      ) : null}
      {lookupError ? (
        <p className="mt-2 text-xs font-medium text-amber-300">
          {lookupError}
        </p>
      ) : null}
    </div>
  );
}
