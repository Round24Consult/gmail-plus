import type { InboxSDK } from '@inboxsdk/core';

function parseRgb(color: string): [number, number, number, number] | null {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m || !m[1]) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  const [r = 0, g = 0, b = 0, a = 1] = parts;
  return [r, g, b, a];
}

/** Finds the first opaque background under the Gmail search bar area and checks its brightness. */
function gmailLooksDark(): boolean {
  let el = document.elementFromPoint(window.innerWidth / 2, 32) as HTMLElement | null;
  while (el) {
    const rgb = parseRgb(getComputedStyle(el).backgroundColor);
    if (rgb && rgb[3] > 0.5) {
      const [r, g, b] = rgb;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
    }
    el = el.parentElement;
  }
  return false;
}

/** Sets data-gp-theme on <html> so our panels match Gmail's light or dark theme. */
export function watchTheme(sdk: InboxSDK): void {
  const apply = () => {
    try {
      document.documentElement.setAttribute('data-gp-theme', gmailLooksDark() ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };
  apply();
  setTimeout(apply, 3000);
  sdk.Router.handleAllRoutes(() => {
    setTimeout(apply, 300);
  });
}
