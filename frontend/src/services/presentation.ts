export type PresentationSlideKind =
  | 'song'
  | 'scripture'
  | 'announcement'
  | 'giving'
  | 'blank';

export type PresentationTheme = 'midnight' | 'sanctuary' | 'paper';

export interface PresentationSlide {
  id: string;
  kind: PresentationSlideKind;
  title: string;
  body: string;
  note: string;
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
const CHANNEL_NAME = 'church_saas_live_presentation_channel';

function createId() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
}

export function createPresentationSlide(
  kind: PresentationSlideKind = 'announcement',
): PresentationSlide {
  const defaults: Record<PresentationSlideKind, Omit<PresentationSlide, 'id'>> = {
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
    },
    {
      id: createId(),
      kind: 'scripture',
      title: 'Psalm 100:2',
      body: 'Worship the Lord with gladness; come before him with joyful songs.',
      note: 'Opening scripture',
    },
    {
      id: createId(),
      kind: 'giving',
      title: 'Giving & Offerings',
      body: 'Use the church paybill or giving instructions shared by the finance team.',
      note: 'Thank you for your generosity',
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
