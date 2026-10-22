import { useEffect, useRef, useState } from "react";

// Tracks an element's height for publishing as a sticky-offset CSS var. The
// ResizeObserver callback defers to requestAnimationFrame and skips no-op
// updates, so a height change during observation (e.g. a toolbar collapsing on
// view switch) can't retrigger layout inside the same delivery cycle — the
// browser condition reported as "ResizeObserver loop completed with undelivered
// notifications", which CRA's dev overlay otherwise surfaces as a crash.
export function useMeasuredHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () =>
      setHeight((prev) => (prev === el.offsetHeight ? prev : el.offsetHeight));
    measure();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);
  return { ref, height };
}
