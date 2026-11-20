import { useEffect, useState } from "react";

/**
 * The lower edge of a scrolling region while more of it lies below: a shadow
 * inside the region's own box, so it sits under the content and never covers
 * a focus ring. Light on the dark page, where a dark shadow wouldn't show.
 */
export const MORE_BELOW =
  "shadow-[inset_0_-12px_10px_-10px_rgb(0_0_0/0.3)] dark:shadow-[inset_0_-12px_10px_-10px_rgb(255_255_255/0.3)]";

/**
 * Whether a scrolling element's content is taller than its box (`overflows`)
 * and whether some of it is still below the fold (`more`). The content's own
 * bottom padding doesn't count as more: with only that hidden, a fade would
 * lie over the last line of text and promise nothing. `ref` goes on the
 * element, which may mount later than its owner.
 */
export function useScrollMore() {
  const [element, ref] = useState<HTMLElement | null>(null);
  const [state, setState] = useState({ overflows: false, more: false });

  const check = () => {
    if (!element) return;
    const overflows = element.scrollHeight > element.clientHeight;
    const content = element.firstElementChild;
    const padding = content ? parseFloat(getComputedStyle(content).paddingBottom) || 0 : 0;
    const more = element.scrollHeight - element.scrollTop - element.clientHeight > padding + 1;
    setState((now) => (now.overflows === overflows && now.more === more ? now : { overflows, more }));
  };

  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    // The content's own box: it grows without the scroller's box changing.
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener("scroll", check, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", check);
    };
  }, [element]);
  // A list whose rows change (the picker's filter) changes height with its owner's render.
  useEffect(check);

  return { ref, element, ...state };
}
