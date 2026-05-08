import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bibleBooks,
  getBibleChapterCount,
  parseBibleReference,
} from './BibleSelector';

type BibleReaderProps = {
  buttonClassName: string;
  defaultReference?: string | null;
  inputClassName: string;
  isNightMode?: boolean;
  labelClassName: string;
  panelClassName: string;
};

type BibleChapterVerse = {
  verse: number;
  text: string;
};

async function fetchBibleChapter(book: string, chapter: number) {
  const response = await fetch(
    `https://bible-api.com/${encodeURIComponent(`${book} ${chapter}`)}`,
  );

  if (!response.ok) {
    throw new Error('Unable to load Bible chapter');
  }

  const data = await response.json();
  const verses = Array.isArray(data?.verses)
    ? data.verses.map((item: any) => ({
        verse: Number(item.verse || 0),
        text: `${item.text || ''}`.replace(/\s+/g, ' ').trim(),
      }))
    : [];

  return {
    reference: data?.reference || `${book} ${chapter}`,
    verses: verses.filter((item: BibleChapterVerse) => item.verse && item.text),
  };
}

export function BibleReader({
  buttonClassName,
  defaultReference,
  inputClassName,
  isNightMode = false,
  labelClassName,
  panelClassName,
}: BibleReaderProps) {
  const parsedReference = useMemo(
    () => parseBibleReference(defaultReference),
    [defaultReference],
  );
  const [book, setBook] = useState(parsedReference.book);
  const [chapter, setChapter] = useState(parsedReference.startChapter);
  const [chapterReference, setChapterReference] = useState('');
  const [verses, setVerses] = useState<BibleChapterVerse[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const contentRef = useRef<HTMLDivElement | null>(null);
  const chapterCount = getBibleChapterCount(book);
  const canGoPrevious =
    chapter > 1 || bibleBooks.findIndex(([name]) => name === book) > 0;
  const canGoNext =
    chapter < chapterCount ||
    bibleBooks.findIndex(([name]) => name === book) < bibleBooks.length - 1;

  useEffect(() => {
    setBook(parsedReference.book);
    setChapter(parsedReference.startChapter);
  }, [parsedReference]);

  useEffect(() => {
    if (!isOpen) return undefined;

    let isActive = true;

    const loadChapter = async () => {
      setIsLoading(true);
      setErrorMessage('');

      try {
        const nextChapter = await fetchBibleChapter(book, chapter);
        if (!isActive) return;
        setChapterReference(nextChapter.reference);
        setVerses(nextChapter.verses);
        contentRef.current?.scrollTo({ top: 0 });
      } catch {
        if (!isActive) return;
        setChapterReference(`${book} ${chapter}`);
        setVerses([]);
        setErrorMessage('This Bible chapter could not be loaded right now.');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadChapter();

    return () => {
      isActive = false;
    };
  }, [book, chapter, isOpen]);

  const moveChapter = (direction: -1 | 1) => {
    const bookIndex = bibleBooks.findIndex(([name]) => name === book);

    if (direction === -1) {
      if (chapter > 1) {
        setChapter((current) => current - 1);
        return;
      }

      const previousBook = bibleBooks[bookIndex - 1];
      if (previousBook) {
        setBook(previousBook[0]);
        setChapter(previousBook[1]);
      }
      return;
    }

    if (chapter < chapterCount) {
      setChapter((current) => current + 1);
      return;
    }

    const nextBook = bibleBooks[bookIndex + 1];
    if (nextBook) {
      setBook(nextBook[0]);
      setChapter(1);
    }
  };

  return (
    <div className={panelClassName}>
      <button
        className={`${buttonClassName} w-full`}
        type="button"
        onClick={() => setIsOpen((current) => !current)}
      >
        <BookOpen size={16} />
        {isOpen ? 'Close Bible' : 'Open Bible'}
      </button>

      {isOpen ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(180px,1fr)_110px] lg:max-w-[520px]">
            <div>
              <label className={labelClassName}>Book</label>
              <select
                className={inputClassName}
                value={book}
                onChange={(event) => {
                  setBook(event.target.value);
                  setChapter(1);
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
                {Array.from(
                  { length: chapterCount },
                  (_, index) => index + 1,
                ).map((chapterNumber) => (
                  <option key={chapterNumber} value={chapterNumber}>
                    {chapterNumber}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-xl font-semibold">
              {chapterReference || `${book} ${chapter}`}
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button
                className={buttonClassName}
                disabled={!canGoPrevious || isLoading}
                type="button"
                onClick={() => moveChapter(-1)}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                className={buttonClassName}
                disabled={!canGoNext || isLoading}
                type="button"
                onClick={() => moveChapter(1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div
            ref={contentRef}
            className={`mt-4 max-h-[520px] overflow-y-auto rounded-[24px] border p-5 leading-8 ${
              isNightMode
                ? 'border-white/10 bg-white/[0.05] text-stone-100'
                : 'border-stone-200 bg-[#fbfaf6] text-stone-800'
            }`}
          >
            {isLoading ? (
              <p
                className={isNightMode ? 'text-stone-300' : 'text-stone-600'}
              >
                Opening chapter...
              </p>
            ) : null}
            {!isLoading && errorMessage ? (
              <p className="text-sm font-semibold text-amber-500">
                {errorMessage}
              </p>
            ) : null}
            {!isLoading && !errorMessage
              ? verses.map((item) => (
                  <p key={item.verse} className="mb-4 last:mb-0">
                    <sup
                      className={`mr-2 text-xs font-semibold ${
                        isNightMode ? 'text-amber-200' : 'text-[#9b6b19]'
                      }`}
                    >
                      {item.verse}
                    </sup>
                    {item.text}
                  </p>
                ))
              : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
