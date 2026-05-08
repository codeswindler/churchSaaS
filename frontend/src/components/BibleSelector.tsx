import { useEffect, useMemo, useState } from 'react';

export type SelectedBibleVerse = {
  reference: string;
  text: string;
};

const bibleBooks = [
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

function parseReference(reference?: string | null) {
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
    return { book: 'John', chapter: 3, verse: 16 };
  }

  const matchedLength =
    matchedBook[0] === 'Psalm' && lowerReference.startsWith('psalms')
      ? 'Psalms'.length
      : matchedBook[0].length;
  const rest = cleanReference.slice(matchedLength).trim();
  const match = rest.match(/^(\d+)(?::(\d+))?/);

  return {
    book: matchedBook[0],
    chapter: Math.max(1, Number(match?.[1] || 1)),
    verse: Math.max(1, Number(match?.[2] || 1)),
  };
}

function getChapterCount(book: string) {
  return bibleBooks.find(([name]) => name === book)?.[1] || 1;
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
    () => parseReference(defaultReference),
    [defaultReference],
  );
  const [book, setBook] = useState(parsedReference.book);
  const [chapter, setChapter] = useState(parsedReference.chapter);
  const [verse, setVerse] = useState(parsedReference.verse);
  const [isLoading, setIsLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const chapterCount = getChapterCount(book);
  const reference = `${book} ${chapter}:${verse}`;

  useEffect(() => {
    setBook(parsedReference.book);
    setChapter(parsedReference.chapter);
    setVerse(parsedReference.verse);
  }, [parsedReference]);

  const chapters = Array.from({ length: chapterCount }, (_, index) => index + 1);

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
      <div className="grid gap-3 md:grid-cols-[minmax(150px,1.3fr)_110px_110px_auto]">
        <div>
          <label className={labelClassName}>Book</label>
          <select
            className={inputClassName}
            value={book}
            onChange={(event) => {
              setBook(event.target.value);
              setChapter(1);
              setVerse(1);
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
            value={chapter}
            onChange={(event) => setChapter(Number(event.target.value))}
          >
            {chapters.map((chapterNumber) => (
              <option key={chapterNumber} value={chapterNumber}>
                {chapterNumber}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClassName}>Verse</label>
          <input
            className={inputClassName}
            min="1"
            type="number"
            value={verse}
            onChange={(event) =>
              setVerse(Math.max(1, Number(event.target.value || 1)))
            }
          />
        </div>
        <div className="flex items-end">
          <button
            className={buttonClassName}
            disabled={isLoading}
            type="button"
            onClick={selectVerse}
          >
            {isLoading ? 'Looking up...' : 'Use verse'}
          </button>
        </div>
      </div>
      {lookupError ? (
        <p className="mt-2 text-xs font-medium text-amber-300">
          {lookupError}
        </p>
      ) : null}
    </div>
  );
}
