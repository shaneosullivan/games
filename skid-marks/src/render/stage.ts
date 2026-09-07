import * as THREE from "three";
import {CAMERA, WORLD} from "../config";

/**
 * The renderer, the scene and the camera.
 *
 * An **orthographic** camera looking straight down, which is the single
 * decision that makes this a 2D game. The plan asks for the Amiga one by name
 * and points at pictures of it: no perspective, no lighting, flat colours,
 * everything seen from directly above. So there are no lights in this scene at
 * all — every material in the game is unlit — and nothing is ever nearer to
 * the camera than anything else in a way you could see.
 *
 * Layers are done with tiny height offsets and renderOrder instead, which is
 * how a 2D game stacks things: grass, then tarmac, then paint, then the marks,
 * then the cars.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    // Capped at 2: a modern iPad reports 3, which triples the pixels drawn for
    // a difference nobody can see on flat colour.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(WORLD.grass);

    // The frustum is set in resize(), which knows the aspect. Near and far are
    // generous because everything lives within a few units of y = 0 and there
    // is no depth to run out of.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.camera.position.set(0, 200, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Keeps CAMERA.view units visible across the *short* side of the screen.
   *
   * Across the short side and not the long one, so a phone held upright and an
   * iPad held sideways show the same amount of road ahead. Tying it to the
   * width would mean a tall screen saw a strip of track and a wide one saw the
   * whole circuit.
   */
  resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const short = Math.min(w, h);
    const halfX = (CAMERA.view * (w / short)) / 2;
    const halfZ = (CAMERA.view * (h / short)) / 2;
    this.camera.left = -halfX;
    this.camera.right = halfX;
    this.camera.top = halfZ;
    this.camera.bottom = -halfZ;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
