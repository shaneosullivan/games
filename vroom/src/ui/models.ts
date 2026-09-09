import * as THREE from "three";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {ENVIRONMENTS, Environment, FILM, LIGHT, SCENERY} from "../config";
import {Rng} from "../core/rng";
import {ENVIRONMENT_IDS, MODELS, ModelEntry} from "../models";
import {setEnvironment} from "../render/materials";

/**
 * Every model in the game, on one page, turnable.
 *
 * A development tool and unapologetically one. Models are the hardest thing in
 * this game to get right, because in play they go past at a hundred kilometres
 * an hour at forty-five degrees and half of each one is never seen — so a
 * wheel can be inside out for a week without anybody noticing. Here each of
 * them sits still on its own card and can be turned to any angle.
 *
 * **One renderer, many views.** Each card is an ordinary div with nothing in
 * it; a single canvas sits behind the whole grid, and every frame the renderer
 * walks the cards, sets its scissor to the card's rectangle and draws that
 * model's little scene into it. Thirty cards is one WebGL context rather than
 * thirty — browsers hand out about sixteen before they start quietly dropping
 * the oldest.
 *
 * The URL carries what is open, so a reload comes straight back to it. That is
 * the point of the hash: this tool exists to be used while a model is being
 * edited, and an editor that saves on every keystroke reloads the page every
 * few seconds.
 */
export const MODELS_HASH = "#models";

/** How wide the lens on a card is, before the card's shape is taken into
 *  account. */
const CARD_FOV = 38;

interface Card {
  entry: ModelEntry;
  root: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  model: THREE.Object3D;
  /** Where it is turned to, and whether it is turning itself. */
  yaw: number;
  pitch: number;
  spinning: boolean;
}

export class ModelViewer {
  readonly root = document.createElement("div");

  private readonly renderer: THREE.WebGLRenderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly grid = document.createElement("div");
  private readonly cards: Array<Card> = [];
  private readonly environment: THREE.Texture;
  private environmentId: Environment = "hills";
  private full: Card | null = null;
  private frame = 0;

  constructor(private readonly onClose: () => void) {
    this.root.className = "screen models";

    this.renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = FILM.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setScissorTest(true);
    this.canvas = this.renderer.domElement;
    this.canvas.className = "models-canvas";

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    setEnvironment(this.environment, FILM.envIntensity);
    pmrem.dispose();

    this.build();
    this.rebuildCards();
    window.addEventListener("resize", this.resize);
    this.resize();
    this.tick();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    this.environment.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  // ---------- the page ----------

  private build(): void {
    const bar = document.createElement("header");
    bar.className = "editor-bar";

    const back = document.createElement("button");
    back.type = "button";
    back.className = "chip ghost";
    back.textContent = "◀ Back";
    back.addEventListener("click", () => this.onClose());

    const title = document.createElement("strong");
    title.className = "models-title";
    title.textContent = `Models (${MODELS.length})`;

    const envs = document.createElement("div");
    envs.className = "models-envs";
    for (const id of ENVIRONMENT_IDS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.env = id;
      b.textContent = ENVIRONMENTS[id].name;
      b.addEventListener("click", () => {
        this.environmentId = id;
        this.rebuildCards();
        this.markEnvs();
      });
      envs.appendChild(b);
    }

    bar.append(back, title, envs);
    this.grid.className = "models-grid";
    this.root.append(this.canvas, bar, this.grid);
    this.markEnvs();
  }

  private markEnvs(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>(
      ".models-envs button",
    )) {
      b.classList.toggle("strong", b.dataset.env === this.environmentId);
    }
  }

  /** Every model, fresh, in the currently chosen environment. */
  private rebuildCards(): void {
    this.cards.length = 0;
    this.grid.replaceChildren();
    this.full = null;
    const palette = ENVIRONMENTS[this.environmentId];

    for (const entry of MODELS) {
      const card = document.createElement("div");
      card.className = "model-card";

      const head = document.createElement("div");
      head.className = "model-head";
      const name = document.createElement("span");
      name.textContent = entry.name;
      const grow = document.createElement("button");
      grow.type = "button";
      grow.className = "chip ghost";
      grow.textContent = "Maximise";
      head.append(name, grow);

      const view = document.createElement("div");
      view.className = "model-view";
      card.append(head, view);
      this.grid.appendChild(card);

      // Each card is its own little world: a scene, a camera, two lights and
      // a floor to take the shadow.
      const scene = new THREE.Scene();
      scene.environment = this.environment;
      scene.environmentIntensity = FILM.envIntensity;
      scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient * Math.PI));
      const sun = new THREE.DirectionalLight(0xffffff, LIGHT.sun * Math.PI);
      sun.position
        .set(LIGHT.from.x, LIGHT.from.y, LIGHT.from.z)
        .multiplyScalar(200);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const reach = entry.size;
      sun.shadow.camera.left = -reach;
      sun.shadow.camera.right = reach;
      sun.shadow.camera.top = reach;
      sun.shadow.camera.bottom = -reach;
      sun.shadow.camera.far = 800;
      scene.add(sun, sun.target);
      const fill = new THREE.DirectionalLight(0xffffff, LIGHT.fill * Math.PI);
      fill.position.set(-1, 0.6, -0.8);
      scene.add(fill);

      const model = entry.make(
        palette,
        new Rng(SCENERY.seed + entry.id.length),
      );
      const holder = new THREE.Group();
      holder.add(model);
      scene.add(holder);

      const camera = new THREE.PerspectiveCamera(CARD_FOV, 1, 0.5, 3000);

      this.cards.push({
        entry,
        root: view,
        scene,
        camera,
        model: holder,
        yaw: 0.7,
        pitch: 0.5,
        spinning: true,
      });
      const mine = this.cards[this.cards.length - 1];

      grow.addEventListener("click", () => {
        const going = this.full !== mine;
        const was = this.full;
        was?.root.parentElement?.classList.remove("full");
        const wasButton =
          was?.root.parentElement?.querySelector(".model-head button");
        if (wasButton) {
          wasButton.textContent = "Maximise";
        }
        this.full = going ? mine : null;
        card.classList.toggle("full", going);
        this.grid.classList.toggle("zoomed", going);
        grow.textContent = going ? "Minimise" : "Maximise";
        this.saveHash();
        this.resize();
      });

      this.turnable(view, mine);
    }
    this.saveHash();
    this.resize();
  }

  /** Drag to turn it; let go and it goes back to turning itself. */
  private turnable(view: HTMLElement, card: Card): void {
    let last: {x: number; y: number} | null = null;
    view.addEventListener("pointerdown", e => {
      view.setPointerCapture(e.pointerId);
      last = {x: e.clientX, y: e.clientY};
      card.spinning = false;
    });
    view.addEventListener("pointermove", e => {
      if (!last) {
        return;
      }
      card.yaw -= (e.clientX - last.x) * 0.01;
      card.pitch = Math.max(
        -1.4,
        Math.min(1.4, card.pitch + (e.clientY - last.y) * 0.01),
      );
      last = {x: e.clientX, y: e.clientY};
    });
    const stop = (): void => {
      last = null;
    };
    view.addEventListener("pointerup", stop);
    view.addEventListener("pointercancel", stop);
    view.addEventListener("dblclick", () => {
      card.spinning = !card.spinning;
    });
  }

  // ---------- what is open, in the URL ----------

  private saveHash(): void {
    const id = this.full?.entry.id;
    const want = id
      ? `${MODELS_HASH}/${this.environmentId}/${id}`
      : `${MODELS_HASH}/${this.environmentId}`;
    if (window.location.hash !== want) {
      window.history.replaceState(null, "", want);
    }
  }

  /** Opens whatever the URL was pointing at, after a reload. */
  restore(hash: string): void {
    const rest = hash.startsWith(MODELS_HASH)
      ? hash.slice(MODELS_HASH.length).replace(/^\//, "")
      : "";
    const [env, id] = rest.split("/");
    if (env && (ENVIRONMENT_IDS as Array<string>).includes(env)) {
      this.environmentId = env as Environment;
      this.rebuildCards();
      this.markEnvs();
    }
    if (id) {
      const card = this.cards.find(c => c.entry.id === id);
      const button = card?.root.parentElement?.querySelector("button");
      button?.click();
    }
  }

  // ---------- drawing ----------

  private resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  /**
   * One canvas, one pass, every card.
   *
   * The scissor is what makes this work: the renderer is told to touch only
   * the rectangle a card occupies, so thirty little scenes share one context
   * and one frame. Cards scrolled off the page are skipped, which is most of
   * them most of the time.
   */
  private tick = (): void => {
    this.frame = requestAnimationFrame(this.tick);
    const height = window.innerHeight;

    // Cards scroll under the bar at the top, so the drawable area is the grid
    // and not the window — without this a half-scrolled model paints over the
    // header.
    const clip = this.grid.getBoundingClientRect();

    for (const card of this.cards) {
      // While one is maximised the others are hidden, and a hidden card still
      // has a rectangle — drawn into, it would paint over the one being
      // looked at.
      if (this.full && card !== this.full) {
        continue;
      }
      const raw = card.root.getBoundingClientRect();
      const full = card.root.parentElement?.classList.contains("full");
      const top = full ? raw.top : Math.max(raw.top, clip.top);
      const foot = full ? raw.bottom : Math.min(raw.bottom, clip.bottom);
      const box = {
        left: raw.left,
        width: raw.width,
        top,
        bottom: foot,
        height: foot - top,
      };
      if (box.height < 8 || box.width < 8) {
        continue;
      }

      if (card.spinning) {
        card.yaw += 0.006;
      }
      card.model.rotation.set(0, card.yaw, 0);

      // The camera swings round the model rather than the model tilting, so
      // the shadow stays under it and the thing never looks like it is falling
      // over.
      const size = card.entry.size;
      const distance = size * 1.5;
      card.camera.position.set(
        0,
        Math.sin(card.pitch) * distance,
        Math.cos(card.pitch) * distance,
      );
      card.camera.lookAt(0, size * 0.22, 0);
      // The field of view is vertical, so a tall card sees less across than a
      // wide one — and a car is a wide thing. Widening the lens as the card
      // narrows keeps the whole model in frame whatever shape it is in, the
      // same trick the game's own camera uses for a phone held upright.
      const aspect = box.width / box.height;
      card.camera.aspect = aspect;
      card.camera.fov = aspect < 1 ? CARD_FOV / aspect : CARD_FOV;
      card.camera.updateProjectionMatrix();

      const bottom = height - box.bottom;
      this.renderer.setViewport(box.left, bottom, box.width, box.height);
      this.renderer.setScissor(box.left, bottom, box.width, box.height);
      this.renderer.render(card.scene, card.camera);
    }
  };
}
