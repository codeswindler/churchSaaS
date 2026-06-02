import { Pause } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCurrentPresentationSlide,
  getPresentationBackground,
  getPresentationTransitionMs,
  publishPresentationState,
  readPresentationState,
  subscribePresentationState,
  type PresentationSlide,
} from '../../services/presentation';

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

function DisplaySlideLayer({
  isLive,
  mode,
  slide,
  churchName,
}: {
  isLive: boolean;
  mode: 'enter' | 'exit' | 'static';
  slide: PresentationSlide;
  churchName: string;
}) {
  const background = getPresentationBackground(slide.backgroundId);

  return (
    <div
      className={`presentation-display-motion presentation-layer-${mode} presentation-background-${background.id} presentation-font-${slide.fontId || 'sora'} presentation-text-color-${slide.textColorId || 'theme'}`}
      key={`${slide.id}-${slide.backgroundId}-${slide.transitionId}-${mode}`}
    >
      {background.kind === 'image' && background.imageUrl ? (
        <img
          alt=""
          className="presentation-background-image"
          src={background.imageUrl}
        />
      ) : null}
      <div className="presentation-display-frame">
        {!isLive ? (
          <section className="presentation-display-paused">
            <Pause size={64} />
            <h1>Output paused</h1>
          </section>
        ) : slide.kind === 'blank' ? null : (
          <section className="presentation-display-content">
            <p className="presentation-display-kind">{slide.kind}</p>
            <h1>{slide.title || 'Untitled slide'}</h1>
            <p className="presentation-display-body">
              {slide.body || 'Add slide content'}
            </p>
            {slide.note ? (
              <p className="presentation-display-note">{slide.note}</p>
            ) : null}
          </section>
        )}

        <div className="presentation-display-footer">
          <span>{churchName}</span>
        </div>
      </div>
    </div>
  );
}

export default function PresentationDisplay() {
  const [state, setState] = useState(() => readPresentationState());
  const slide = useMemo(() => getCurrentPresentationSlide(state), [state]);
  const { activeSlide, previousSlide } = useTransitionSlides(slide);
  const background = getPresentationBackground(activeSlide.backgroundId);
  const transitionId = activeSlide.transitionId || 'fade';

  const moveSlide = useCallback((direction: -1 | 1) => {
    setState((currentState) => {
      if (!currentState.slides.length) {
        return currentState;
      }

      const currentIndex = currentState.slides.findIndex(
        (item) => item.id === currentState.currentSlideId,
      );
      const safeCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = Math.min(
        Math.max(safeCurrentIndex + direction, 0),
        currentState.slides.length - 1,
      );
      const nextSlide = currentState.slides[nextIndex];

      if (!nextSlide || nextSlide.id === currentState.currentSlideId) {
        return currentState;
      }

      return publishPresentationState({
        ...currentState,
        currentSlideId: nextSlide.id,
      });
    });
  }, []);

  useEffect(() => subscribePresentationState(setState), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', '>', '.'].includes(event.key)) {
        event.preventDefault();
        moveSlide(1);
        return;
      }

      if (['ArrowLeft', 'PageUp', '<', ','].includes(event.key)) {
        event.preventDefault();
        moveSlide(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveSlide]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <main
      className={`presentation-display presentation-theme-${state.theme} presentation-background-${background.id} presentation-transition-${transitionId}`}
      onClick={(event) => {
        moveSlide(event.clientX < window.innerWidth / 2 ? -1 : 1);
      }}
    >
      {previousSlide ? (
        <DisplaySlideLayer
          churchName={state.churchName}
          isLive={state.isLive}
          mode="exit"
          slide={previousSlide}
        />
      ) : null}
      <DisplaySlideLayer
        churchName={state.churchName}
        isLive={state.isLive}
        mode={previousSlide ? 'enter' : 'static'}
        slide={activeSlide}
      />
    </main>
  );
}
