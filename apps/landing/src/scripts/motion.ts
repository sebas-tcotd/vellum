/**
 * Motion helpers (EXPERIENCE.md · Motion): the served HTML always paints the
 * final state; JS only animates when motion is allowed, once, and forces the
 * final state after a 1 s safety delay if the observer never fires.
 */

export function motionAllowed(): boolean {
  return !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Runs `callback` the first time `element` enters the viewport. */
export function onceVisible(
  element: Element,
  callback: () => void,
  threshold = 0.35,
): void {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        callback();
      }
    },
    { threshold },
  );
  observer.observe(element);
}

/**
 * Fades in `[data-reveal]` elements (optional `data-reveal-delay` in ms).
 * CSS hides them before the first paint only when motion is allowed, and
 * forces them visible after 1 s if this never runs.
 */
export function revealOnLoad(root: ParentNode = document): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-reveal]')) {
    const delay = motionAllowed()
      ? Number(element.dataset.revealDelay ?? 0)
      : 0;
    window.setTimeout(() => element.classList.add('js-reveal'), delay);
  }
}
