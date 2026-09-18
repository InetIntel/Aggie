import { useEffect, useRef, useState } from "react";

// Tracks an element's content-box width for responsive layout decisions (e.g.
// deciding which DataTable columns fit). Mirrors `useMeasuredHeight`: the
// ResizeObserver callback defers to requestAnimationFrame and skips no-op
// updates, so a width change during observation can't retrigger layout inside
// the same delivery cycle — the browser condition reported as "ResizeObserver
// loop completed with undelivered notifications", which CRA's dev overlay
// otherwise surfaces as a crash.
export function useMeasuredWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () =>
      setWidth((prev) => (prev === el.clientWidth ? prev : el.clientWidth));
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
  return { ref, width };
}
