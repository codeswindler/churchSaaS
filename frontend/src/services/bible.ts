import api from './api';

const YOUVERSION_CODE_PREFIX = 'youversion:';

type YouVersionBibleVersion = {
  id: number;
  abbreviation?: string;
  localized_abbreviation?: string;
  title?: string;
  localized_title?: string;
  language_tag?: string;
  copyright_short?: string;
  publisher_url?: string;
  youversion_deep_link?: string;
  language?: {
    iso_639_1?: string;
    name?: string;
  };
};

export type RemoteBibleVersionOption = {
  code: string;
  label: string;
  source: 'youversion';
  youVersionId: string;
  abbreviation: string;
  title: string;
  languageName?: string;
  languageTag?: string;
  copyrightShort?: string;
};

type YouVersionChapter = {
  verses?: unknown[];
};

type YouVersionPassage = {
  content?: string;
  reference?: string;
};

export function isYouVersionBibleCode(code?: string | null) {
  return `${code || ''}`.startsWith(YOUVERSION_CODE_PREFIX);
}

export function getYouVersionBibleId(code: string) {
  return code.replace(YOUVERSION_CODE_PREFIX, '');
}

export async function fetchYouVersionBibleVersions() {
  const response = await api.get('/bible/versions');
  const versions = Array.isArray(response.data?.data)
    ? (response.data.data as YouVersionBibleVersion[])
    : [];

  return versions
    .map(toBibleVersionOption)
    .sort((a, b) =>
      `${a.languageName || ''} ${a.label}`.localeCompare(
        `${b.languageName || ''} ${b.label}`,
      ),
    );
}

export async function fetchYouVersionChapterVerseCount(
  versionId: string,
  bookId: string,
  chapter: number,
) {
  const response = await api.get<YouVersionChapter>('/bible/chapter', {
    params: {
      versionId,
      bookId,
      chapter,
    },
  });

  return Array.isArray(response.data?.verses) ? response.data.verses.length : 0;
}

export async function fetchYouVersionPassage(
  versionId: string,
  passageId: string,
  format: 'html' | 'text' = 'text',
) {
  const response = await api.get<YouVersionPassage>('/bible/passage', {
    params: {
      versionId,
      passageId,
      format,
    },
  });

  return response.data;
}

function toBibleVersionOption(version: YouVersionBibleVersion) {
  const abbreviation =
    version.localized_abbreviation || version.abbreviation || `${version.id}`;
  const title = version.localized_title || version.title || abbreviation;
  const languageName = version.language?.name || version.language_tag || '';
  const languageSuffix =
    languageName && languageName.toLowerCase() !== 'english'
      ? ` (${languageName})`
      : '';

  return {
    code: `${YOUVERSION_CODE_PREFIX}${version.id}`,
    label:
      title === abbreviation
        ? `${abbreviation}${languageSuffix}`
        : `${abbreviation} - ${title}${languageSuffix}`,
    source: 'youversion' as const,
    youVersionId: `${version.id}`,
    abbreviation,
    title,
    languageName,
    languageTag: version.language_tag || version.language?.iso_639_1,
    copyrightShort: version.copyright_short,
  };
}
