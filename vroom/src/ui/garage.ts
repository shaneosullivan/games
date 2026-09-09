import * as THREE from "three";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {FILM, LIGHT, PLAYER} from "../config";
import {chooseColour, myColour} from "../core/garage";
import {car} from "../models/car";
import {setEnvironment} from "../render/materials";

/**
 * The garage: pick the colour of your car and watch it turn.
 *
 * A whole screen for one decision, and worth it. The car is on screen for
 * every second of every race and it is the thing a child thinks of as
 * themselves — "the red car" is only *your* car if you chose red.
 *
 * The car in here is the real model, lit the way the game lights it, so what
 * is chosen is what turns up on the grid.
 */
export class Garage {
  readonly root = document.createElement("div");

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly environment: THREE.Texture;
  private readonly stage = new THREE.Group();
  private readonly view = document.createElement("div");

  private model: THREE.Object3D | null = null;
  private colour = myColour();
  private turn = 0.7;
  private spinning = true;
  private frame = 0;

  constructor(private readonly onDone: () => void) {
    this.root.className = "screen garage";

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
    const bar = document.createElement("header");
    bar.className = "editor-bar";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "chip ghost";
    back.textContent = "◀ Tracks";
    back.addEventListener("click", () => this.onDone());
    const title = document.createElement("strong");
    title.className = "models-title";
    title.textContent = "Your car";
    bar.append(back, title);

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

    const says = document.createElement("p");
    says.className = "garage-says";
    says.textContent = "Pick a colour. This is the car you drive.";

    this.root.append(bar, this.view, swatches, says);
    this.markChosen();
    this.turnable();
  }

  private markChosen(): void {
    for (const dot of this.root.querySelectorAll<HTMLElement>(".swatch")) {
      dot.classList.toggle("on", Number(dot.dataset.colour) === this.colour);
    }
  }

  /** Rebuilds the car in the chosen colour. */
  private paint(): void {
    if (this.model) {
      this.stage.remove(this.model);
    }
    this.model = car(this.colour);
    this.stage.add(this.model);
  }

  /** Drag to turn it; let go and it goes back to turning itself. */
  private turnable(): void {
    let last: number | null = null;
    this.view.addEventListener("pointerdown", e => {
      this.view.setPointerCapture(e.pointerId);
      last = e.clientX;
      this.spinning = false;
    });
    this.view.addEventListener("pointermove", e => {
      if (last === null) {
        return;
      }
      this.turn -= (e.clientX - last) * 0.01;
      last = e.clientX;
    });
    const stop = (): void => {
      last = null;
    };
    this.view.addEventListener("pointerup", stop);
    this.view.addEventListener("pointercancel", stop);
  }

  private resize = (): void => {
    const box = this.view.getBoundingClientRect();
    if (box.width < 4 || box.height < 4) {
      return;
    }
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
