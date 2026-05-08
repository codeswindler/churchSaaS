import { useEffect, useMemo, useState } from 'react';

export type SelectedBibleVerse = {
  reference: string;
  text: string;
};

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
  const cacheKey = `${book}:${chapter}`;
  const cachedCount = chapterVerseCountCache.get(cacheKey);
  if (cachedCount) return cachedCount;

  const response = await fetch(
    `https://bible-api.com/${encodeURIComponent(`${book} ${chapter}`)}`,
  );

  if (!response.ok) {
    throw new Error('Chapter lookup failed');
  }

  const data = await response.json();
  const verseCount = Array.isArray(data?.verses)
    ? Math.max(...data.verses.map((item: any) => Number(item.verse || 0)))
    : 0;

  if (!verseCount) {
    throw new Error('Chapter has no verses');
  }

  chapterVerseCountCache.set(cacheKey, verseCount);
  return verseCount;
}

async function fetchVerse(reference: string) {
  const response = await fetch(
    `https://bible-api.com/${encodeURIComponent(reference)}`,
  );

  if (!response.ok) {
    throw new Error('Verse lookup failed');
  }

  const data = await response.json();
  return `${data?.text || ''}`.replace(/\s+/g, ' ').trim();
}

type BibleSelectorProps = {
  buttonClassName?: string;
  className?: string;
  defaultReference?: string | null;
  inputClassName?: string;
  labelClassName?: string;
  onSelect: (verse: SelectedBibleVerse) => void;
};

export function BibleSelector({
  buttonClassName = 'btn-secondary justify-center',
  className = '',
  defaultReference,
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
  const [endChapter, setEndChapter] = useState(parsedReference.endChapter);
  const [endVerse, setEndVerse] = useState(parsedReference.endVerse);
  const [startVerseCount, setStartVerseCount] = useState(1);
  const [endVerseCount, setEndVerseCount] = useState(1);
  const [isValidating, setIsValidating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [lookupError, setLookupError] = useState('');
  const chapterCount = getBibleChapterCount(book);
  const endVerseMinimum = endChapter === startChapter ? startVerse : 1;
  const reference =
    startChapter === endChapter && startVerse === endVerse
      ? `${book} ${startChapter}:${startVerse}`
      : startChapter === endChapter
        ? `${book} ${startChapter}:${startVerse}-${endVerse}`
        : `${book} ${startChapter}:${startVerse}-${endChapter}:${endVerse}`;

  useEffect(() => {
    setBook(parsedReference.book);
    setStartChapter(parsedReference.startChapter);
    setStartVerse(parsedReference.startVerse);
    setEndChapter(parsedReference.endChapter);
    setEndVerse(parsedReference.endVerse);
  }, [parsedReference]);

  useEffect(() => {
    let isActive = true;

    const loadVerseCounts = async () => {
      setIsValidating(true);
      setValidationError('');

      try {
        const [nextStartVerseCount, nextEndVerseCount] = await Promise.all([
          fetchChapterVerseCount(book, startChapter),
          endChapter === startChapter
            ? fetchChapterVerseCount(book, startChapter)
            : fetchChapterVerseCount(book, endChapter),
        ]);

        if (!isActive) return;

        setStartVerseCount(nextStartVerseCount);
        setEndVerseCount(nextEndVerseCount);
        setStartVerse((current) =>
          Math.min(Math.max(1, current), nextStartVerseCount),
        );
        setEndVerse((current) => {
          const minimum = endChapter === startChapter ? startVerse : 1;
          return Math.min(Math.max(minimum, current), nextEndVerseCount);
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
  }, [book, endChapter, startChapter, startVerse]);

  const chapters = Array.from({ length: chapterCount }, (_, index) => index + 1);
  const endChapters = chapters.filter((chapter) => chapter >= startChapter);
  const startVerses = Array.from(
    { length: startVerseCount },
    (_, index) => index + 1,
  );
  const endVerses = Array.from(
    { length: Math.max(0, endVerseCount - endVerseMinimum + 1) },
    (_, index) => endVerseMinimum + index,
  );

  const selectVerse = async () => {
    setIsLoading(true);
    setLookupError('');

    try {
      const text = await fetchVerse(reference);
      onSelect({ reference, text });
    } catch {
      setLookupError('Could not fetch the text. Reference was applied.');
      onSelect({ reference, text: '' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={className}>
      <div className="grid gap-3 md:grid-cols-[minmax(150px,1.3fr)_96px_96px_96px_96px_auto]">
        <div>
          <label className={labelClassName}>Book</label>
          <select
            className={inputClassName}
            value={book}
            onChange={(event) => {
              setBook(event.target.value);
              setStartChapter(1);
              setStartVerse(1);
              setEndChapter(1);
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
          <label className={labelClassName}>Start ch.</label>
          <select
            className={inputClassName}
            value={startChapter}
            onChange={(event) => {
              const nextChapter = Number(event.target.value);
              setStartChapter(nextChapter);
              setStartVerse(1);
              setEndChapter(nextChapter);
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
          <label className={labelClassName}>Start vs.</label>
          <select
            className={inputClassName}
            disabled={isValidating}
            value={startVerse}
            onChange={(event) => {
              const nextVerse = Number(event.target.value);
              setStartVerse(nextVerse);
              if (endChapter === startChapter && endVerse < nextVerse) {
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
          <label className={labelClassName}>End ch.</label>
          <select
            className={inputClassName}
            value={endChapter}
            onChange={(event) => {
              const nextChapter = Number(event.target.value);
              setEndChapter(nextChapter);
              setEndVerse(nextChapter === startChapter ? startVerse : 1);
            }}
          >
            {endChapters.map((chapterNumber) => (
              <option key={chapterNumber} value={chapterNumber}>
                {chapterNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>End vs.</label>
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
