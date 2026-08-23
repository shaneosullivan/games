import * as THREE from "three";
import {CAMERA, WORLD} from "../config";

/**
 * The renderer, the camera and the light — everything the game draws into.
 *
 * Same shape as the other games here: one perspective camera, a hemisphere
 * light for the ambient and one directional sun, and fog that hides where the
 * valley stops. The fog matters more in this game than in the others, because
 * you are looking down the length of a valley rather than across a clearing.
 */
export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(WORLD.skyColour);
    this.scene.fog = new THREE.Fog(
      WORLD.skyColour,
      WORLD.fogNear,
      WORLD.fogFar,
    );

    // Far plane out past the fog: anything beyond it is already sky-coloured,
    // but clipping it would show as a hard edge on the furthest peaks. It has
    // to be past WORLD.fogFar and was not — at 1400 against a fog that reaches
    // 1700 the valley was being cut off while still visible.
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.4, 1900);

    // Bright from above and cool from below, which is what a valley under an
    // open sky actually looks like.
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x6b7a63, 1.15));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.35);
    sun.position.set(-40, 90, 30);
    this.scene.add(sun);

    this.resize();
    window.addEventListener("resize", () => this.resize());
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
