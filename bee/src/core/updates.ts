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
const VERSION_URL = "version.json";
const POLL_MS = 60_000;
/** How long to wait for the caches to clear before reloading regardless. */
const PURGE_TIMEOUT_MS = 1500;

interface Version {
  build?: string;
}

export function watchForUpdates(host: HTMLElement): void {
  // Available in every build, including this one's dev server: when a copy is
  // wedged on an old version, the console is the only way in.
  const api = installConsoleApi();
  if (!import.meta.env.PROD) {
    return;
  }

  let current: string | null = null;
  let offered = false;

  const banner = createBanner(host, () => {
    void applyUpdate();
  });
  api.update = applyUpdate;

  const read = async (): Promise<string | null> => {
    try {
      // `no-store` keeps the browser's own cache out of it; the service worker
      // is told separately to leave this URL alone.
      const response = await fetch(VERSION_URL, {cache: "no-store"});
      if (!response.ok) {
        return null;
      }
      const data = (await response.json()) as Version;
      if (typeof data.build !== "string") {
        return null;
      }
      api.build = data.build;
      return data.build;
    } catch {
      // Offline, or no version.json at all. Either way there's nothing to say.
      return null;
    }
  };

  const check = async (): Promise<void> => {
    if (offered) {
      return;
    }
    const build = await read();
    if (!build) {
      return;
    }
    if (current === null) {
      current = build;
      return;
    }
    if (build === current) {
      return;
    }
    offered = true;
    banner.show();
  };

  void check();
  setInterval(() => void check(), POLL_MS);
  // An installed app is usually resumed rather than opened, and a resume after
  // a day shouldn't wait out the poll before noticing.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void check();
    }
  });
}

/** Bin every cache, then come back for the new build. */
async function applyUpdate(): Promise<void> {
  // Whatever happens below, the page reloads. This used to `await
  // registration.update()` as well, and on iOS that can simply never settle —
  // the worker is torn down mid-install and the promise is left hanging, so the
  // banner sat at "Updating…" for good. The service worker doesn't need our
  // help: the browser re-checks it on the next navigation anyway.
  const done = () => window.location.reload();
  const backstop = setTimeout(done, PURGE_TIMEOUT_MS);

  try {
    await purgeCaches();
  } catch {
    // A failed clean-up is not a reason to refuse to reload.
  }

  clearTimeout(backstop);
  done();
}

/** Bin every cache, so the reload can't be served the page we're replacing. */
async function purgeCaches(): Promise<Array<string>> {
  if (!("caches" in window)) {
    return [];
  }
  const names = await caches.keys();
  await Promise.all(names.map(name => caches.delete(name)));
  return names;
}

/** What `window.chofter` offers from the console. */
interface ChofterApi {
  /** Build stamp this copy is running, once version.json has been read. */
  build: string | null;
  /** Take a pending update now: purge the caches and reload. */
  update(): Promise<void>;
  /** The big hammer — see below. */
  reset(): Promise<void>;
  /**
   * Everything worth knowing when something looks wrong: logged, copied to the
   * clipboard, and returned as the string to paste.
   */
  diagnose(): Promise<string>;
}

/**
 * `window.chofter` — the console handle.
 *
 * `reset()` is the hammer: a copy can be wedged on a build old enough that its
 * own update path is broken, which no amount of waiting will fix. It
 * unregisters the service worker (a live one serves its cache straight back, so
 * purging alone isn't enough) and reloads with a cache-buster, since Safari's
 * own HTTP cache may still be holding the page. Workers and caches are
 * per-origin, so running it in a browser tab fixes the installed app too.
 *
 * `diagnose()` exists because the interesting bugs here are all on a device
 * with no devtools of its own — it reports the numbers worth pasting back.
 */
function installConsoleApi(): ChofterApi {
  const api: ChofterApi = {
    build: null,
    update: async () => {
      window.location.reload();
    },
    reset: async () => {
      const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
      await Promise.all(regs.map(r => r.unregister()));
      const names = await purgeCaches();
      console.log(
        `chofter.reset: ${regs.length} worker(s) unregistered, caches cleared:`,
        names,
      );
      window.location.replace(
        `${window.location.pathname}?fresh=${Date.now()}`,
      );
    },
    diagnose: async () => {
      const doc = document.documentElement;
      const vv = window.visualViewport;
      const app = document.getElementById("app")?.getBoundingClientRect();
      const info = {
        build: api.build,
        url: window.location.href,
        standalone:
          (navigator as unknown as {standalone?: boolean}).standalone ??
          window.matchMedia("(display-mode: standalone)").matches,
        // The viewport question: which of these disagree, and by how much.
        visualViewport: vv
          ? [Math.round(vv.width), Math.round(vv.height)]
          : null,
        documentElement: [doc.clientWidth, doc.clientHeight],
        inner: [window.innerWidth, window.innerHeight],
        screen: [window.screen.width, window.screen.height],
        app: app ? [Math.round(app.width), Math.round(app.height)] : null,
        safeArea: getComputedStyle(doc).getPropertyValue("--safe-b").trim(),
        caches: "caches" in window ? await caches.keys() : [],
        workers: ((await navigator.serviceWorker?.getRegistrations?.()) ?? [])
          .length,
      };

      const text = JSON.stringify(info);
      console.log(info);
      console.log(text);
      try {
        await navigator.clipboard?.writeText(text);
        console.log("(copied to the clipboard)");
      } catch {
        // Safari can refuse a clipboard write outside a gesture. The line above
        // is the fallback: select it and copy by hand.
        console.log("(clipboard refused — copy the line above)");
      }
      return text;
    },
  };

  (window as unknown as Record<string, unknown>).chofter = api;
  return api;
}

function createBanner(host: HTMLElement, onTake: () => void): {show(): void} {
  const banner = document.createElement("button");
  banner.type = "button";
  banner.className = "update-banner ui-interactive hidden";
  banner.innerHTML = "<b>A new version is ready</b><span>Tap to update</span>";
  banner.addEventListener("click", () => {
    banner.classList.add("taken");
    banner.querySelector("span")!.textContent = "Updating…";
    onTake();
  });
  host.appendChild(banner);

  return {
    show() {
      banner.classList.remove("hidden");
    },
  };
}
