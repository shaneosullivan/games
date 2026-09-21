import {NET} from "../config";
import chofterUrl from "../assets/chofter.png";
import {codeFromText} from "../net/room";

/**
 * Joining a race by reading the code off the other screen.
 *
 * The camera is the quick way in and it is not always the way in: a code can be
 * read out across a room, or typed by somebody whose iPad will not focus on a
 * QR square, or passed on by a parent from another room entirely. The code is
 * five characters from an alphabet with nothing in it that can be misread — no
 * O against 0, no I against 1 — which is what makes it worth typing at all.
 *
 * Everything here is forgiving: lower case is fine, spaces are fine, and so is
 * pasting the whole address the code came in. What a child cannot do is get it
 * subtly wrong and be told nothing, which is why the button will not light up
 * until there are five real characters in the box.
 */
export interface JoinHandlers {
  onJoin: (code: string) => void;
  onCancel: () => void;
}

export class Join {
  readonly root = document.createElement("div");

  private readonly box = document.createElement("input");
  private readonly go = document.createElement("button");

  constructor(private readonly handlers: JoinHandlers) {
    this.root.className = "screen join";

    const head = document.createElement("header");
    head.className = "menu-head";
    const title = document.createElement("h1");
    title.textContent = "Join a race";
    head.append(homeLink(), title);

    const body = document.createElement("div");
    body.className = "join-body";

    const says = document.createElement("p");
    says.className = "join-says";
    says.textContent = "Type the five letters on the other screen.";

    this.box.type = "text";
    this.box.className = "join-box ui-interactive";
    this.box.maxLength = NET.code * 3;
    this.box.setAttribute("aria-label", "The race's code");
    this.box.placeholder = "-".repeat(NET.code);
    // A child types this with two thumbs and no shift key in sight, and may
    // well paste the whole address the code arrived in.
    this.box.autocapitalize = "characters";
    this.box.autocomplete = "off";
    this.box.spellcheck = false;
    this.box.addEventListener("input", () => this.tidy());
    this.box.addEventListener("keydown", e => {
      if (e.key === "Enter" && !this.go.disabled) {
        this.submit();
      }
    });

    this.go.type = "button";
    this.go.className = "big-button ui-interactive";
    this.go.textContent = "Join";
    this.go.disabled = true;
    this.go.addEventListener("click", () => this.submit());

    body.append(says, this.box, this.go);

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "chip ghost ui-interactive";
    back.textContent = "Back";
    back.addEventListener("click", () => this.handlers.onCancel());
    foot.appendChild(back);

    this.root.append(head, body, foot);
    // The keyboard up and the cursor in the box, so the first thing a child
    // does is type rather than find somewhere to type.
    window.setTimeout(() => this.box.focus(), 50);
  }

  /** Whatever was typed, held to what a code can be. Written back into the box
   *  so what is on the screen is exactly what will be sent. */
  private tidy(): void {
    const code = codeFromText(this.box.value);
    if (this.box.value !== code) {
      this.box.value = code;
    }
    this.go.disabled = code.length < NET.code;
  }

  private submit(): void {
    const code = codeFromText(this.box.value);
    if (code.length === NET.code) {
      this.handlers.onJoin(code);
    }
  }
}

/** The same mark as the menu's, and the same reason for it. */
function homeLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.className = "home-link";
  link.href = "../../";
  link.title = "All the Chofter games";
  link.setAttribute("aria-label", "All the Chofter games");
  const img = document.createElement("img");
  img.src = chofterUrl;
  img.alt = "";
  img.width = 40;
  img.height = 40;
  link.appendChild(img);
  return link;
}
