import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  ExternalLink,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getSession } from '../../services/api';
import {
  createDefaultPresentationState,
  createPresentationSlide,
  getCurrentPresentationSlide,
  publishPresentationState,
  readPresentationState,
  subscribePresentationState,
  type PresentationSlide,
  type PresentationSlideKind,
  type PresentationState,
  type PresentationTheme,
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

const themeOptions: Array<{ value: PresentationTheme; label: string }> = [
  { value: 'midnight', label: 'Midnight' },
  { value: 'sanctuary', label: 'Sanctuary' },
  { value: 'paper', label: 'Paper' },
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

function PreviewSlide({
  isLive,
  slide,
  theme,
}: {
  isLive: boolean;
  slide: PresentationSlide;
  theme: PresentationTheme;
}) {
  return (
    <div className={`presentation-stage-preview presentation-theme-${theme}`}>
      <div className="presentation-stage-inner">
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

  const updateSlide = (patch: Partial<PresentationSlide>) => {
    commitState({
      ...state,
      slides: state.slides.map((slide) =>
        slide.id === currentSlide.id ? { ...slide, ...patch } : slide,
      ),
    });
  };

  const addSlide = (kind: PresentationSlideKind = 'announcement') => {
    const slide = createPresentationSlide(kind);
    commitState({
      ...state,
      currentSlideId: slide.id,
      slides: [...state.slides, slide],
    });
    toast.success('Slide added');
  };

  const deleteCurrentSlide = () => {
    if (state.slides.length <= 1) {
      toast.error('Keep at least one slide');
      return;
    }
    const nextSlides = state.slides.filter((slide) => slide.id !== currentSlide.id);
    const nextIndex = Math.min(currentIndex, nextSlides.length - 1);
    commitState({
      ...state,
      currentSlideId: nextSlides[nextIndex].id,
      slides: nextSlides,
    });
    toast.success('Slide removed');
  };

  const goToSlide = (index: number) => {
    const nextSlide = state.slides[index];
    if (!nextSlide) return;
    commitState({ ...state, currentSlideId: nextSlide.id });
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

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Current slide
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {currentIndex + 1} / {state.slides.length}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Output
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {state.isLive ? 'Live' : 'Paused'}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stone-400">
              Display theme
            </p>
            <p className="mt-3 text-2xl font-semibold text-white">
              {themeOptions.find((theme) => theme.value === state.theme)?.label}
            </p>
          </div>
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
              onClick={() => addSlide()}
            >
              <Plus size={18} />
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {state.slides.map((slide, index) => (
              <button
                key={slide.id}
                className={`presentation-slide-picker ${
                  slide.id === currentSlide.id ? 'is-active' : ''
                }`}
                type="button"
                onClick={() => goToSlide(index)}
              >
                <span className="presentation-slide-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {slide.title || 'Blank screen'}
                  </span>
                  <span className="block truncate text-xs capitalize text-stone-400">
                    {slide.kind}
                  </span>
                </span>
              </button>
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

        <section className="grid gap-5 2xl:grid-cols-[minmax(0,0.96fr)_minmax(0,1.04fr)]">
          <div className="panel p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Screen preview
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  What the display shows
                </h3>
              </div>
              <button
                className="btn-secondary justify-center"
                type="button"
                onClick={() => commitState({ ...state, isLive: !state.isLive })}
              >
                {state.isLive ? <Pause size={16} /> : <Play size={16} />}
                {state.isLive ? 'Pause output' : 'Go live'}
              </button>
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
          </div>

          <form
            className="panel p-5"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-stone-400">
                  Slide editor
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  Edit current slide
                </h3>
              </div>
              <button
                className="btn-secondary px-3 py-2"
                type="button"
                onClick={deleteCurrentSlide}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="label">Slide type</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {slideKindOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`presentation-kind-option ${
                        currentSlide.kind === option.value ? 'is-active' : ''
                      }`}
                      type="button"
                      onClick={() => updateSlide({ kind: option.value })}
                    >
                      <span>{option.label}</span>
                      <small>{option.description}</small>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="label">Display theme</label>
                  <select
                    className="input"
                    value={state.theme}
                    onChange={(event) =>
                      commitState({
                        ...state,
                        theme: event.target.value as PresentationTheme,
                      })
                    }
                  >
                    {themeOptions.map((theme) => (
                      <option key={theme.value} value={theme.value}>
                        {theme.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Small note</label>
                  <input
                    className="input"
                    value={currentSlide.note}
                    onChange={(event) => updateSlide({ note: event.target.value })}
                    placeholder="Opening worship"
                  />
                </div>
              </div>

              <div>
                <label className="label">Title or reference</label>
                <input
                  className="input"
                  value={currentSlide.title}
                  onChange={(event) => updateSlide({ title: event.target.value })}
                  placeholder="Psalm 100:2"
                />
              </div>

              <div>
                <label className="label">Main screen text</label>
                <textarea
                  className="input min-h-44 resize-y leading-7"
                  value={currentSlide.body}
                  onChange={(event) => updateSlide({ body: event.target.value })}
                  placeholder="Type lyrics, scripture, announcement, or giving instructions"
                />
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-start gap-3">
                  <Eye size={17} className="mt-0.5 shrink-0 text-amber-200" />
                  <p className="text-sm leading-6 text-stone-300">
                    Open the display route on the projector computer and put that
                    browser tab in fullscreen. Changes made here update the display
                    tab automatically in the same browser session.
                  </p>
                </div>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
