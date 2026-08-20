/**
 * The two full-screen panels: the one you start from and the one you finish
 * on. Both are a heading, a line of plain words and a single big button —
 * nothing to read past and nothing to get wrong.
 */
export class Overlay {
  readonly root: HTMLDivElement;

  constructor(
    host: HTMLElement,
    title: string,
    body: string,
    button: string,
    onPress: () => void,
  ) {
    this.root = document.createElement("div");
    this.root.className = "overlay ui-interactive";

    const h = document.createElement("h1");
    h.textContent = title;
    const p = document.createElement("p");
    p.textContent = body;
    const b = document.createElement("button");
    b.className = "big-button ui-interactive";
    b.textContent = button;
    b.addEventListener("click", onPress);

    this.root.append(h, p, b);
    host.appendChild(this.root);
  }

  show(): void {
    this.root.classList.remove("hidden");
  }

  hide(): void {
    this.root.classList.add("hidden");
  }

  setBody(text: string): void {
    const p = this.root.querySelector("p");
    if (p) {
      p.textContent = text;
    }
  }
}
