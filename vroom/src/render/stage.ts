import * as THREE from "three";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {CAMERA, FILM, LIGHT, Palette} from "../config";
import {material, setEnvironment} from "./materials";
import {paint} from "./sprites";

/**
 * The renderer, the scene, the camera, the light and the film.
 *
 * A **perspective** camera at a fixed forty-five degrees — behind the car,
 * above it, looking down. It moves with the car and it never turns. That last
 * part is load-bearing: the controls are "push the way you want to go", which
 * only means anything while the picture holds still, so the camera is allowed
 * to follow and not to swing. Screen-up is world −Z at every moment.
 *
 * Everything is physically based. There is an environment map so metal has
 * something to reflect, a sun that casts real shadows, and the whole picture
 * goes through a film pipeline on the way out: bloom for anything emitting
 * more light than a screen can show, then an ACES tone curve. Those two are
 * most of the difference between a scene and a shot.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly sun: THREE.DirectionalLight;
  private readonly environment: THREE.Texture;
  private readonly ground: THREE.Mesh;

  constructor(host: HTMLElement, palette: Palette) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    // Capped at 2: a modern iPad reports 3, which triples the pixels drawn for
    // a difference nobody can see.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = FILM.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    const ground = new THREE.Color(palette.ground);
    this.scene.background = ground;
    this.scene.fog = new THREE.Fog(ground, CAMERA.fogFrom, CAMERA.fogTo);

    // Something for the metal to reflect. Generated rather than loaded — a
    // self-contained html file has no room for an HDR, and a room is a
    // perfectly good sky as far as a wing mirror is concerned.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.environment;
    this.scene.environmentIntensity = FILM.envIntensity;
    setEnvironment(this.environment, FILM.envIntensity);
    pmrem.dispose();

    this.scene.add(new THREE.AmbientLight(0xffffff, LIGHT.ambient * Math.PI));

    this.sun = new THREE.DirectionalLight(0xffffff, LIGHT.sun * Math.PI);
    this.sun.position.set(LIGHT.from.x, LIGHT.from.y, LIGHT.from.z);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(FILM.shadow, FILM.shadow);
    const reach = FILM.shadowReach;
    this.sun.shadow.camera.left = -reach;
    this.sun.shadow.camera.right = reach;
    this.sun.shadow.camera.top = reach;
    this.sun.shadow.camera.bottom = -reach;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = reach * 4;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    const fill = new THREE.DirectionalLight(0xffffff, LIGHT.fill * Math.PI);
    fill.position.set(LIGHT.fillFrom.x, LIGHT.fillFrom.y, LIGHT.fillFrom.z);
    this.scene.add(fill);

    // Real ground, not just a background colour.
    //
    // It was a background for a long time and that was the right call while
    // nothing was lit: a colour behind everything costs nothing and cannot run
    // out from under the camera. It cannot take a shadow, though, and a car
    // that casts one onto the road and not onto the grass beside it is a car
    // that is obviously pasted on. So there is a floor now, big enough to
    // reach past the fog, and it follows the camera.
    const floor = new THREE.PlaneGeometry(
      CAMERA.fogTo * 2.4,
      CAMERA.fogTo * 2.4,
    );
    floor.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      paint(floor, palette.ground),
      material("verge"),
    );
    this.ground.receiveShadow = true;
    this.ground.position.y = -0.02;
    this.scene.add(this.ground);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, 1, CAMERA.fogTo);
    this.camera.position.set(0, CAMERA.up, CAMERA.back);
    this.camera.lookAt(0, 0, 0);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      FILM.bloom,
      FILM.bloomRadius,
      FILM.bloomThreshold,
    );
    this.composer.addPass(this.bloom);
    // Last, and it is what applies the tone curve and the colour space. Without
    // it the composer hands back linear light and the picture comes out grey.
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Aims the shot at a point on the ground.
   *
   * The offset is fixed, so pointing it is moving it. The shadow camera is
   * dragged along too — it only covers a few hundred units, which is what
   * keeps its map sharp, so it has to travel with the car.
   */
  watch(x: number, z: number): void {
    this.camera.position.set(x, CAMERA.up, z + CAMERA.back);
    this.camera.lookAt(x, 0, z);
    this.sun.target.position.set(x, 0, z);
    this.ground.position.set(x, this.ground.position.y, z);
    this.sun.position.set(
      x + LIGHT.from.x * 200,
      LIGHT.from.y * 200,
      z + LIGHT.from.z * 200,
    );
  }

  /**
   * The lens, for the shape of the screen.
   *
   * The field of view is vertical, so a wide screen shows more of the world
   * and a tall one shows less — which is backwards for a phone held upright.
   * Widening the lens as the screen narrows keeps roughly the same amount of
   * road in frame whichever way the thing is held.
   */
  resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? CAMERA.fov / aspect : CAMERA.fov;
    this.camera.updateProjectionMatrix();
  };

  render(): void {
    this.composer.render();
  }

  /** Gives the canvas and its GL context back. A child can start half a dozen
   *  races and open the builder between each of them, and a browser will only
   *  hand out so many contexts before it starts silently dropping the oldest. */
  dispose(): void {
    window.removeEventListener("resize", this.resize);
    this.environment.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
