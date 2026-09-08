import * as THREE from "three";
import {EffectComposer} from "three/examples/jsm/postprocessing/EffectComposer.js";
import {RenderPass} from "three/examples/jsm/postprocessing/RenderPass.js";
import {UnrealBloomPass} from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import {OutputPass} from "three/examples/jsm/postprocessing/OutputPass.js";
import {RoomEnvironment} from "three/examples/jsm/environments/RoomEnvironment.js";
import {CAMERA, FILM, LIGHT, Palette, Tier} from "../config";
import {onQualityChange, tier} from "../core/quality";
import {material, setEnvironment} from "./materials";
import {paint} from "./sprites";

/**
 * The sky, as a two-stop gradient wrapped round the world.
 *
 * Drawn as an equirectangular background rather than a plain colour, which is
 * what puts the join exactly on the horizon however the camera is pointed —
 * a screen-space gradient would slide about as the shot moved.
 *
 * Painted rather than loaded. Three colours and a canvas sixty-four pixels
 * tall is a sky; an image file would be a hundred kilobytes in a game that
 * ships as one html file.
 */
function skyOf(palette: Palette): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 64;
  const g = canvas.getContext("2d");
  if (!g) {
    throw new Error("no 2d canvas");
  }
  const hex = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, hex(palette.sky));
  // The haze sits just above the join, which is where the air is thickest and
  // where every real horizon goes pale.
  grad.addColorStop(0.46, hex(palette.haze));
  grad.addColorStop(0.5, hex(palette.ground));
  grad.addColorStop(1, hex(palette.ground));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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
  private readonly sky: THREE.Texture;

  constructor(host: HTMLElement, palette: Palette) {
    this.renderer = new THREE.WebGLRenderer({antialias: true});
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = FILM.exposure;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);

    const ground = new THREE.Color(palette.ground);
    // A real sky, and it earns its place at exactly one moment: the shot on
    // the grid before a race, which is low enough to see the horizon. The
    // racing camera looks down at forty-five degrees and never does — the
    // background was the ground colour for that reason and looked like a green
    // wall the first time anything looked up.
    this.sky = skyOf(palette);
    this.scene.background = this.sky;
    // Fog in the haze colour rather than the ground's, so the far end of the
    // road runs out where the sky begins instead of stopping short of it.
    this.scene.fog = new THREE.Fog(
      new THREE.Color(palette.haze),
      CAMERA.fogFrom,
      CAMERA.fogTo,
    );
    void ground;

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

    this.applyQuality(tier());
    onQualityChange(this.applyQuality);
    this.resize();
    window.addEventListener("resize", this.resize);
  }

  /**
   * Spends what the machine can afford.
   *
   * Everything here can be changed while a race is running, which is the whole
   * point: when the game decides an iPad cannot keep up, the next frame is
   * cheaper. The one thing that cannot is how much scenery was built, so that
   * is read at construction and takes effect on the next race.
   */
  applyQuality = (at: Tier): void => {
    // The device ratio is still the ceiling — asking for two on a screen that
    // only has one would draw four times the pixels for nothing.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, at.pixels));
    this.bloom.enabled = at.bloom;

    if (this.renderer.shadowMap.enabled !== at.shadows) {
      this.renderer.shadowMap.enabled = at.shadows;
      // Turning shadows on or off changes what every shader in the scene has
      // to compile, and three will not notice on its own.
      this.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        if (mesh.material) {
          for (const m of [mesh.material].flat()) {
            m.needsUpdate = true;
          }
        }
      });
    }
    this.sun.castShadow = at.shadows;
    if (this.sun.shadow.mapSize.width !== at.shadowMap) {
      this.sun.shadow.mapSize.set(at.shadowMap, at.shadowMap);
      // The map is allocated at its old size and has to go before a new one is
      // made; three rebuilds it on the next frame that needs it.
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  };

  /**
   * Aims the shot at a point on the ground.
   *
   * The offset is fixed, so pointing it is moving it. The shadow camera is
   * dragged along too — it only covers a few hundred units, which is what
   * keeps its map sharp, so it has to travel with the car.
   */
  watch(x: number, z: number): void {
    this.place(x, CAMERA.up, z + CAMERA.back, x, 0, z);
  }

  /**
   * The shot, said in full: where the camera is and what it is looking at.
   *
   * `watch` is this with the racing offset already worked out. The start of a
   * race needs something else entirely — down at grid height, in front of the
   * cars, looking back at them — so the general form exists as well.
   */
  place(
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    atX: number,
    atY: number,
    atZ: number,
  ): void {
    this.camera.position.set(eyeX, eyeY, eyeZ);
    this.camera.lookAt(atX, atY, atZ);
    const x = atX;
    const z = atZ;
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
    this.sky.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
