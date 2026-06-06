import { Pause } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCurrentPresentationSlide,
  getPresentationBackground,
  getPresentationSlideDisplayTitle,
  getPresentationSlideKindLabel,
  getPresentationTransitionMs,
  publishPresentationState,
  readPresentationState,
  splitPresentationLyrics,
  subscribePresentationState,
  type PresentationSlide,
} from '../../services/presentation';

function slideMotionSignature(slide: PresentationSlide) {
  return `${slide.id}:${slide.backgroundId}:${slide.transitionId}`;
}

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

function DisplaySlideMedia({ slide }: { slide: PresentationSlide }) {
  if (slide.mediaMode !== 'media' || !slide.mediaUrl) {
    return null;
  }

  if (slide.mediaType === 'video') {
    return (
      <video
        autoPlay
        className="presentation-display-media"
        loop
        muted
        playsInline
        src={slide.mediaUrl}
      />
    );
  }

  return (
    <img
      alt={slide.mediaName || slide.title || ''}
      className="presentation-display-media"
      src={slide.mediaUrl}
    />
  );
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
  const lyricLines = splitPresentationLyrics(slide.body);
  const activeLineIndex = Math.max(
    0,
    Math.min(lyricLines.length - 1, slide.lyricActiveLineIndex || 0),
  );
  const visibleLines = lyricLines.slice(
    Math.max(0, activeLineIndex - 3),
    Math.min(lyricLines.length, activeLineIndex + 4),
  );
  const firstVisibleIndex = Math.max(0, activeLineIndex - 3);

  return (
    <div
      className={`presentation-display-motion presentation-layer-${mode} presentation-background-${background.id} presentation-font-${slide.fontId || 'sora'} presentation-text-color-${slide.textColorId || 'theme'} ${slideStyleClassNames(slide)}`}
      key={`${slide.id}-${slide.backgroundId}-${slide.transitionId}-${mode}`}
    >
      {background.kind === 'image' && background.imageUrl ? (
        <img
          alt=""
          className="presentation-background-image"
          src={background.imageUrl}
        />
      ) : null}
      <div
        className={`presentation-display-frame ${
          slide.mediaMode === 'media' ? 'presentation-display-frame-media' : ''
        }`}
      >
        {!isLive ? (
          <section className="presentation-display-paused">
            <Pause size={64} />
            <h1>Output paused</h1>
          </section>
        ) : slide.kind === 'blank' ? null : slide.mediaMode === 'media' &&
          slide.mediaUrl ? (
          <DisplaySlideMedia slide={slide} />
        ) : (
          <section
            className={`presentation-display-content ${
              slide.kind === 'song' ? 'presentation-display-content-song' : ''
            }`}
          >
            <p className="presentation-display-kind">
              {getPresentationSlideKindLabel(slide)}
            </p>
            <h1>{getPresentationSlideDisplayTitle(slide)}</h1>
            {slide.kind === 'song' && lyricLines.length > 0 ? (
              <div className="presentation-display-lyrics">
                {visibleLines.map((line, index) => {
                  const lineIndex = firstVisibleIndex + index;
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
              <p className="presentation-display-body">
                {slide.body || 'Add slide content'}
              </p>
            )}
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

  const moveLyricLine = useCallback((direction: -1 | 1) => {
    setState((currentState) => {
      const currentSlide = getCurrentPresentationSlide(currentState);
      if (currentSlide.kind !== 'song') {
        return currentState;
      }

      const lyricLines = splitPresentationLyrics(currentSlide.body);
      if (lyricLines.length <= 1) {
        return currentState;
      }

      const currentLine = Math.max(
        0,
        Math.min(lyricLines.length - 1, currentSlide.lyricActiveLineIndex || 0),
      );
      const nextLine = Math.max(
        0,
        Math.min(lyricLines.length - 1, currentLine + direction),
      );
      if (nextLine === currentLine) {
        return currentState;
      }

      return publishPresentationState({
        ...currentState,
        slides: currentState.slides.map((item) =>
          item.id === currentSlide.id
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
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveLyricLine(1);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveLyricLine(-1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveLyricLine, moveSlide]);

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
        if (activeSlide.kind === 'song') {
          const topBand = window.innerHeight * 0.25;
          const bottomBand = window.innerHeight * 0.75;
          if (event.clientY <= topBand) {
            moveLyricLine(-1);
            return;
          }
          if (event.clientY >= bottomBand) {
            moveLyricLine(1);
            return;
          }
        }

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
