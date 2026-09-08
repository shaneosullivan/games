import * as THREE from "three";
import {CAMERA, LIGHT, Palette} from "../config";

/**
 * The renderer, the scene, the camera and the light.
 *
 * A **perspective** camera at a fixed diagonal — behind the car, above it,
 * tipped down about fifty degrees. It moves with the car and it never turns.
 * That last part is load-bearing: the controls are "push the way you want to
 * go", which only means anything while the picture holds still, so the camera
 * is allowed to follow and not to swing. Screen-up is world −Z at every moment
 * of the game, exactly as it was when the shot looked straight down.
 *
 * There is no floor mesh. The ground is the scene's background colour, which
 * costs nothing and cannot run out from under the camera — and at this angle
 * the top of the frame still lands short of the horizon, so the background is
 * only ever seen as ground.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(host: HTMLElement, palette: Palette) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    // Capped at 2: a modern iPad reports 3, which triples the pixels drawn for
    // a difference nobody can see on flat colour.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    const ground = new THREE.Color(palette.ground);
    this.scene.background = ground;
    // Fog in the ground's own colour, so the far end of the road goes away
    // instead of stopping. It is also what hides the edge of a world that does
    // not have one.
    this.scene.fog = new THREE.Fog(ground, CAMERA.fogFrom, CAMERA.fogTo);

    // Times pi, and that is not a fudge. Three's lights are in physical units:
    // the Lambert response divides the incoming light by pi, so an intensity
    // of 1 lands at about a third of the material's own colour and full
    // brightness is pi. The config says what fraction of full each light is,
    // which is the useful way to think about it, and the conversion lives here
    // where it can be explained once.
    const full = Math.PI;
    this.scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient * full));
    const sun = new THREE.DirectionalLight(0xffffff, LIGHT.sun * full);
    sun.position.set(LIGHT.from.x, LIGHT.from.y, LIGHT.from.z);
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, LIGHT.fill * full);
    fill.position.set(LIGHT.fillFrom.x, LIGHT.fillFrom.y, LIGHT.fillFrom.z);
    this.scene.add(fill);

    // Far enough to reach the back of the fog and no further.
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, CAMERA.fogTo);
    this.camera.position.set(0, CAMERA.up, CAMERA.back);
    this.camera.lookAt(0, 0, 0);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Aims the shot at a point on the ground.
   *
   * The offset is fixed, so pointing it is moving it: the camera sits at the
   * same place relative to whatever it is watching, always, and the rotation
   * is worked out once here and then never touched again.
   */
  watch(x: number, z: number): void {
    this.camera.position.set(x, CAMERA.up, z + CAMERA.back);
    this.camera.lookAt(x, 0, z);
  }

  /**
   * The lens, for the shape of the screen.
   *
   * The field of view is vertical, so a wide screen shows more of the world
   * and a tall one shows less — which is backwards for a phone held upright.
   * Widening the lens as the screen narrows keeps roughly the same amount of
   * *road* in frame whichever way the thing is held.
   */
  resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? CAMERA.fov / aspect : CAMERA.fov;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  /** Gives the canvas and its GL context back. A child can start half a dozen
   *  races and open the builder between each of them, and a browser will only
   *  hand out so many contexts before it starts silently dropping the oldest. */
  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
