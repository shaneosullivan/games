/**
 * Logging for the maze's controls.
 *
 * These have failed twice on an iPad while working everywhere else, and an
 * iPad has no console of its own worth the name — so the controls say what
 * they are doing, and `chofter.logControls = true` turns it on. Off by default
 * because a held button would otherwise fill the log during ordinary play.
 */
export function controlLog(what: string, detail?: unknown): void {
  const api = (window as unknown as {chofter?: {logControls?: boolean}})
    .chofter;
  if (!api?.logControls) {
    return;
  }
  if (detail === undefined) {
    console.log(`[controls] ${what}`);
  } else {
    console.log(`[controls] ${what}`, detail);
  }
}

/** A pointer event, reduced to the parts that matter when one goes missing. */
export function pointerNote(e: PointerEvent): Record<string, unknown> {
  return {
    id: e.pointerId,
    type: e.pointerType,
    primary: e.isPrimary,
    buttons: e.buttons,
    target: (e.target as HTMLElement | null)?.className ?? null,
  };
}

/**
 * Watch every pointer and touch the document sees, once.
 *
 * When a control does nothing the first question is whether the browser is
 * delivering anything at all — a press that shows up here but not in the
 * button's own handler is a very different fault from one that never arrives.
 * Installed by the Game; costs nothing until `chofter.logControls` is on.
 */
export function watchInput(): void {
  for (const type of [
    "pointerdown",
    "pointerup",
    "touchstart",
    "touchend",
    "click",
  ]) {
    document.addEventListener(
      type,
      e => {
        const el = e.target as HTMLElement | null;
        controlLog(`document ${type}`, {
          target: el?.tagName + "." + (el?.className ?? ""),
          onTurnButton: !!el?.closest?.(".turn-btn"),
          onThrottle: !!el?.closest?.(".throttle"),
        });
      },
      true,
    );
  }
}
