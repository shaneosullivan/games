import * as THREE from "three";
import {CAMERA, SHADOW, WORLD} from "../config";

/**
 * The renderer, the scene and the camera — everything that is about drawing
 * rather than about the game.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly sun: THREE.DirectionalLight;

  constructor(host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    // Capped at 2: a modern iPad reports 3, which triples the pixels drawn for
    // a difference nobody can see on a toon-shaded scene.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

    // Green from below as well as sky from above: in a wood most of the light
    // on the underside of anything has come off the leaves, and that bounce is
    // why a forest floor is never black.
    this.scene.add(new THREE.HemisphereLight(0xe8f6df, 0x6b8f52, 1.2));

    // Low and warm, like an evening sun through the trunks.
    this.sun = new THREE.DirectionalLight(0xffeec4, 1.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(SHADOW.mapSize, SHADOW.mapSize);
    this.sun.shadow.bias = SHADOW.bias;
    this.sun.shadow.normalBias = SHADOW.normalBias;
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -SHADOW.extent;
    shadowCamera.right = SHADOW.extent;
    shadowCamera.top = SHADOW.extent;
    shadowCamera.bottom = -SHADOW.extent;
    shadowCamera.near = SHADOW.near;
    shadowCamera.far = SHADOW.far;
    shadowCamera.updateProjectionMatrix();
    this.scene.add(this.sun);
    // A directional light aims at its target's position, and the default
    // target sits at the origin — which is the start of the run. Without this
    // the sun would swing round as the hare went down the wood.
    this.scene.add(this.sun.target);

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Moves the shadow box along with the hare.
   *
   * One fixed box over a hundred and forty metres of wood would put a shadow
   * texel at seven centimetres and turn every edge into a staircase; this one
   * covers SHADOW.extent around whatever it is given and travels with it. The
   * light keeps its direction — only where it is aimed changes.
   */
  followSun(at: THREE.Vector3): void {
    this.sun.target.position.copy(at);
    this.sun.position.set(at.x + 90, at.y + 150, at.z + 120);
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
