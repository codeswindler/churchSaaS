import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  GripVertical,
  Image as ImageIcon,
  MonitorPlay,
  Music,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  BibleSelector,
  getBibleVersionLabel,
  type SelectedBibleVerse,
} from '../../components/BibleSelector';
import { getSession } from '../../services/api';
import {
  createDefaultPresentationState,
  createPresentationSlide,
  createPresentationSongFromSlide,
  getCurrentPresentationSlide,
  getPresentationBackground,
  publishPresentationState,
  readPresentationState,
  readPresentationSongs,
  savePresentationSongs,
  subscribePresentationState,
  presentationBackgrounds,
  presentationFonts,
  presentationTextColors,
  presentationTransitions,
  type PresentationBackgroundId,
  type PresentationFontId,
  type PresentationSlide,
  type PresentationSlideKind,
  type PresentationSong,
  type PresentationState,
  type PresentationTheme,
  type PresentationTextColorId,
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
    value: 'blank',
    label: 'Blank',
    description: 'Clear the screen during transitions.',
  },
];

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

function PreviewSlide({
  isLive,
  slide,
  theme,
}: {
  isLive: boolean;
  slide: PresentationSlide;
  theme: PresentationTheme;
}) {
  const background = getPresentationBackground(slide.backgroundId);
  return (
    <div
      className={`presentation-stage-preview presentation-theme-${theme} presentation-background-${background.id} presentation-font-${slide.fontId || 'sora'} presentation-text-color-${slide.textColorId || 'theme'} presentation-transition-${slide.transitionId || 'fade'}`}
    >
      <SlideBackground backgroundId={slide.backgroundId} />
      <div className="presentation-stage-inner" key={slide.id}>
        {!isLive ? (
          <div className="presentation-paused-preview">
            <Pause size={28} />
            <span>Output paused</span>
          </div>
        ) : slide.kind === 'blank' ? null : (
          <>
            <p className="presentation-kind-label">{slide.kind}</p>
            <h3>{slide.title || 'Untitled slide'}</h3>
            <p className="presentation-body-copy">
              {slide.body || 'Add slide content'}
            </p>
            {slide.note ? <p className="presentation-note">{slide.note}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function ChurchPresentation() {
  const churchName = useMemo(resolveChurchName, []);
  const [state, setState] = useState(() => readPresentationState(churchName));
  const [editorMode, setEditorMode] = useState<'add' | 'edit' | null>(null);
  const [draftSlide, setDraftSlide] = useState<PresentationSlide | null>(null);
  const [draggedSlideId, setDraggedSlideId] = useState<string | null>(null);
  const [savedSongs, setSavedSongs] = useState<PresentationSong[]>(() =>
    readPresentationSongs(),
  );
  const currentIndex = slideIndex(state);
  const currentSlide = getCurrentPresentationSlide(state);
  const displayUrl =
    typeof window === 'undefined'
      ? '/display/church-presentation'
      : `${window.location.origin}/display/church-presentation`;

  useEffect(() => subscribePresentationState(setState, churchName), [churchName]);

  const commitState = (nextState: PresentationState) => {
    setState(publishPresentationState(nextState));
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
                    {slide.kind}
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
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
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
                              title: draftSlide.title,
                              body: draftSlide.body,
                              note: draftSlide.note,
                              kind: option.value,
                            })
                          }
                        >
                          <span>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

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
                    <label className="label">Main screen text</label>
                    <textarea
                      className="input min-h-36 resize-y leading-7"
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
                    <label className="label">Text color</label>
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
                  </div>

                  <div>
                    <label className="label">Background image</label>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                      {presentationBackgrounds.map((background) => (
                        <button
                          key={background.id}
                          className={`presentation-background-option ${
                            draftSlide.backgroundId === background.id
                              ? 'is-active'
                              : ''
                          }`}
                          type="button"
                          onClick={() =>
                            updateDraftSlide({
                              backgroundId:
                                background.id as PresentationBackgroundId,
                            })
                          }
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
                          <span>{background.label}</span>
                        </button>
                      ))}
                    </div>
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
