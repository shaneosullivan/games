import * as THREE from "three";
import {CAMERA, WATER} from "../config";

/**
 * The renderer, the camera and the light — everything the game draws into.
 *
 * Same shape as the other games here: one perspective camera, a hemisphere
 * light for the ambient and one directional sun. What is different is that
 * this scene is *inside* the fog rather than looking through it. The whole
 * mood of being underwater is the fog: how quickly it closes, and the fact
 * that its colour changes with how deep you are. Both are done here.
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  private readonly fog: THREE.Fog;
  private readonly shallow = new THREE.Color(WATER.shallowColour);
  private readonly deep = new THREE.Color(WATER.deepColour);
  private readonly water = new THREE.Color();

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.fog = new THREE.Fog(WATER.shallowColour, WATER.fogNear, WATER.fogFar);
    this.scene.fog = this.fog;
    this.scene.background = this.water;

    // Far plane past the fog. Anything beyond it is already water-coloured,
    // but clipping it inside the fog shows as a hard edge on the sea floor.
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.5, 2600);

    // Bright from above and dim from below, which is what the sea does: all
    // the light in it came in through the surface.
    this.scene.add(new THREE.HemisphereLight(0xd6fbff, 0x1c6a86, 1.25));
    const sun = new THREE.DirectionalLight(0xfff6d8, 1.3);
    // Almost straight down, and leaning slightly forward so the coral has a
    // shaded side to it rather than being lit flat on.
    sun.position.set(-14, 150, 26);
    this.scene.add(sun);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  /**
   * Tints the water for how deep the camera is.
   *
   * Green-blue near the surface, deep blue at the bottom. The sea floor and
   * the fog and the background are all one colour at any moment, so there is
   * never a horizon — the reef simply fades into water, which is what makes
   * the space read as an ocean and not as a room.
   */
  setDepth(depth: number): void {
    const t = Math.min(1, Math.max(0, depth / WATER.colourDepth));
    this.water.copy(this.shallow).lerp(this.deep, t);
    this.fog.color.copy(this.water);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
