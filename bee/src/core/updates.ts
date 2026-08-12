/**
 * "A new version is ready" — polling, and the banner that offers the reload.
 *
 * The build writes a `version.json` next to the game with a stamp in it. The
 * running page remembers whichever stamp it first saw and re-reads the file
 * every minute; a different stamp means the site has been deployed over the
 * top of us. That's the whole mechanism — no push, no websocket, nothing that
 * costs anything while the game is running.
 *
 * Taking the update *deletes every cache* before reloading. Without that the
 * service worker would hand back the same page it has cached and the reload
 * would change nothing, which is a far more confusing bug than no update
 * prompt at all.
 *
 * Development has no version.json, so the whole thing quietly does nothing.
 */

/** Where the build leaves the stamp, relative to the page. */
const VERSION_URL = 'version.json';
const POLL_MS = 60_000;

interface Version {
  build?: string;
}

export function watchForUpdates(host: HTMLElement): void {
  if (!import.meta.env.PROD) return;

  let current: string | null = null;
  let offered = false;

  const banner = createBanner(host, () => {
    void applyUpdate();
  });

  const read = async (): Promise<string | null> => {
    try {
      // `no-store` keeps the browser's own cache out of it; the service worker
      // is told separately to leave this URL alone.
      const response = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as Version;
      return typeof data.build === 'string' ? data.build : null;
    } catch {
      // Offline, or no version.json at all. Either way there's nothing to say.
      return null;
    }
  };

  const check = async (): Promise<void> => {
    if (offered) return;
    const build = await read();
    if (!build) return;
    if (current === null) {
      current = build;
      return;
    }
    if (build === current) return;
    offered = true;
    banner.show();
  };

  void check();
  setInterval(() => void check(), POLL_MS);
  // An installed app is usually resumed rather than opened, and a resume after
  // a day shouldn't wait out the poll before noticing.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}

/** Bin every cache, then come back for the new build. */
async function applyUpdate(): Promise<void> {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
    // The worker itself is fine — it's the contents that were stale — but a
    // waiting one should take over rather than leaving two generations around.
    const registration = await navigator.serviceWorker?.getRegistration();
    await registration?.update();
  } catch {
    // A failed clean-up is not a reason to refuse to reload.
  }
  window.location.reload();
}

function createBanner(host: HTMLElement, onTake: () => void): { show(): void } {
  const banner = document.createElement('button');
  banner.type = 'button';
  banner.className = 'update-banner ui-interactive hidden';
  banner.innerHTML = '<b>A new version is ready</b><span>Tap to update</span>';
  banner.addEventListener('click', () => {
    banner.classList.add('taken');
    banner.querySelector('span')!.textContent = 'Updating…';
    onTake();
  });
  host.appendChild(banner);

  return {
    show() {
      banner.classList.remove('hidden');
    },
  };
}
