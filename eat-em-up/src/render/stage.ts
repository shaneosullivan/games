import * as THREE from "three";
import {CAMERA, WORLD} from "../config";

/**
 * The renderer, the scene and the camera — everything that is about drawing
 * rather than about the game.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    // Capped at 2: a modern iPad reports 3, which triples the pixels drawn for
    // a difference nobody can see on a toon-shaded scene.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(WORLD.skyColour);
    this.scene.fog = new THREE.Fog(
      WORLD.skyColour,
      WORLD.fogNear,
      WORLD.fogFar,
    );

    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      1,
      CAMERA.near,
      CAMERA.far,
    );

    // Sky bounce from above, warm ground bounce from below, so the underside
    // of the caterpillar never goes to flat black.
    const sky = new THREE.HemisphereLight(0xeaf6ff, 0x8fb26a, 1.35);
    this.scene.add(sky);

    const sun = new THREE.DirectionalLight(0xfff6e2, 1.45);
    sun.position.set(14, 26, 10);
    this.scene.add(sun);

    // A second, dimmer light from the opposite side. Without it the shaded
    // half of every trunk is the same flat band and the forest looks pasted on.
    const fill = new THREE.DirectionalLight(0xbcd8ff, 0.35);
    fill.position.set(-12, 8, -14);
    this.scene.add(fill);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
