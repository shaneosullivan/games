import * as THREE from "three";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  CAR,
  CarDesign,
  DRIVER,
  DriverKit,
  FILM,
  LIGHT,
  PLAYER,
  Sticker,
  STICKER,
  StickerKind,
} from "../config";
import {
  chooseColour,
  chooseDesign,
  chooseKit,
  myColour,
  myDesign,
  myKit,
} from "../core/garage";
import {keepStickers, myStickers} from "../core/stickers";
import {car, stick} from "../models/car";
import {deck, DECK_INSET, nearestDeck} from "../models/deck";
import {alongFlank, PICTURE_KINDS} from "../models/stickers";
import {setEnvironment} from "../render/materials";

/**
 * The garage: your car, and everything you can do to it.
 *
 * A whole screen for one set of decisions, and worth it. The car is on screen
 * for every second of every race and it is the thing a child thinks of as
 * themselves — "the red car" is only *your* car if you chose red, and it is
 * more yours again with your own name across the nose.
 *
 * The car in here is the real model, lit the way the game lights it, so what
 * is chosen is what turns up on the grid. Stickers are dragged on the car
 * itself rather than set with sliders: a ray from the finger onto the body
 * says where on the deck it landed, which is the only arrangement a child who
 * cannot read a coordinate can use.
 */
const EMOJI: Record<string, string> = {
  star: "⭐",
  heart: "❤️",
  flag: "🏁",
  skull: "💀",
  smiley: "🙂",
  bolt: "⚡",
  crown: "👑",
};

export class Garage {
  readonly root = document.createElement("div");

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly environment: THREE.Texture;
  private readonly stage = new THREE.Group();
  private readonly view = document.createElement("div");
  private readonly ray = new THREE.Raycaster();
  /** The flat sheet a dragged sticker slides on; see `STICKER.dragHeight`. */
  private readonly floor = new THREE.Plane(
    new THREE.Vector3(0, 1, 0),
    -STICKER.dragHeight,
  );

  /** The two halves of the controls, and the line under them. */
  private readonly carSide = document.createElement("div");
  private readonly driverSide = document.createElement("div");
  private readonly says = document.createElement("p");

  /** The bar that appears when a sticker is picked, and the parts of it that
   *  are only for writing. */
  private readonly chosenBar = document.createElement("div");
  private readonly words = document.createElement("input");
  private readonly fonts = document.createElement("select");

  private model: THREE.Group | null = null;
  private colour = myColour();
  private design: CarDesign = myDesign();
  private stickers: Array<Sticker> = myStickers();
  private kit: DriverKit = myKit();
  /** Which half of the garage is open: the car, or the person in it. */
  private showing: "car" | "driver" = "car";
  private chosen: number | null = null;
  private wide = 0;
  private tall = 0;
  private turn = 0.7;
  private spinning = true;
  private frame = 0;

  /**
   * @param onDone  back to the track list; only used when this is a screen of
   *   its own. Embedded beside the list there is nowhere to go back to.
   */
  constructor(
    private readonly onDone: (() => void) | null,
    private readonly embedded = false,
  ) {
    this.root.className = embedded ? "garage-panel" : "screen garage";

    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = FILM.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "garage-canvas";

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = FILM.envIntensity;
    setEnvironment(this.environment, FILM.envIntensity);
    pmrem.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient * Math.PI));
    const sun = new THREE.DirectionalLight(0xffffff, LIGHT.sun * Math.PI);
    sun.position
      .set(LIGHT.from.x, LIGHT.from.y, LIGHT.from.z)
      .multiplyScalar(120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    for (const edge of ["left", "right", "top", "bottom"] as const) {
      sun.shadow.camera[edge] = edge === "left" || edge === "bottom" ? -30 : 30;
    }
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight(0xffffff, LIGHT.fill * Math.PI);
    fill.position.set(-1, 0.6, -0.8);
    this.scene.add(fill);
    this.scene.add(this.stage);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);

    this.build();
    this.paint();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private build(): void {
    // A screen of its own needs a way out and a title; embedded beside the
    // track list it is simply part of the page and needs neither.
    let bar: HTMLElement | null = null;
    if (!this.embedded) {
      bar = document.createElement("header");
      bar.className = "editor-bar";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "chip ghost";
      back.textContent = "◀ Tracks";
      back.addEventListener("click", () => this.onDone?.());
      const title = document.createElement("strong");
      title.className = "models-title";
      title.textContent = "Your car";
      bar.append(back, title);
    }

    this.view.className = "garage-view";
    this.view.appendChild(this.renderer.domElement);

    const swatches = document.createElement("div");
    swatches.className = "swatches";
    for (const choice of PLAYER.choices) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "swatch";
      dot.dataset.colour = String(choice);
      dot.style.background = hex(choice);
      dot.setAttribute("aria-label", `Car colour ${hex(choice)}`);
      dot.addEventListener("click", () => {
        this.colour = choice;
        chooseColour(choice);
        this.paint();
        this.markChosen();
      });
      swatches.appendChild(dot);
    }

    // The designs, under the colours and in the same shape of row: two rows of
    // buttons that both change the car in front of you is one idea, not two.
    const designs = document.createElement("div");
    designs.className = "designs";
    for (const choice of PLAYER.designs) {
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "design";
      pick.dataset.design = choice.id;
      pick.textContent = choice.name;
      pick.addEventListener("click", () => {
        this.design = choice.id;
        chooseDesign(choice.id);
        this.paint();
        this.markChosen();
      });
      designs.appendChild(pick);
    }

    this.says.className = "garage-says";

    this.carSide.className = "garage-half";
    this.carSide.append(swatches, designs, this.stickerRow(), this.chosenRow());
    this.driverSide.className = "garage-half";
    this.driverSide.append(
      this.kitRow("helmet", DRIVER.helmets),
      this.kitRow("suit", DRIVER.suits),
    );

    // The car above, everything that changes it below. The controls are their
    // own box so they can scroll on a short screen without taking the car with
    // them — see `.garage-view` in the stylesheet.
    const controls = document.createElement("div");
    controls.className = "garage-controls";
    controls.append(this.carSide, this.driverSide, this.says);
    this.root.append(...(bar ? [bar] : []), this.tabs(), this.view, controls);

    this.markChosen();
    this.handle();
  }

  /**
   * The two halves, as one big switch across the top of the screen.
   *
   * Above the car rather than below it, and the width of the page: what is
   * behind it — a whole second set of things to choose — is not something a
   * child should have to find, so it is the first thing on the screen and it
   * says what it is.
   */
  private tabs(): HTMLElement {
    const row = document.createElement("div");
    row.className = "garage-tabs";
    for (const [id, label] of [
      ["car", "🚗 The car"],
      ["driver", "🧑 The driver"],
    ] as Array<[typeof this.showing, string]>) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "garage-tab";
      tab.dataset.side = id;
      tab.textContent = label;
      tab.addEventListener("click", () => {
        this.showing = id;
        this.markChosen();
      });
      row.appendChild(tab);
    }
    return row;
  }

  /** A row of colours for one part of the driver's kit. */
  private kitRow(
    part: keyof DriverKit,
    choices: ReadonlyArray<number>,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "swatches";
    const title = document.createElement("p");
    title.className = "kit-title";
    title.textContent = part === "helmet" ? "Helmet" : "Overalls";

    for (const choice of choices) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "swatch";
      dot.dataset.kit = part;
      dot.dataset.colour = String(choice);
      dot.style.background = hex(choice);
      dot.setAttribute("aria-label", `${title.textContent} ${hex(choice)}`);
      dot.addEventListener("click", () => {
        this.kit = {...this.kit, [part]: choice};
        chooseKit(this.kit);
        this.paint();
        this.markChosen();
      });
      row.appendChild(dot);
    }

    const box = document.createElement("div");
    box.className = "kit-row";
    box.append(title, row);
    return box;
  }

  /** The things you can add: the shapes, then writing, then a way to clear the
   *  lot when a car has disappeared under them. */
  private stickerRow(): HTMLElement {
    const row = document.createElement("div");
    row.className = "stickers";
    for (const kind of PICTURE_KINDS) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "sticker-add";
      add.textContent = EMOJI[kind] ?? "•";
      add.setAttribute("aria-label", `Add a ${kind}`);
      add.addEventListener("click", () => this.add(kind));
      row.appendChild(add);
    }

    const write = document.createElement("button");
    write.type = "button";
    write.className = "sticker-add wide";
    write.textContent = "Aa Writing";
    // Focused straight out of the tap, which is the only way an iPad brings
    // its keyboard up: ask for it a moment later and the gesture is over and
    // the keyboard stays down.
    write.addEventListener("click", () => {
      this.add("text");
      this.words.focus();
      this.words.select();
    });
    row.appendChild(write);

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "sticker-add ghost";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      this.stickers = [];
      this.chosen = null;
      this.save();
      this.paint();
      this.markChosen();
    });
    row.appendChild(clear);
    return row;
  }

  /** What you can do to the sticker you have hold of. Hidden until there is
   *  one, because a row of dead buttons is a row of questions. */
  private chosenRow(): HTMLElement {
    this.chosenBar.className = "chosen-bar";

    this.words.type = "text";
    this.words.className = "sticker-words";
    this.words.maxLength = 24;
    this.words.placeholder = "Type here";
    this.words.setAttribute("aria-label", "What it says");
    this.words.addEventListener("input", () => {
      const one = this.held();
      if (one) {
        one.text = this.words.value;
        this.save();
        this.restick();
      }
    });

    this.fonts.className = "sticker-font";
    this.fonts.setAttribute("aria-label", "Kind of writing");
    for (const font of STICKER.fonts) {
      const option = document.createElement("option");
      option.value = font.id;
      option.textContent = font.name;
      this.fonts.appendChild(option);
    }
    this.fonts.addEventListener("change", () => {
      const one = this.held();
      if (one) {
        one.font = this.fonts.value;
        this.save();
        this.restick();
      }
    });

    const smaller = this.tool("−", "Smaller", () =>
      this.resizeChosen(1 / STICKER.step),
    );
    const bigger = this.tool("+", "Bigger", () =>
      this.resizeChosen(STICKER.step),
    );

    const remove = this.tool("🗑", "Take it off", () => {
      if (this.chosen === null) {
        return;
      }
      this.stickers.splice(this.chosen, 1);
      this.chosen = null;
      this.save();
      this.paint();
      this.markChosen();
    });

    this.chosenBar.append(this.words, this.fonts, smaller, bigger, remove);
    return this.chosenBar;
  }

  private tool(
    label: string,
    says: string,
    onTap: () => void,
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sticker-tool";
    b.textContent = label;
    b.setAttribute("aria-label", says);
    b.addEventListener("click", onTap);
    return b;
  }

  private add(kind: StickerKind): void {
    if (this.stickers.length >= STICKER.most) {
      return;
    }
    if (kind === "text") {
      this.stickers.push({
        kind,
        u: 0,
        v: 0,
        h: STICKER.sideAt,
        size: STICKER.textSize,
        text: "Go!",
        font: STICKER.fonts[0].id,
      });
    } else {
      // One picture, and picking another swaps it. Tapping a crown when there
      // is already a star is a child changing their mind, not asking for both
      // — and a nose is a small panel with room for one thing on it.
      const was = this.stickers.find(s => s.kind !== "text");
      this.stickers = this.stickers.filter(s => s.kind === "text");
      this.stickers.push({
        kind,
        u: was?.u ?? 0,
        v: was?.v ?? nearestDeck(STICKER.dropAt),
        size: was?.size ?? STICKER.size,
      });
    }
    this.chosen = this.stickers.length - 1;
    this.save();
    this.paint();
    this.markChosen();
  }

  private resizeChosen(by: number): void {
    const one = this.held();
    if (!one) {
      return;
    }
    one.size = Math.max(
      STICKER.smallest,
      Math.min(STICKER.largest, one.size * by),
    );
    this.save();
    this.restick();
  }

  private held(): Sticker | null {
    return this.chosen === null ? null : (this.stickers[this.chosen] ?? null);
  }

  private save(): void {
    keepStickers(this.stickers);
  }

  private markChosen(): void {
    for (const dot of this.root.querySelectorAll<HTMLElement>(".swatch")) {
      const kit = dot.dataset.kit as keyof DriverKit | undefined;
      const want = kit ? this.kit[kit] : this.colour;
      dot.classList.toggle("on", Number(dot.dataset.colour) === want);
    }
    for (const tab of this.root.querySelectorAll<HTMLElement>(".garage-tab")) {
      tab.classList.toggle("on", tab.dataset.side === this.showing);
    }
    this.carSide.hidden = this.showing !== "car";
    this.driverSide.hidden = this.showing !== "driver";
    this.says.textContent =
      this.showing === "driver"
        ? "Your driver. Pick a helmet and overalls."
        : this.embedded
          ? "Your car. Drag a sticker to move it."
          : "Tap something to add it, then drag it around the car.";
    for (const pick of this.root.querySelectorAll<HTMLElement>(".design")) {
      pick.classList.toggle("on", pick.dataset.design === this.design);
    }
    const one = this.held();
    this.chosenBar.classList.toggle("on", one !== null);
    const writing = one?.kind === "text";
    this.words.hidden = !writing;
    this.fonts.hidden = !writing;
    if (writing) {
      this.words.value = one?.text ?? "";
      this.fonts.value = one?.font ?? STICKER.fonts[0].id;
    }
  }

  /** Rebuilds the whole car: colour, design and stickers. */
  private paint(): void {
    if (this.model) {
      this.stage.remove(this.model);
    }
    this.model = car(this.colour, this.design, this.stickers, this.kit);
    this.stage.add(this.model);
    this.glow();
  }

  /** Rebuilds only what is stuck on it. Every keystroke of a name goes through
   *  here, and a convex hull and four wheels a letter is not worth it. */
  private restick(): void {
    if (this.model) {
      stick(this.model, this.stickers, this.colour);
      this.glow();
    }
  }

  /** The one you have hold of, lit up, so it is clear what the buttons and the
   *  keyboard are about to change. */
  private glow(): void {
    this.model?.traverse(o => {
      const mesh = o as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mesh.userData.sticker === undefined || !material?.isMaterial) {
        return;
      }
      material.emissive = new THREE.Color(
        mesh.userData.sticker === this.chosen ? 0x555555 : 0x000000,
      );
    });
  }

  /**
   * The car turns under a finger, and a sticker moves under one.
   *
   * Which of the two it is comes from what the finger went down on: a ray into
   * the scene that hits a sticker takes hold of it, and anything else turns
   * the car. That is one gesture doing two jobs, and it works because the
   * stickers are their own meshes and can be told apart.
   */
  private handle(): void {
    let turning: number | null = null;
    let dragging = false;

    this.view.addEventListener("pointerdown", e => {
      // Capture so a drag that wanders off the canvas still arrives here, but
      // never at the cost of the gesture: a pointer the browser has already
      // let go of throws, and losing the whole handler to that would mean a
      // car that cannot be turned or a sticker that cannot be picked up.
      try {
        this.view.setPointerCapture(e.pointerId);
      } catch {
        // Then the events come to the element itself, which is where the
        // finger is anyway.
      }
      this.spinning = false;
      const hit = this.stickerUnder(e);
      if (hit === null) {
        turning = e.clientX;
        dragging = false;
        return;
      }
      this.chosen = hit;
      this.markChosen();
      this.glow();
      dragging = true;
      // A tap on writing puts the keyboard up, which is what a child expects
      // from tapping words. It has to happen inside the gesture.
      if (this.held()?.kind === "text") {
        this.words.focus();
      }
    });

    this.view.addEventListener("pointermove", e => {
      if (dragging) {
        this.dragTo(e);
        return;
      }
      if (turning !== null) {
        this.turn -= (e.clientX - turning) * 0.01;
        turning = e.clientX;
      }
    });

    const stop = (): void => {
      if (dragging) {
        this.save();
      }
      turning = null;
      dragging = false;
    };
    this.view.addEventListener("pointerup", stop);
    this.view.addEventListener("pointercancel", stop);
  }

  /** Which sticker is under the pointer, if any. */
  private stickerUnder(e: PointerEvent): number | null {
    for (const hit of this.cast(e)) {
      const which = hit.object.userData.sticker;
      if (typeof which === "number") {
        return which;
      }
      // The first thing the ray meets and it is not a sticker: whatever is
      // behind it is behind the car as well.
      return null;
    }
    return null;
  }

  /**
   * Moves the held sticker to wherever the finger is on the car.
   *
   * Off the car entirely, nothing happens — the sticker stays where it was
   * rather than flying off to whatever the ray hit next.
   */
  private dragTo(e: PointerEvent): void {
    const one = this.held();
    if (!one || !this.model) {
      return;
    }
    this.aimAt(e);
    const at = new THREE.Vector3();
    // Writing is on the sides, so it is dragged on a sheet standing up through
    // the middle of the car: along it, and up and down it. A picture is on the
    // decks, so it is dragged on a sheet lying flat.
    const sheet = one.kind === "text" ? this.pane() : this.floor;
    if (!this.ray.ray.intersectPlane(sheet, at)) {
      return;
    }
    const local = this.model.worldToLocal(at);
    if (one.kind === "text") {
      one.v = alongFlank(local.z / CAR.length);
      one.h = local.y;
      this.restick();
      return;
    }
    const v = nearestDeck(local.z / CAR.length);
    const room = deck(v, CAR.width).half * DECK_INSET;
    one.v = v;
    one.u = room > 0 ? Math.max(-1, Math.min(1, local.x / room)) : 0;
    this.restick();
  }

  /** Points the ray at whatever is under the pointer. */
  private aimAt(e: PointerEvent): void {
    const box = this.view.getBoundingClientRect();
    const point = new THREE.Vector2(
      ((e.clientX - box.left) / box.width) * 2 - 1,
      -((e.clientY - box.top) / box.height) * 2 + 1,
    );
    this.ray.setFromCamera(point, this.camera);
  }

  /**
   * The sheet a word is dragged on: upright, through the middle of the car,
   * turned to face the camera so it is never edge-on to the ray.
   */
  private pane(): THREE.Plane {
    const facing = new THREE.Vector3();
    this.camera.getWorldDirection(facing);
    const flat = new THREE.Vector3(facing.x, 0, facing.z).normalize();
    return new THREE.Plane(flat, 0);
  }

  private cast(e: PointerEvent): Array<THREE.Intersection> {
    this.aimAt(e);
    return this.model ? this.ray.intersectObject(this.model, true) : [];
  }

  private resize = (): void => {
    const box = this.view.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) {
      return;
    }
    this.wide = box.width;
    this.tall = box.height;
    this.renderer.setSize(box.width, box.height);
    const aspect = box.width / box.height;
    this.camera.aspect = aspect;
    // Wider lens on a tall window, so a car fits across it either way up.
    this.camera.fov = aspect < 1 ? 34 / aspect : 34;
    this.camera.updateProjectionMatrix();
  };

  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const box = this.view.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) {
      return;
    }
    // Measured every frame rather than only on a window resize. The box moves
    // for reasons the window knows nothing about — the keyboard coming up on
    // an iPad, the controls under it growing a row — and a canvas left at the
    // old size spills out of its box and over them.
    if (box.width !== this.wide || box.height !== this.tall) {
      this.resize();
    }
    if (this.spinning) {
      this.turn += 0.006;
    }
    this.stage.rotation.y = this.turn;
    this.camera.position.set(0, 13, 34);
    this.camera.lookAt(0, 3.4, 0);
    this.renderer.render(this.scene, this.camera);
  };
}

function hex(colour: number): string {
  return `#${colour.toString(16).padStart(6, "0")}`;
}
