export type PresentationSlideKind =
  | 'song'
  | 'scripture'
  | 'announcement'
  | 'giving'
  | 'blank';

export type PresentationTheme = 'midnight' | 'sanctuary' | 'paper';
export type PresentationFontId =
  | 'sora'
  | 'aptos'
  | 'calibri'
  | 'cambria'
  | 'georgia'
  | 'garamond'
  | 'times'
  | 'arial'
  | 'verdana'
  | 'trebuchet'
  | 'century'
  | 'consolas';
export type PresentationTransitionId =
  | 'fade'
  | 'push'
  | 'wipe'
  | 'split'
  | 'zoom'
  | 'rise'
  | 'flip'
  | 'none';
export type PresentationTextColorId =
  | 'theme'
  | 'white'
  | 'cream'
  | 'gold'
  | 'amber'
  | 'sky'
  | 'mint'
  | 'rose'
  | 'black';
export type PresentationBackgroundId =
  | 'theme'
  | 'spotlight'
  | 'cross'
  | 'default_1'
  | 'default_2'
  | 'default_3'
  | 'default_4'
  | 'default_5';

export interface PresentationBackground {
  id: PresentationBackgroundId;
  label: string;
  kind: 'theme' | 'gradient' | 'image';
  imageUrl?: string;
}

export interface PresentationSong {
  id: string;
  title: string;
  lyrics: string;
  note: string;
  updatedAt: string;
}

export interface PresentationFont {
  id: PresentationFontId;
  label: string;
}

export interface PresentationTransition {
  id: PresentationTransitionId;
  label: string;
}

export interface PresentationTextColor {
  id: PresentationTextColorId;
  label: string;
  swatch: string;
}

export interface PresentationSlide {
  id: string;
  kind: PresentationSlideKind;
  title: string;
  body: string;
  note: string;
  bibleVersion?: string | null;
  bibleVersionLabel?: string | null;
  backgroundId: PresentationBackgroundId;
  fontId: PresentationFontId;
  transitionId: PresentationTransitionId;
  textColorId: PresentationTextColorId;
}

export interface PresentationState {
  churchName: string;
  currentSlideId: string;
  isLive: boolean;
  slides: PresentationSlide[];
  theme: PresentationTheme;
  updatedAt: string;
}

const STORAGE_KEY = 'church_saas_live_presentation';
const SONG_LIBRARY_KEY = 'church_saas_presentation_songs';
const CHANNEL_NAME = 'church_saas_live_presentation_channel';

export const presentationBackgrounds: PresentationBackground[] = [
  { id: 'theme', label: 'Theme color', kind: 'theme' },
  { id: 'spotlight', label: 'Soft spotlight', kind: 'gradient' },
  { id: 'cross', label: 'Sanctuary glow', kind: 'gradient' },
  {
    id: 'default_1',
    label: 'Default 1',
    kind: 'image',
    imageUrl: '/congregation-defaults/default_1.jpg',
  },
  {
    id: 'default_2',
    label: 'Default 2',
    kind: 'image',
    imageUrl: '/congregation-defaults/default_2.jpg',
  },
  {
    id: 'default_3',
    label: 'Default 3',
    kind: 'image',
    imageUrl: '/congregation-defaults/default_3.avif',
  },
  {
    id: 'default_4',
    label: 'Default 4',
    kind: 'image',
    imageUrl: '/congregation-defaults/default_4.jpg',
  },
  {
    id: 'default_5',
    label: 'Default 5',
    kind: 'image',
    imageUrl: '/congregation-defaults/default_5.jpg',
  },
];

export const presentationFonts: PresentationFont[] = [
  { id: 'sora', label: 'Sora Modern' },
  { id: 'aptos', label: 'Aptos' },
  { id: 'calibri', label: 'Calibri' },
  { id: 'cambria', label: 'Cambria' },
  { id: 'georgia', label: 'Georgia' },
  { id: 'garamond', label: 'Garamond' },
  { id: 'times', label: 'Times New Roman' },
  { id: 'arial', label: 'Arial' },
  { id: 'verdana', label: 'Verdana' },
  { id: 'trebuchet', label: 'Trebuchet MS' },
  { id: 'century', label: 'Century Gothic' },
  { id: 'consolas', label: 'Consolas' },
];

export const presentationTransitions: PresentationTransition[] = [
  { id: 'fade', label: 'PowerPoint Fade' },
  { id: 'push', label: 'Push' },
  { id: 'wipe', label: 'Wipe' },
  { id: 'split', label: 'Split' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'rise', label: 'Rise up' },
  { id: 'flip', label: 'Flip' },
  { id: 'none', label: 'None' },
];

export const presentationTextColors: PresentationTextColor[] = [
  { id: 'theme', label: 'Theme default', swatch: 'linear-gradient(135deg, #f8fafc, #fde68a)' },
  { id: 'white', label: 'White', swatch: '#ffffff' },
  { id: 'cream', label: 'Warm cream', swatch: '#fff7d6' },
  { id: 'gold', label: 'Gold', swatch: '#facc15' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { id: 'sky', label: 'Sky', swatch: '#7dd3fc' },
  { id: 'mint', label: 'Mint', swatch: '#86efac' },
  { id: 'rose', label: 'Rose', swatch: '#fda4af' },
  { id: 'black', label: 'Black', swatch: '#111827' },
];

function createId() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function getPresentationBackground(id?: string | null) {
  return (
    presentationBackgrounds.find((background) => background.id === id) ||
    presentationBackgrounds[0]
  );
}

export function getPresentationFont(id?: string | null) {
  return presentationFonts.find((font) => font.id === id) || presentationFonts[0];
}

export function getPresentationTransition(id?: string | null) {
  return (
    presentationTransitions.find((transition) => transition.id === id) ||
    presentationTransitions[0]
  );
}

export function getPresentationTextColor(id?: string | null) {
  return (
    presentationTextColors.find((color) => color.id === id) ||
    presentationTextColors[0]
  );
}

export function createPresentationSlide(
  kind: PresentationSlideKind = 'announcement',
): PresentationSlide {
  const defaults: Record<
    PresentationSlideKind,
    Omit<
      PresentationSlide,
      'id' | 'backgroundId' | 'fontId' | 'transitionId' | 'textColorId'
    >
  > = {
    song: {
      kind: 'song',
      title: 'Worship song',
      body: 'Add lyrics here',
      note: 'Congregation worship',
    },
    scripture: {
      kind: 'scripture',
      title: 'Bible reading',
      body: 'Add verse text here',
      note: 'Scripture',
    },
    announcement: {
      kind: 'announcement',
      title: 'Announcement',
      body: 'Add announcement details here',
      note: 'Church notice',
    },
    giving: {
      kind: 'giving',
      title: 'Giving & Offerings',
      body: 'Use the church paybill or giving instructions shared by the finance team.',
      note: 'Thank you for your generosity',
    },
    blank: {
      kind: 'blank',
      title: '',
      body: '',
      note: '',
    },
  };

  return {
    id: createId(),
    ...defaults[kind],
    backgroundId: 'theme',
    fontId: 'sora',
    transitionId: 'fade',
    textColorId: 'theme',
  };
}

export function createDefaultPresentationState(
  churchName = 'Church presentation',
): PresentationState {
  const slides: PresentationSlide[] = [
    {
      id: createId(),
      kind: 'announcement',
      title: 'Welcome to Worship',
      body: 'We are glad you are here.',
      note: 'Service begins shortly',
      backgroundId: 'spotlight',
      fontId: 'sora',
      transitionId: 'fade',
      textColorId: 'white',
    },
    {
      id: createId(),
      kind: 'scripture',
      title: 'Psalm 100:2',
      body: 'Worship the Lord with gladness; come before him with joyful songs.',
      note: 'Opening scripture',
      bibleVersion: 'kjv',
      bibleVersionLabel: 'KJV',
      backgroundId: 'cross',
      fontId: 'cambria',
      transitionId: 'push',
      textColorId: 'cream',
    },
    {
      id: createId(),
      kind: 'giving',
      title: 'Giving & Offerings',
      body: 'Use the church paybill or giving instructions shared by the finance team.',
      note: 'Thank you for your generosity',
      backgroundId: 'default_1',
      fontId: 'aptos',
      transitionId: 'zoom',
      textColorId: 'gold',
    },
  ];

  return {
    churchName,
    currentSlideId: slides[0].id,
    isLive: true,
    slides,
    theme: 'midnight',
    updatedAt: new Date().toISOString(),
  };
}

export function getCurrentPresentationSlide(state: PresentationState) {
  return (
    state.slides.find((slide) => slide.id === state.currentSlideId) ||
    state.slides[0] ||
    createPresentationSlide('blank')
  );
}

function normalizePresentationState(
  value: any,
  fallbackChurchName?: string,
): PresentationState {
  const fallback = createDefaultPresentationState(fallbackChurchName);
  const slides =
    Array.isArray(value?.slides) && value.slides.length > 0
      ? value.slides.map((slide: any) => ({
          id: slide.id || createId(),
          kind: slide.kind || 'announcement',
          title: slide.title || '',
          body: slide.body || '',
          note: slide.note || '',
          bibleVersion: slide.bibleVersion || null,
          bibleVersionLabel: slide.bibleVersionLabel || null,
          backgroundId: getPresentationBackground(slide.backgroundId).id,
          fontId: getPresentationFont(slide.fontId).id,
          transitionId: getPresentationTransition(slide.transitionId).id,
          textColorId: getPresentationTextColor(slide.textColorId).id,
        }))
      : fallback.slides;
  const currentSlideId =
    slides.find((slide) => slide.id === value?.currentSlideId)?.id ||
    slides[0].id;
  const theme: PresentationTheme = ['midnight', 'sanctuary', 'paper'].includes(
    value?.theme,
  )
    ? value.theme
    : 'midnight';

  return {
    churchName: value?.churchName || fallbackChurchName || fallback.churchName,
    currentSlideId,
    isLive: value?.isLive !== false,
    slides,
    theme,
    updatedAt: value?.updatedAt || fallback.updatedAt,
  };
}

export function readPresentationSongs(): PresentationSong[] {
  try {
    const raw = localStorage.getItem(SONG_LIBRARY_KEY);
    const songs = raw ? JSON.parse(raw) : [];
    return Array.isArray(songs)
      ? songs
          .map((song: any) => ({
            id: song.id || createId(),
            title: song.title || '',
            lyrics: song.lyrics || '',
            note: song.note || '',
            updatedAt: song.updatedAt || new Date().toISOString(),
          }))
          .filter((song) => song.title || song.lyrics)
      : [];
  } catch (_error) {
    return [];
  }
}

export function savePresentationSongs(songs: PresentationSong[]) {
  localStorage.setItem(SONG_LIBRARY_KEY, JSON.stringify(songs));
  return songs;
}

export function createPresentationSongFromSlide(slide: PresentationSlide) {
  return {
    id: createId(),
    title: slide.title || 'Saved song',
    lyrics: slide.body || '',
    note: slide.note || '',
    updatedAt: new Date().toISOString(),
  };
}

export function readPresentationState(fallbackChurchName?: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createDefaultPresentationState(fallbackChurchName);
    }
    return normalizePresentationState(JSON.parse(raw), fallbackChurchName);
  } catch (_error) {
    return createDefaultPresentationState(fallbackChurchName);
  }
}

export function publishPresentationState(state: PresentationState) {
  const nextState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  window.dispatchEvent(
    new CustomEvent<PresentationState>('presentation-state-change', {
      detail: nextState,
    }),
  );

  if ('BroadcastChannel' in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(nextState);
    channel.close();
  }

  return nextState;
}

export function subscribePresentationState(
  listener: (state: PresentationState) => void,
  fallbackChurchName?: string,
) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      listener(readPresentationState(fallbackChurchName));
    }
  };
  const handleCustom = (event: Event) => {
    listener((event as CustomEvent<PresentationState>).detail);
  };
  const channel =
    'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  if (channel) {
    channel.onmessage = (event) => {
      listener(normalizePresentationState(event.data, fallbackChurchName));
    };
  }

  window.addEventListener('storage', handleStorage);
  window.addEventListener('presentation-state-change', handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('presentation-state-change', handleCustom);
    channel?.close();
  };
}
