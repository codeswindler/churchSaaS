import { Pause } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getCurrentPresentationSlide,
  getPresentationBackground,
  readPresentationState,
  subscribePresentationState,
} from '../../services/presentation';

export default function PresentationDisplay() {
  const [state, setState] = useState(() => readPresentationState());
  const slide = useMemo(() => getCurrentPresentationSlide(state), [state]);
  const background = getPresentationBackground(slide.backgroundId);

  useEffect(() => subscribePresentationState(setState), []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <main
      className={`presentation-display presentation-theme-${state.theme} presentation-background-${background.id} presentation-font-${slide.fontId || 'sora'} presentation-text-color-${slide.textColorId || 'theme'} presentation-transition-${slide.transitionId || 'fade'}`}
    >
      {background.kind === 'image' && background.imageUrl ? (
        <img
          alt=""
          className="presentation-background-image"
          src={background.imageUrl}
        />
      ) : null}
      <div className="presentation-display-frame">
        {!state.isLive ? (
          <section className="presentation-display-paused" key={`${slide.id}-paused`}>
            <Pause size={64} />
            <h1>Output paused</h1>
          </section>
        ) : slide.kind === 'blank' ? null : (
          <section className="presentation-display-content" key={slide.id}>
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
          <span>{state.churchName}</span>
          <span>Live display</span>
        </div>
      </div>
    </main>
  );
}
