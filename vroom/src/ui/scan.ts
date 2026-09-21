import jsQR from "jsqr";
import chofterUrl from "../assets/chofter.png";
import {NET} from "../config";
import {codeFromText} from "../net/room";

/**
 * Reading the other screen's code with this device's camera.
 *
 * Why this exists when every phone's own camera app already reads a QR code:
 * because the game may already be open. A code scanned by the camera app is a
 * web address, and a web address opens a *browser* — so a child who has the
 * game on their home screen and taps the code gets a second copy of it in
 * Safari instead of the one they were holding. There is no way to ask iOS to
 * hand a link to an installed home screen app; the only way to keep the child
 * inside the game they already have open is to do the looking here.
 *
 * The decoding is jsQR rather than the browser's own BarcodeDetector, which
 * Safari does not have — and Safari on an iPad is exactly the case this screen
 * is for.
 *
 * Every way this can fail is a sentence on the screen rather than a dead
 * picture: no camera, a camera somebody else is using, or a child who said no
 * to the permission and can say yes by tapping again.
 */
export interface ScanHandlers {
  onCode: (code: string) => void;
  onCancel: () => void;
  /** No camera worth using: the typed code is the way in from here. */
  onType: () => void;
}

/** How often to look at a frame, in milliseconds. A QR code does not move and
 *  reading every frame of a 60Hz camera is sixty times the work for the same
 *  answer half a second sooner. */
const LOOK_EVERY = 120;

/** The biggest the picture is looked at, in pixels across. jsQR's work grows
 *  with the area, and a code that fills a quarter of a 640-wide frame is
 *  comfortably readable. */
const LOOK_AT = 640;

export class Scan {
  readonly root = document.createElement("div");

  private readonly video = document.createElement("video");
  private readonly says = document.createElement("p");
  private readonly canvas = document.createElement("canvas");
  private stream: MediaStream | null = null;
  private timer = 0;
  private done = false;

  constructor(private readonly handlers: ScanHandlers) {
    this.root.className = "screen scan";

    const head = document.createElement("header");
    head.className = "menu-head";
    const title = document.createElement("h1");
    title.textContent = "Scan their code";
    head.append(homeLink(), title);

    const body = document.createElement("div");
    body.className = "scan-body";

    const frame = document.createElement("div");
    frame.className = "scan-frame";
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute("aria-label", "What the camera can see");
    frame.append(this.video);

    this.says.className = "scan-says";
    this.says.textContent = "Point at the QR code on the other screen.";

    body.append(frame, this.says);

    const foot = document.createElement("div");
    foot.className = "menu-foot";
    const type = document.createElement("button");
    type.type = "button";
    type.className = "chip";
    type.textContent = "⌨️ Type it instead";
    type.addEventListener("click", () => this.handlers.onType());
    const back = document.createElement("button");
    back.type = "button";
    back.className = "chip ghost";
    back.textContent = "Back";
    back.addEventListener("click", () => this.handlers.onCancel());
    foot.append(type, back);

    this.root.append(head, body, foot);
    void this.open();
  }

  /**
   * Everything off.
   *
   * The camera light staying on after a child has gone back to the track list
   * is the sort of thing that gets a game deleted, so the tracks are stopped
   * one by one rather than trusting the element to let go of them.
   */
  dispose(): void {
    this.done = true;
    window.clearInterval(this.timer);
    for (const track of this.stream?.getTracks() ?? []) {
      track.stop();
    }
    this.stream = null;
    this.video.srcObject = null;
  }

  private async open(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.says.textContent =
        "This device has no camera the game can use. Type the code instead.";
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // The back camera, which is the one pointing at the other screen.
        // `ideal` rather than `exact`: a laptop has only the one facing you,
        // and refusing to scan at all on a laptop would be silly.
        video: {facingMode: {ideal: "environment"}},
        audio: false,
      });
    } catch {
      this.says.textContent =
        "The game needs to use the camera to read the code. Tap Scan again to " +
        "let it, or type the code instead.";
      return;
    }
    // Gone again while the camera was being asked for.
    if (this.done) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      return;
    }
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => undefined);
    this.timer = window.setInterval(() => this.look(), LOOK_EVERY);
  }

  /** One look at what the camera can see. */
  private look(): void {
    const width = this.video.videoWidth;
    const height = this.video.videoHeight;
    if (this.done || width === 0 || height === 0) {
      return;
    }
    const shrink = Math.min(1, LOOK_AT / Math.max(width, height));
    const w = Math.round(width * shrink);
    const h = Math.round(height * shrink);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    // `willReadFrequently`, because this reads the whole picture back out of
    // the canvas several times a second — which without it is the slow path
    // through the GPU and enough to make the preview stutter.
    const paper = this.canvas.getContext("2d", {willReadFrequently: true});
    if (!paper) {
      return;
    }
    paper.drawImage(this.video, 0, 0, w, h);
    const found = jsQR(paper.getImageData(0, 0, w, h).data, w, h, {
      inversionAttempts: "dontInvert",
    });
    if (!found) {
      return;
    }
    const code = codeFromText(found.data);
    if (code.length !== NET.code) {
      // A QR code, but not one of ours — a cereal box, a bus stop. Worth
      // saying, because otherwise the screen looks broken while it happily
      // reads something nobody wants.
      this.says.textContent = "That code is not a Vroom race. Try theirs.";
      return;
    }
    this.dispose();
    this.handlers.onCode(code);
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
