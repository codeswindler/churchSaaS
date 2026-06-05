import {
  BookOpen,
  Bold,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Mic,
  MonitorPlay,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipBack,
  Pencil,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BibleSelector,
  getBibleVersionLabel,
  type SelectedBibleVerse,
} from '../../components/BibleSelector';
import api, { getSession } from '../../services/api';
import {
  buildReferenceAudioFrames,
  createLiveAudioSampler,
  findBestAudioOffset,
  type AudioSyncFrame,
} from '../../services/localAudioSync';
import {
  createPresentationMediaBackground,
  createDefaultPresentationState,
  createPresentationSlide,
  createPresentationSongFromSlide,
  getCurrentPresentationSlide,
  getPresentationBackground,
  getPresentationSlideKindLabel,
  getPresentationTransitionMs,
  getLyricLineIndexForTime,
  publishPresentationState,
  readPresentationBackgrounds,
  readPresentationState,
  readPresentationSongs,
  savePresentationBackgrounds,
  savePresentationSongs,
  splitPresentationLyrics,
  subscribePresentationState,
  upsertPresentationBackground,
  presentationBackgrounds,
  presentationFonts,
  presentationTextColors,
  presentationTransitions,
  type PresentationBackground,
  type PresentationBackgroundId,
  type PresentationFontId,
  type PresentationSlide,
  type PresentationSlideKind,
  type PresentationSong,
  type PresentationState,
  type PresentationTheme,
  type PresentationTextColorId,
  type PresentationTextSizeId,
  type PresentationTransitionId,
} from '../../services/presentation';

const slideKindOptions: Array<{
  value: PresentationSlideKind;
  label: string;
  description: string;
}> = [
  {
    value: 'announcement',
    label: 'Announcement',
    description: 'Church notices and service prompts.',
  },
  {
    value: 'song',
    label: 'Song',
    description: 'Worship lyrics and repeated lines.',
  },
  {
    value: 'scripture',
    label: 'Scripture',
    description: 'Bible readings and sermon references.',
  },
  {
    value: 'giving',
    label: 'Giving',
    description: 'Offering and paybill instructions.',
  },
  {
    value: 'custom',
    label: 'Custom',
    description: 'Freeform slide with your own display label.',
  },
  {
    value: 'blank',
    label: 'Blank',
    description: 'Clear the screen during transitions.',
  },
];

const textSizeOptions: Array<{
  value: PresentationTextSizeId;
  label: string;
}> = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'huge', label: 'Huge' },
];

function slideStyleClassNames(slide: PresentationSlide) {
  return [
    slide.bodyTextBold !== false ? 'presentation-body-bold' : '',
    slide.bodyTextItalic ? 'presentation-body-italic' : '',
    slide.bodyTextUnderline ? 'presentation-body-underline' : '',
    `presentation-body-size-${slide.bodyTextSize || 'medium'}`,
  ]
    .filter(Boolean)
    .join(' ');
}

function resolveChurchName() {
  const session = getSession();
  return session?.church?.name || session?.user?.name || 'Church presentation';
}

function slideIndex(state: PresentationState) {
  const index = state.slides.findIndex(
    (slide) => slide.id === state.currentSlideId,
  );
  return index >= 0 ? index : 0;
}

function SlideBackground({ backgroundId }: { backgroundId?: string | null }) {
  const background = getPresentationBackground(backgroundId);

  if (background.kind !== 'image' || !background.imageUrl) {
    return null;
  }

  return (
    <img
      alt=""
      className="presentation-background-image"
      src={background.imageUrl}
    />
  );
}

function cloneSlide(slide: PresentationSlide): PresentationSlide {
  return { ...slide };
}

function resolveMediaUrl(value?: string | null) {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return value;
}

function collectCongregationBackgrounds(data: any): PresentationBackground[] {
  if (!data) return [];

  const entries: Array<{ imageUrl?: string | null; label?: string | null }> = [
    data.featuredImageUrl
      ? { imageUrl: data.featuredImageUrl, label: 'Current cover' }
      : {},
    ...(Array.isArray(data.events)
      ? data.events.map((item: any) => ({
          imageUrl: item.imageUrl,
          label: item.title || 'Announcement image',
        }))
      : []),
    ...(Array.isArray(data.sermons)
      ? data.sermons.map((item: any) => ({
          imageUrl: item.imageUrl,
          label: item.title || 'Sermon image',
        }))
      : []),
    ...(Array.isArray(data.galleryImages)
      ? data.galleryImages
          .filter((item: any) => item?.isActive !== false)
          .map((item: any) => ({
            imageUrl: item.imageUrl,
            label: item.title || 'Gallery image',
          }))
      : []),
  ];

  const seen = new Set<string>();
  return entries
    .map((entry) => {
      const imageUrl = resolveMediaUrl(entry.imageUrl);
      if (!imageUrl || seen.has(imageUrl)) return null;
      seen.add(imageUrl);
      return createPresentationMediaBackground(
        imageUrl,
        entry.label || 'Church image',
        'media',
        false,
      );
    })
    .filter(Boolean) as PresentationBackground[];
}

function PresentationSlideLayer({
  isLive,
  mode,
  slide,
}: {
  isLive: boolean;
  mode: 'enter' | 'exit' | 'static';
  slide: PresentationSlide;
}) {
  const background = getPresentationBackground(slide.backgroundId);
  const lyricLines = splitPresentationLyrics(slide.body);
  const activeLineIndex = Math.max(
    0,
    Math.min(lyricLines.length - 1, slide.lyricActiveLineIndex || 0),
  );
  const previewLines = lyricLines.slice(
    Math.max(0, activeLineIndex - 2),
    Math.min(lyricLines.length, activeLineIndex + 3),
  );
  const firstPreviewLine = Math.max(0, activeLineIndex - 2);
  return (
    <div
      className={`presentation-slide-motion presentation-layer-${mode} presentation-background-${background.id} presentation-font-${slide.fontId || 'sora'} presentation-text-color-${slide.textColorId || 'theme'} ${slideStyleClassNames(slide)}`}
      key={`${slide.id}-${slide.backgroundId}-${slide.transitionId}-${mode}`}
    >
      <SlideBackground backgroundId={slide.backgroundId} />
      <div className="presentation-stage-inner">
        {!isLive ? (
          <div className="presentation-paused-preview">
            <Pause size={28} />
            <span>Output paused</span>
          </div>
        ) : slide.kind === 'blank' ? null : (
          <>
            <p className="presentation-kind-label">
              {getPresentationSlideKindLabel(slide)}
            </p>
            <h3>{slide.title || 'Untitled slide'}</h3>
            {slide.kind === 'song' && lyricLines.length > 0 ? (
              <div className="presentation-preview-lyrics">
                {previewLines.map((line, index) => {
                  const lineIndex = firstPreviewLine + index;
                  return (
                    <p
                      key={`${line}-${lineIndex}`}
                      className={lineIndex === activeLineIndex ? 'is-active' : ''}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="presentation-body-copy">
                {slide.body || 'Add slide content'}
              </p>
            )}
            {slide.note ? <p className="presentation-note">{slide.note}</p> : null}
          </>
        )}
      </div>
      <span
        aria-hidden="true"
        className={`hidden presentation-background-${background.id}`}
      />
    </div>
  );
}

function slideMotionSignature(slide: PresentationSlide) {
  return `${slide.id}:${slide.backgroundId}:${slide.transitionId}`;
}

function useTransitionSlides(slide: PresentationSlide) {
  const [previousSlide, setPreviousSlide] = useState<PresentationSlide | null>(null);
  const [activeSlide, setActiveSlide] = useState(slide);
  const [activeSignature, setActiveSignature] = useState(() =>
    slideMotionSignature(slide),
  );

  useEffect(() => {
    const nextSignature = slideMotionSignature(slide);
    if (nextSignature === activeSignature) {
      setActiveSlide(slide);
      return;
    }

    const duration = getPresentationTransitionMs(slide.transitionId);
    setPreviousSlide(activeSlide);
    setActiveSlide(slide);
    setActiveSignature(nextSignature);

    if (!duration) {
      setPreviousSlide(null);
      return;
    }

    const timer = window.setTimeout(() => setPreviousSlide(null), duration);
    return () => window.clearTimeout(timer);
  }, [activeSignature, activeSlide, slide]);

  return { activeSlide, previousSlide };
}

function PreviewSlide({
  isLive,
  slide,
  theme,
}: {
  isLive: boolean;
  slide: PresentationSlide;
  theme: PresentationTheme;
}) {
  const { activeSlide, previousSlide } = useTransitionSlides(slide);
  const background = getPresentationBackground(activeSlide.backgroundId);
  const transitionId = activeSlide.transitionId || 'fade';
  return (
    <div
      className={`presentation-stage-preview presentation-theme-${theme} presentation-background-${background.id} presentation-font-${activeSlide.fontId || 'sora'} presentation-text-color-${activeSlide.textColorId || 'theme'} presentation-transition-${transitionId}`}
    >
      {previousSlide ? (
        <PresentationSlideLayer isLive={isLive} mode="exit" slide={previousSlide} />
      ) : null}
      <PresentationSlideLayer
        isLive={isLive}
        mode={previousSlide ? 'enter' : 'static'}
        slide={activeSlide}
      />
    </div>
  );
}

export default function ChurchPresentation() {
  const churchName = useMemo(resolveChurchName, []);
  const [state, setState] = useState(() => readPresentationState(churchName));
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [draftSlide, setDraftSlide] = useState<PresentationSlide | null>(null);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [isTextColorOpen, setIsTextColorOpen] = useState(false);
  const [isBackgroundOpen, setIsBackgroundOpen] = useState(false);
  const [isUploadingBackground, setIsUploadingBackground] = useState(false);
  const [churchBackgrounds, setChurchBackgrounds] = useState<
    PresentationBackground[]
  >([]);
  const [customBackgrounds, setCustomBackgrounds] = useState<
    PresentationBackground[]
  >(() => readPresentationBackgrounds());
  const [savedSongs, setSavedSongs] = useState<PresentationSong[]>(() =>
    readPresentationSongs(),
  );
  const [isBuildingReference, setIsBuildingReference] = useState(false);
  const [isListeningSync, setIsListeningSync] = useState(false);
  const referenceFramesRef = useRef<AudioSyncFrame[]>([]);
  const liveFramesRef = useRef<AudioSyncFrame[]>([]);
  const stopLiveSamplerRef = useRef<(() => void) | null>(null);
  const currentIndex = slideIndex(state);
  const currentSlide = getCurrentPresentationSlide(state);
  const currentLyricLines = useMemo(
    () => splitPresentationLyrics(currentSlide.body),
    [currentSlide.body],
  );
  const displayUrl =
    typeof window === 'undefined'
      ? '/display/church-presentation'
      : `${window.location.origin}/display/church-presentation`;

  useEffect(() => subscribePresentationState(setState, churchName), [churchName]);
  useEffect(() => {
    let isActive = true;

    api
      .get('/church/congregation-page')
      .then((response) => {
        if (isActive) {
          setChurchBackgrounds(collectCongregationBackgrounds(response.data));
        }
      })
      .catch(() => {
        if (isActive) {
          setChurchBackgrounds([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      stopLiveSamplerRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!isListeningSync) return;
    stopLiveSamplerRef.current?.();
    stopLiveSamplerRef.current = null;
    liveFramesRef.current = [];
    setIsListeningSync(false);
  }, [currentSlide.id, isListeningSync]);

  useEffect(() => {
    if (currentSlide.kind !== 'song') return;
    referenceFramesRef.current = currentSlide.referenceAudioFrames || [];
  }, [currentSlide.id, currentSlide.kind, currentSlide.referenceAudioFrames]);

  useEffect(() => {
    if (
      currentSlide.kind !== 'song' ||
      currentSlide.lyricScrollPaused !== false ||
      currentLyricLines.length <= 1
    ) {
      return;
    }

    const speed = Math.max(0.2, Math.min(4, currentSlide.lyricScrollSpeed || 1));
    const intervalId = window.setInterval(() => {
      setState((currentState) => {
        const slide = getCurrentPresentationSlide(currentState);
        if (
          slide.id !== currentSlide.id ||
          slide.kind !== 'song' ||
          slide.lyricScrollPaused !== false
        ) {
          return currentState;
        }

        const lines = splitPresentationLyrics(slide.body);
        const currentLine = Math.max(0, slide.lyricActiveLineIndex || 0);
        const nextLine = Math.min(lines.length - 1, currentLine + 1);
        if (nextLine === currentLine) return currentState;

        return publishPresentationState({
          ...currentState,
          slides: currentState.slides.map((item) =>
            item.id === slide.id
              ? {
                  ...item,
                  lyricActiveLineIndex: nextLine,
                  lyricSyncStatus: 'idle',
                  lyricSyncUpdatedAt: new Date().toISOString(),
                }
              : item,
          ),
        });
      });
    }, Math.max(900, 3500 / speed));

    return () => window.clearInterval(intervalId);
  }, [
    currentLyricLines.length,
    currentSlide.id,
    currentSlide.kind,
    currentSlide.lyricScrollPaused,
    currentSlide.lyricScrollSpeed,
  ]);

  const availableBackgrounds = useMemo(() => {
    const byId = new Map<string, PresentationBackground>();
    [...presentationBackgrounds, ...churchBackgrounds, ...customBackgrounds].forEach(
      (background) => {
        byId.set(background.id, background);
      },
    );
    return Array.from(byId.values());
  }, [churchBackgrounds, customBackgrounds]);

  const commitState = (nextState: PresentationState) => {
    setState(publishPresentationState(nextState));
  };

  const updateSlide = (slideId: string, patch: Partial<PresentationSlide>) => {
    setState((currentState) => {
      return publishPresentationState({
        ...currentState,
        slides: currentState.slides.map((slide) =>
          slide.id === slideId ? { ...slide, ...patch } : slide,
        ),
      });
    });
  };

  const updateCurrentSlide = (patch: Partial<PresentationSlide>) => {
    updateSlide(currentSlide.id, patch);
  };

  const beginAddSlide = () => {
    setDraftSlide(null);
    setEditorMode('add');
  };

  const chooseNewSlideKind = (kind: PresentationSlideKind) => {
    setDraftSlide(createPresentationSlide(kind));
  };

  const beginEditSlide = (slide = currentSlide) => {
    setDraftSlide(cloneSlide(slide));
    setEditorMode('edit');
  };

  const closeEditor = () => {
    setDraftSlide(null);
    setEditorMode(null);
  };

  const updateDraftSlide = (patch: Partial<PresentationSlide>) => {
    setDraftSlide((current) => (current ? { ...current, ...patch } : current));
  };

  const selectBackground = (background: PresentationBackground) => {
    if (background.imageUrl && background.source && background.source !== 'default') {
      const nextBackgrounds = upsertPresentationBackground(background);
      setCustomBackgrounds(nextBackgrounds);
    }
    updateDraftSlide({ backgroundId: background.id as PresentationBackgroundId });
  };

  const deletePresentationBackground = (backgroundId: string) => {
    const nextBackgrounds = savePresentationBackgrounds(
      customBackgrounds.filter((background) => background.id !== backgroundId),
    );
    setCustomBackgrounds(nextBackgrounds);
    if (draftSlide?.backgroundId === backgroundId) {
      updateDraftSlide({ backgroundId: 'theme' });
    }
    toast.success('Background removed');
  };

  const uploadPresentationBackground = async (file?: File) => {
    if (!file) return;

    const payload = new FormData();
    payload.append('image', file);
    setIsUploadingBackground(true);

    try {
      const response = await api.post('/church/congregation-page/images', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const background = createPresentationMediaBackground(
        resolveMediaUrl(response.data.imageUrl),
        file.name.replace(/\.[^.]+$/, '') || 'Presentation upload',
        'upload',
        true,
      );
      const nextBackgrounds = upsertPresentationBackground(background);
      setCustomBackgrounds(nextBackgrounds);
      updateDraftSlide({ backgroundId: background.id as PresentationBackgroundId });
      setIsBackgroundOpen(true);
      toast.success('Background uploaded');
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Unable to upload image');
    } finally {
      setIsUploadingBackground(false);
    }
  };

  const saveDraftSlide = () => {
    if (!draftSlide) {
      return;
    }

    if (editorMode === 'add') {
      commitState({
        ...state,
        currentSlideId: draftSlide.id,
        slides: [...state.slides, draftSlide],
      });
      toast.success('Slide added');
      closeEditor();
      return;
    }

    commitState({
      ...state,
      slides: state.slides.map((slide) =>
        slide.id === draftSlide.id ? draftSlide : slide,
      ),
    });
    toast.success('Slide saved');
    closeEditor();
  };

  const deleteSlide = (slideId = currentSlide.id) => {
    if (state.slides.length <= 1) {
      toast.error('Keep at least one slide');
      return;
    }
    const removedIndex = state.slides.findIndex((slide) => slide.id === slideId);
    const nextSlides = state.slides.filter((slide) => slide.id !== slideId);
    const nextIndex = Math.min(Math.max(removedIndex, 0), nextSlides.length - 1);
    const currentSlideId =
      state.currentSlideId === slideId ? nextSlides[nextIndex].id : state.currentSlideId;
    commitState({
      ...state,
      currentSlideId,
      slides: nextSlides,
    });
    toast.success('Slide removed');
  };

  const goToSlide = (index: number) => {
    const nextSlide = state.slides[index];
    if (!nextSlide) return;
    commitState({ ...state, currentSlideId: nextSlide.id });
  };

  const reorderSlides = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = state.slides.findIndex((slide) => slide.id === sourceId);
    const targetIndex = state.slides.findIndex((slide) => slide.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const nextSlides = [...state.slides];
    const [movedSlide] = nextSlides.splice(sourceIndex, 1);
    nextSlides.splice(targetIndex, 0, movedSlide);
    commitState({ ...state, slides: nextSlides });
  };

  const goPrevious = () => {
    goToSlide(Math.max(0, currentIndex - 1));
  };

  const goNext = () => {
    goToSlide(Math.min(state.slides.length - 1, currentIndex + 1));
  };

  const openDisplay = () => {
    window.open(displayUrl, 'church-presentation-display', 'noopener,noreferrer');
  };

  const copyDisplayUrl = async () => {
    await navigator.clipboard.writeText(displayUrl);
    toast.success('Display link copied');
  };

  const resetDeck = () => {
    commitState(createDefaultPresentationState(churchName));
    toast.success('Presentation reset');
  };

  const applyBibleVerse = (verse: SelectedBibleVerse) => {
    updateDraftSlide({
      kind: 'scripture',
      title: `${verse.reference} (${verse.versionLabel})`,
      body: verse.text || draftSlide?.body || currentSlide.body,
      note: 'Scripture',
      bibleVersion: verse.version,
      bibleVersionLabel: verse.versionLabel,
    });
  };

  const saveCurrentSong = () => {
    const sourceSlide = draftSlide || currentSlide;
    if (sourceSlide.kind !== 'song') {
      toast.error('Switch this slide to Song first');
      return;
    }

    const nextSong = createPresentationSongFromSlide(sourceSlide);
    const nextSongs = savePresentationSongs([nextSong, ...savedSongs]);
    setSavedSongs(nextSongs);
    toast.success('Song saved');
  };

  const loadSong = (song: PresentationSong) => {
    updateDraftSlide({
      kind: 'song',
      title: song.title,
      body: song.lyrics,
      note: song.note,
      lyricCueTimings: song.cueTimings || [],
      lyricScrollSpeed: song.scrollSpeed || 1,
      lyricActiveLineIndex: 0,
      lyricScrollPaused: true,
      lyricSyncStatus: 'idle',
      referenceAudioFrames: song.referenceAudioFrames || [],
      referenceAudioName: song.referenceAudioName || null,
      songLibraryId: song.id,
    });
    toast.success('Song loaded');
  };

  const deleteSong = (songId: string) => {
    const nextSongs = savePresentationSongs(
      savedSongs.filter((song) => song.id !== songId),
    );
    setSavedSongs(nextSongs);
    toast.success('Song removed');
  };

  const setLyricLine = (lineIndex: number, status: PresentationSlide['lyricSyncStatus'] = 'idle') => {
    if (currentSlide.kind !== 'song') return;
    updateCurrentSlide({
      lyricActiveLineIndex: Math.max(
        0,
        Math.min(currentLyricLines.length - 1, lineIndex),
      ),
      lyricSyncStatus: status,
      lyricSyncUpdatedAt: new Date().toISOString(),
    });
  };

  const updateLyricSpeed = (nextSpeed: number) => {
    if (currentSlide.kind !== 'song') return;
    updateCurrentSlide({
      lyricScrollSpeed: Math.max(0.2, Math.min(4, nextSpeed)),
    });
  };

  const handleReferenceAudioUpload = async (file?: File) => {
    if (!file) return;
    setIsBuildingReference(true);
    try {
      referenceFramesRef.current = await buildReferenceAudioFrames(file);
      updateCurrentSlide({
        referenceAudioFrames: referenceFramesRef.current,
        referenceAudioName: file.name,
        lyricSyncStatus: 'idle',
        lyricSyncUpdatedAt: new Date().toISOString(),
      });
      toast.success('Reference audio ready');
    } catch (_error) {
      toast.error('Unable to read that audio file');
    } finally {
      setIsBuildingReference(false);
    }
  };

  const toggleLocalAudioSync = async () => {
    if (isListeningSync) {
      stopLiveSamplerRef.current?.();
      stopLiveSamplerRef.current = null;
      liveFramesRef.current = [];
      setIsListeningSync(false);
      updateCurrentSlide({
        lyricSyncStatus: 'idle',
        lyricSyncUpdatedAt: new Date().toISOString(),
      });
      return;
    }

    if (currentSlide.kind !== 'song') {
      toast.error('Choose a song slide first');
      return;
    }
    if (referenceFramesRef.current.length === 0) {
      toast.error('Upload a reference audio file first');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setIsListeningSync(true);
      updateCurrentSlide({
        lyricScrollPaused: true,
        lyricSyncStatus: 'listening',
        lyricSyncUpdatedAt: new Date().toISOString(),
      });

      stopLiveSamplerRef.current = createLiveAudioSampler(stream, (frame) => {
        liveFramesRef.current = [...liveFramesRef.current, frame].slice(-28);
        const match = findBestAudioOffset(
          liveFramesRef.current,
          referenceFramesRef.current,
        );
        if (!match) return;

        const referenceDuration =
          referenceFramesRef.current[referenceFramesRef.current.length - 1]?.timeMs ||
          1;
        const lineIndex =
          match.confidence >= 0.58
            ? currentSlide.lyricCueTimings?.length
              ? getLyricLineIndexForTime(currentSlide.lyricCueTimings, match.offsetMs)
              : Math.floor(
                  (match.offsetMs / referenceDuration) *
                    Math.max(1, currentLyricLines.length - 1),
                )
            : currentSlide.lyricActiveLineIndex || 0;

        updateCurrentSlide({
          lyricActiveLineIndex: lineIndex,
          lyricSyncStatus: match.confidence >= 0.58 ? 'locked' : 'no-lock',
          lyricSyncUpdatedAt: new Date().toISOString(),
        });
      });
    } catch (_error) {
      toast.error('Microphone access was blocked');
      setIsListeningSync(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
              Live display
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              Presentation control room
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-300">
              Build service slides here and open the display route on the
              projector or big screen computer.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
            <button className="btn-secondary justify-center" onClick={copyDisplayUrl}>
              <Copy size={16} />
              Copy display link
            </button>
            <button className="btn-primary justify-center" onClick={openDisplay}>
              <ExternalLink size={16} />
              Open display
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="badge border-white/10 bg-white/5 text-stone-200">
            Slide {currentIndex + 1} of {state.slides.length}
          </span>
          <span className="badge border-white/10 bg-white/5 text-stone-200">
            {state.isLive ? 'Live output' : 'Output paused'}
          </span>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Service deck
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">Slides</h3>
            </div>
            <button
              className="shell-icon-button"
              type="button"
              aria-label="Add slide"
              onClick={beginAddSlide}
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {state.slides.map((slide, index) => (
              <div
                key={slide.id}
                draggable
                className={`presentation-slide-picker ${
                  slide.id === currentSlide.id ? 'is-active' : ''
                }`}
                onDragStart={() => setDraggedSlideId(slide.id)}
                onDragEnd={() => setDraggedSlideId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedSlideId) {
                    reorderSlides(draggedSlideId, slide.id);
                  }
                }}
              >
                <GripVertical className="shrink-0 text-stone-500" size={16} />
                <span className="presentation-slide-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <button
                  className="min-w-0 flex-1 text-left"
                  type="button"
                  onClick={() => goToSlide(index)}
                >
                  <span className="block truncate font-semibold">
                    {slide.title || 'Blank screen'}
                  </span>
                  <span className="block truncate text-xs capitalize text-stone-400">
                    {getPresentationSlideKindLabel(slide)}
                  </span>
                </button>
                <button
                  aria-label={`Edit ${slide.title || 'slide'}`}
                  className="shell-icon-button shell-icon-button-sm"
                  type="button"
                  onClick={() => beginEditSlide(slide)}
                >
                  <Pencil size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button className="btn-secondary justify-center" onClick={goPrevious}>
              <ChevronLeft size={16} />
              Previous
            </button>
            <button className="btn-secondary justify-center" onClick={goNext}>
              Next
              <ChevronRight size={16} />
            </button>
          </div>
        </section>

        <section className="panel p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                Screen preview
              </p>
              <h3 className="mt-2 text-xl font-semibold text-white">
                What the display shows
              </h3>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() => beginEditSlide(currentSlide)}
              >
                <Pencil size={16} />
                Edit slide
              </button>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() => commitState({ ...state, isLive: !state.isLive })}
              >
                {state.isLive ? <Pause size={16} /> : <Play size={16} />}
                {state.isLive ? 'Pause output' : 'Go live'}
              </button>
            </div>
          </div>

          <div className="mt-5">
            <PreviewSlide
              isLive={state.isLive}
              slide={currentSlide}
              theme={state.theme}
            />
          </div>

          {currentSlide.kind === 'song' ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-white">
                    <Music size={16} className="text-amber-200" />
                    Lyric sync
                  </p>
                  <p className="mt-1 text-sm text-stone-300">
                    {currentSlide.lyricSyncStatus === 'locked'
                      ? 'Local audio lock active'
                      : currentSlide.lyricSyncStatus === 'no-lock'
                        ? 'No lock, use manual controls'
                        : currentSlide.referenceAudioName
                          ? `Reference: ${currentSlide.referenceAudioName}`
                          : 'Upload a reference track to enable local audio sync'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <label className="btn-secondary cursor-pointer justify-center">
                    <Music size={16} />
                    {isBuildingReference ? 'Reading...' : 'Reference audio'}
                    <input
                      accept="audio/*"
                      className="hidden"
                      disabled={isBuildingReference}
                      type="file"
                      onChange={(event) => {
                        handleReferenceAudioUpload(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <button
                    className="btn-secondary justify-center"
                    type="button"
                    onClick={toggleLocalAudioSync}
                  >
                    {isListeningSync ? <Pause size={16} /> : <Mic size={16} />}
                    {isListeningSync ? 'Stop listening' : 'Listen sync'}
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() => setLyricLine(0)}
                >
                  <SkipBack size={16} />
                  Start
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() =>
                    updateCurrentSlide({
                      lyricScrollPaused: currentSlide.lyricScrollPaused === false,
                      lyricSyncStatus: 'idle',
                    })
                  }
                >
                  {currentSlide.lyricScrollPaused === false ? (
                    <Pause size={16} />
                  ) : (
                    <Play size={16} />
                  )}
                  {currentSlide.lyricScrollPaused === false ? 'Pause' : 'Auto-scroll'}
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() =>
                    setLyricLine((currentSlide.lyricActiveLineIndex || 0) - 1)
                  }
                >
                  <ChevronLeft size={16} />
                  Up
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() =>
                    setLyricLine((currentSlide.lyricActiveLineIndex || 0) + 1)
                  }
                >
                  Down
                  <ChevronRight size={16} />
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() =>
                    updateLyricSpeed((currentSlide.lyricScrollSpeed || 1) - 0.2)
                  }
                >
                  Slower
                </button>
                <button
                  className="btn-secondary justify-center"
                  type="button"
                  onClick={() =>
                    updateLyricSpeed((currentSlide.lyricScrollSpeed || 1) + 0.2)
                  }
                >
                  Faster
                </button>
                <span className="inline-flex items-center rounded-full border border-white/10 px-3 py-2 text-xs font-semibold text-stone-300">
                  Speed {(currentSlide.lyricScrollSpeed || 1).toFixed(1)}x
                </span>
              </div>

              {currentLyricLines.length > 0 ? (
                <div className="presentation-lyric-line-list mt-4">
                  {currentLyricLines.map((line, index) => (
                    <button
                      key={`${line}-${index}`}
                      className={
                        index === (currentSlide.lyricActiveLineIndex || 0)
                          ? 'is-active'
                          : ''
                      }
                      type="button"
                      onClick={() => setLyricLine(index)}
                    >
                      <span>{index + 1}</span>
                      {line}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <button className="btn-primary flex-1 justify-center" onClick={openDisplay}>
              <MonitorPlay size={16} />
              Projector display
            </button>
            <button className="btn-secondary flex-1 justify-center" onClick={resetDeck}>
              <RotateCcw size={16} />
              Reset deck
            </button>
          </div>
        </section>
      </div>

      {editorMode ? (
        <div className="modal-backdrop" role="presentation" onClick={closeEditor}>
          <div className="modal-shell" onClick={(event) => event.stopPropagation()}>
            <section
              aria-modal="true"
              className="panel presentation-editor-modal p-5 sm:p-6"
              role="dialog"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                    {editorMode === 'add' ? 'Add slide' : 'Edit slide'}
                  </p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">
                    {draftSlide ? 'Slide setup' : 'Choose slide category'}
                  </h3>
                </div>
                <button
                  aria-label="Close slide editor"
                  className="btn-secondary px-3 py-2"
                  type="button"
                  onClick={closeEditor}
                >
                  <X size={16} />
                </button>
              </div>

              {!draftSlide ? (
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {slideKindOptions.map((option) => (
                    <button
                      key={option.value}
                      className="presentation-kind-option"
                      type="button"
                      onClick={() => chooseNewSlideKind(option.value)}
                    >
                      <span>{option.label}</span>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  className="mt-6 grid gap-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveDraftSlide();
                  }}
                >
                  <div>
                    <label className="label">Slide type</label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
                      {slideKindOptions.map((option) => (
                        <button
                          key={option.value}
                          className={`presentation-kind-option ${
                            draftSlide.kind === option.value ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() =>
                            updateDraftSlide({
                              ...createPresentationSlide(option.value),
                              id: draftSlide.id,
                              backgroundId: draftSlide.backgroundId,
                              bodyTextBold: draftSlide.bodyTextBold,
                              bodyTextItalic: draftSlide.bodyTextItalic,
                              bodyTextSize: draftSlide.bodyTextSize,
                              bodyTextUnderline: draftSlide.bodyTextUnderline,
                              fontId: draftSlide.fontId,
                              textColorId: draftSlide.textColorId,
                              transitionId: draftSlide.transitionId,
                              title: draftSlide.title,
                              body: draftSlide.body,
                              note: draftSlide.note,
                              kind: option.value,
                              kindLabel:
                                option.value === 'custom'
                                  ? draftSlide.kindLabel || 'Custom'
                                  : option.label,
                            })
                          }
                        >
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {draftSlide.kind === 'custom' ? (
                    <div>
                      <label className="label">Display label</label>
                      <input
                        className="input"
                        placeholder="Example: Prayer, Testimony, Youth Sunday"
                        value={draftSlide.kindLabel || ''}
                        onChange={(event) =>
                          updateDraftSlide({ kindLabel: event.target.value })
                        }
                      />
                    </div>
                  ) : null}

                  {draftSlide.kind === 'scripture' ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="flex items-center gap-2 text-sm font-semibold text-white">
                        <BookOpen size={16} className="text-amber-200" />
                        Select scripture
                      </p>
                      <BibleSelector
                        className="mt-4"
                        defaultReference={draftSlide.title}
                        defaultVersion={draftSlide.bibleVersion}
                        onSelect={applyBibleVerse}
                      />
                    </div>
                  ) : null}

                  {draftSlide.kind === 'song' ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="flex items-center gap-2 text-sm font-semibold text-white">
                            <Music size={16} className="text-amber-200" />
                            Songs
                          </p>
                          <p className="mt-1 text-sm leading-6 text-stone-300">
                            Load saved lyrics or save this slide as a song.
                          </p>
                        </div>
                        <button
                          className="btn-secondary justify-center"
                          type="button"
                          onClick={saveCurrentSong}
                        >
                          <Save size={16} />
                          Save song
                        </button>
                      </div>

                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {savedSongs.length === 0 ? (
                          <p className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-sm text-stone-300">
                            No saved songs yet.
                          </p>
                        ) : (
                          savedSongs.map((song) => (
                            <div
                              key={song.id}
                              className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/10 px-3 py-2"
                            >
                              <button
                                className="min-w-0 flex-1 text-left"
                                type="button"
                                onClick={() => loadSong(song)}
                              >
                                <span className="block truncate text-sm font-semibold text-white">
                                  {song.title}
                                </span>
                                <span className="block truncate text-xs text-stone-400">
                                  {song.note || 'Saved lyrics'}
                                </span>
                              </button>
                              <button
                                aria-label={`Delete ${song.title}`}
                                className="shell-icon-button shell-icon-button-sm"
                                type="button"
                                onClick={() => deleteSong(song.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Title or reference</label>
                      <input
                        className="input"
                        value={draftSlide.title}
                        onChange={(event) =>
                          updateDraftSlide({ title: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Small note</label>
                      <input
                        className="input"
                        value={draftSlide.note}
                        onChange={(event) =>
                          updateDraftSlide({ note: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                      <label className="label">Main screen text</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          aria-label="Bold main text"
                          className={`presentation-format-button ${
                            draftSlide.bodyTextBold !== false ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() =>
                            updateDraftSlide({
                              bodyTextBold: draftSlide.bodyTextBold === false,
                            })
                          }
                        >
                          <Bold size={16} />
                        </button>
                        <button
                          aria-label="Italic main text"
                          className={`presentation-format-button ${
                            draftSlide.bodyTextItalic ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() =>
                            updateDraftSlide({
                              bodyTextItalic: !draftSlide.bodyTextItalic,
                            })
                          }
                        >
                          <Italic size={16} />
                        </button>
                        <button
                          aria-label="Underline main text"
                          className={`presentation-format-button ${
                            draftSlide.bodyTextUnderline ? 'is-active' : ''
                          }`}
                          type="button"
                          onClick={() =>
                            updateDraftSlide({
                              bodyTextUnderline: !draftSlide.bodyTextUnderline,
                            })
                          }
                        >
                          <Underline size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                        <Type size={14} />
                        Size
                      </span>
                      <div className="presentation-size-control">
                        {textSizeOptions.map((option) => (
                          <button
                            key={option.value}
                            className={
                              (draftSlide.bodyTextSize || 'medium') ===
                              option.value
                                ? 'is-active'
                                : ''
                            }
                            type="button"
                            onClick={() =>
                              updateDraftSlide({
                                bodyTextSize: option.value,
                              })
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      className="input mt-3 min-h-36 resize-y leading-7"
                      value={draftSlide.body}
                      onChange={(event) =>
                        updateDraftSlide({ body: event.target.value })
                      }
                      placeholder={
                        draftSlide.kind === 'scripture'
                          ? `Selected ${draftSlide.bibleVersionLabel || getBibleVersionLabel(draftSlide.bibleVersion)} text appears here`
                          : 'Type slide content'
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="label">Font</label>
                      <select
                        className="input"
                        value={draftSlide.fontId}
                        onChange={(event) =>
                          updateDraftSlide({
                            fontId: event.target.value as PresentationFontId,
                          })
                        }
                      >
                        {presentationFonts.map((font) => (
                          <option key={font.id} value={font.id}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label">Transition</label>
                      <select
                        className="input"
                        value={draftSlide.transitionId}
                        onChange={(event) =>
                          updateDraftSlide({
                            transitionId:
                              event.target.value as PresentationTransitionId,
                          })
                        }
                      >
                        {presentationTransitions.map((transition) => (
                          <option key={transition.id} value={transition.id}>
                            {transition.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <button
                      className="presentation-collapsible-trigger"
                      type="button"
                      onClick={() => setIsTextColorOpen((current) => !current)}
                    >
                      <span>
                        <span className="label">Text color</span>
                        <span className="mt-1 block text-sm font-semibold text-stone-200">
                          {presentationTextColors.find(
                            (color) => color.id === draftSlide.textColorId,
                          )?.label || 'Theme default'}
                        </span>
                      </span>
                      <ChevronDown
                        className={`transition ${
                          isTextColorOpen ? 'rotate-180' : ''
                        }`}
                        size={18}
                      />
                    </button>
                    {isTextColorOpen ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {presentationTextColors.map((color) => (
                          <button
                            key={color.id}
                            className={`presentation-color-option ${
                              draftSlide.textColorId === color.id ? 'is-active' : ''
                            }`}
                            type="button"
                            onClick={() =>
                              updateDraftSlide({
                                textColorId: color.id as PresentationTextColorId,
                              })
                            }
                          >
                            <span
                              className="presentation-color-swatch"
                              style={{ background: color.swatch }}
                            />
                            <span>{color.label}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        className="presentation-collapsible-trigger flex-1"
                        type="button"
                        onClick={() => setIsBackgroundOpen((current) => !current)}
                      >
                        <span>
                          <span className="label">Background image</span>
                          <span className="mt-1 block text-sm font-semibold text-stone-200">
                            {availableBackgrounds.find(
                              (background) =>
                                background.id === draftSlide.backgroundId,
                            )?.label || 'Theme color'}
                          </span>
                        </span>
                        <ChevronDown
                          className={`transition ${
                            isBackgroundOpen ? 'rotate-180' : ''
                          }`}
                          size={18}
                        />
                      </button>
                      <label className="btn-secondary cursor-pointer justify-center">
                        <ImagePlus size={16} />
                        {isUploadingBackground ? 'Uploading...' : 'Upload image'}
                        <input
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={isUploadingBackground}
                          type="file"
                          onChange={(event) => {
                            uploadPresentationBackground(event.target.files?.[0]);
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {isBackgroundOpen ? (
                      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {availableBackgrounds.map((background) => (
                          <div
                            key={background.id}
                            className={`presentation-background-option ${
                              draftSlide.backgroundId === background.id
                                ? 'is-active'
                                : ''
                            }`}
                          >
                            <button
                              className="flex min-w-0 flex-1 items-center gap-3 text-left"
                              type="button"
                              onClick={() => selectBackground(background)}
                            >
                              <span
                                className={`presentation-background-swatch presentation-background-${background.id}`}
                              >
                                {background.imageUrl ? (
                                  <img alt="" src={background.imageUrl} />
                                ) : (
                                  <ImageIcon size={16} />
                                )}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate">
                                  {background.label}
                                </span>
                                {background.source === 'media' ? (
                                  <span className="mt-0.5 block text-xs text-stone-400">
                                    Church upload
                                  </span>
                                ) : null}
                                {background.source === 'upload' ? (
                                  <span className="mt-0.5 block text-xs text-stone-400">
                                    Presentation upload
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            {background.canDelete ? (
                              <button
                                aria-label={`Delete ${background.label}`}
                                className="shell-icon-button shell-icon-button-sm"
                                type="button"
                                onClick={() =>
                                  deletePresentationBackground(background.id)
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <PreviewSlide isLive slide={draftSlide} theme={state.theme} />

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {editorMode === 'edit' ? (
                      <button
                        className="btn-secondary justify-center sm:w-auto"
                        type="button"
                        onClick={() => {
                          deleteSlide(draftSlide.id);
                          closeEditor();
                        }}
                      >
                        <Trash2 size={16} />
                        Delete slide
                      </button>
                    ) : null}
                    <button
                      className="btn-secondary justify-center sm:ml-auto"
                      type="button"
                      onClick={closeEditor}
                    >
                      Cancel
                    </button>
                    <button className="btn-primary justify-center" type="submit">
                      Save slide
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
