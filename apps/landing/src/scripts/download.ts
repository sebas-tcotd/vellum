/**
 * Interactions of the download page that need JS (EXPERIENCE.md · Interaction
 * Primitives and State Patterns · Post-descarga): «Copy» per hash and «Copy
 * link» / «Share…» for phone visitors, announced in the single live region
 * served with the page, and the post-download focus move to step 2.
 */
import { motionAllowed } from './motion';

const COPIED_MS = 2000;

/** Selects the text of `element` so it can be copied by hand. */
function selectText(element: Element): void {
  const selection = getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function writeClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
  await navigator.clipboard.writeText(text);
}

export function initDownloadPage(): void {
  const page = document.querySelector<HTMLElement>('[data-download-page]');
  const live = page?.querySelector<HTMLElement>('[data-live]');
  if (!page || !live) return;
  const strings = page.dataset;
  const timers = new WeakMap<HTMLElement, number>();

  /** Shows "Copied ✓" for 2 s (same width: both labels share one cell). */
  const confirm = (button: HTMLElement, announcement: string) => {
    button.setAttribute('data-copied', '');
    live.textContent = '';
    // A fresh text node so a repeated "Copied" is announced again.
    requestAnimationFrame(() => {
      live.textContent = announcement;
    });
    window.clearTimeout(timers.get(button));
    timers.set(
      button,
      window.setTimeout(() => {
        button.removeAttribute('data-copied');
        live.textContent = '';
      }, COPIED_MS),
    );
  };

  const copy = async (
    button: HTMLElement,
    text: string,
    source: Element | null,
    announcement: string,
  ) => {
    try {
      await writeClipboard(text);
      confirm(button, announcement);
    } catch {
      if (source) selectText(source);
    }
  };

  // «Copy» per hash: only exists with JS.
  for (const row of page.querySelectorAll<HTMLElement>('[data-hash-row]')) {
    const cell = row.querySelector('[data-copy-cell]');
    const hash = row.querySelector('[data-hash]');
    if (!cell || !hash) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary button--sm dl-copy';
    button.setAttribute(
      'aria-label',
      (strings.copyLabel ?? '').replace('{file}', row.dataset.file ?? ''),
    );
    const idle = document.createElement('span');
    idle.className = 'dl-copy__idle';
    idle.textContent = strings.copy ?? '';
    const done = document.createElement('span');
    done.className = 'dl-copy__done';
    done.textContent = strings.copied ?? '';
    button.append(idle, done);
    button.addEventListener('click', () => {
      void copy(
        button,
        (hash.textContent ?? '').trim(),
        hash,
        strings.announce ?? '',
      );
    });
    cell.append(button);
  }

  // Phone visitors: copy or share the canonical URL of the page.
  const url = strings.canonical ?? location.href;
  const copyLink = page.querySelector<HTMLElement>('[data-copy-link]');
  copyLink?.addEventListener('click', () => {
    void copy(
      copyLink,
      url,
      page.querySelector('[data-link-text]'),
      strings.linkAnnounce ?? '',
    );
  });
  const share = page.querySelector<HTMLButtonElement>('button[data-share]');
  share?.addEventListener('click', () => {
    navigator.share?.({ title: document.title, url }).catch(() => {});
  });

  // Post-download: «Your download has started.» before the step 2 heading,
  // which takes the focus (no live region: the focus move tells it).
  document.addEventListener('click', (event) => {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.defaultPrevented
    )
      return;
    const link = (event.target as Element | null)?.closest?.(
      'a[data-download]',
    );
    const heading = document.getElementById('bridge-title');
    if (!link || !heading) return;
    if (!document.querySelector('[data-download-started]')) {
      const note = document.createElement('p');
      note.className = 'dl-started';
      note.setAttribute('data-download-started', '');
      note.textContent = strings.started ?? '';
      heading.before(note);
    }
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({
      behavior: motionAllowed() ? 'smooth' : 'auto',
      block: 'start',
    });
  });
}
