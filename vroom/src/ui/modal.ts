/**
 * The one modal in the game: the track's own JSON, for handing to somebody.
 *
 * The plan is for a server one day, with short codes for swapping tracks
 * about. Until then this is the whole sharing story, so it has to be something
 * a person can actually get out of the page: a box of text they can read and a
 * button that puts it on the clipboard.
 */
export function showJson(host: HTMLElement, title: string, json: string): void {
  const back = document.createElement("div");
  back.className = "modal-back ui-interactive";

  const box = document.createElement("div");
  box.className = "modal";

  const h = document.createElement("h2");
  h.textContent = title;

  const area = document.createElement("textarea");
  area.className = "modal-json";
  area.readOnly = true;
  area.value = json;

  const row = document.createElement("div");
  row.className = "modal-row";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "chip strong";
  copy.textContent = "Copy to clipboard";
  copy.addEventListener("click", () => {
    void copyText(area).then(ok => {
      copy.textContent = ok ? "Copied!" : "Press and hold to copy";
    });
  });

  const close = document.createElement("button");
  close.type = "button";
  close.className = "chip";
  close.textContent = "Close";
  close.addEventListener("click", () => back.remove());

  row.append(copy, close);
  box.append(h, area, row);
  back.appendChild(box);
  // Tapping the backdrop closes it; tapping the card must not, or selecting
  // the text in the box would dismiss the box.
  back.addEventListener("click", event => {
    if (event.target === back) {
      back.remove();
    }
  });
  host.appendChild(back);
}

/**
 * Clipboard, with a fallback.
 *
 * `navigator.clipboard` is not there on an insecure origin and is refused
 * outright by some browsers, which is why the old selection trick is still
 * here — and why the button says what to do by hand when both fail.
 */
async function copyText(area: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(area.value);
    return true;
  } catch {
    try {
      area.select();
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}
