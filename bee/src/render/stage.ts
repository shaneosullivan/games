import * as THREE from "three";
import {CAMERA, PALETTE, RENDER} from "../config";

/** Everything that changes when the player moves between the meadow and the hive. */
export interface EnvironmentSettings {
  background: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** Where the sun sits relative to the bee. */
  sunOffset: readonly [number, number, number];
}

export const MEADOW_ENV: EnvironmentSettings = {
  background: PALETTE.sky,
  fogColor: PALETTE.fog,
  fogNear: RENDER.fogNear,
  fogFar: RENDER.fogFar,
  hemiSky: 0xdff3ff,
  hemiGround: 0x6b9c58,
  hemiIntensity: 1.15,
  sunColor: 0xfff4d6,
  sunIntensity: 1.5,
  sunOffset: [18, 26, 12],
};

/** Warm, close and gloomy: lit by honey rather than sky. */
export const HIVE_ENV: EnvironmentSettings = {
  background: 0x2e1a08,
  fogColor: 0x4a2c10,
  fogNear: 22,
  fogFar: 78,
  hemiSky: 0xffca7a,
  hemiGround: 0x6b3f10,
  hemiIntensity: 1.0,
  sunColor: 0xffd79a,
  sunIntensity: 0.85,
  sunOffset: [4, 20, 6],
};

/** A warmer, later-in-the-day version of the meadow light. */
export const COTTAGE_ENV: EnvironmentSettings = {
  background: 0xbfe0e8,
  fogColor: 0xe3ddc8,
  // The clearing and the hive are 168 units apart and both have to be legible
  // from the other end, so this fog is much longer-throw than the meadow's:
  // it only starts past the length of the lane, and thins out well beyond it.
  fogNear: 170,
  fogFar: 420,
  hemiSky: 0xffeccf,
  hemiGround: 0x7a9c5a,
  hemiIntensity: 1.1,
  sunColor: 0xffe6bb,
  sunIntensity: 1.45,
  sunOffset: [14, 24, 16],
};

/** Indoors at the cottage: lamplit, close, no sky. */
export const INSIDE_ENV: EnvironmentSettings = {
  background: 0x2b1d12,
  fogColor: 0x3d2a19,
  fogNear: 20,
  fogFar: 60,
  hemiSky: 0xffdcae,
  hemiGround: 0x6b4a2a,
  hemiIntensity: 0.95,
  sunColor: 0xffe3bb,
  sunIntensity: 0.5,
  sunOffset: [3, 14, 5],
};

/**
 * The Windy Woods: an autumn wood, overcast and close.
 *
 * The fog is deliberately short — you should not be able to see across the
 * maze from inside it, or the walls stop being a maze. The survey shot escapes
 * it by looking down from above, and the scent motes opt out of fog entirely.
 */
export const WOODS_ENV: EnvironmentSettings = {
  background: 0xb9c4a0,
  fogColor: 0xb3bd9a,
  fogNear: 16,
  fogFar: 62,
  hemiSky: 0xf2ecd0,
  hemiGround: 0x8a9660,
  hemiIntensity: 1.3,
  sunColor: 0xffeccb,
  sunIntensity: 0.95,
  sunOffset: [8, 18, 6],
};

/**
 * The Bear's Lair: underground, lit by whatever gets in at the mouth.
 *
 * Dim, but not dark — the level is played against silhouettes, and a cave lit
 * the way a real one is would leave a child guessing where the rocks are. The
 * fog is long because the shot looks *along* the cave and the next few gates
 * have to be readable from the far side of the screen.
 */
export const LAIR_ENV: EnvironmentSettings = {
  background: 0x322b40,
  fogColor: 0x3a3348,
  fogNear: 70,
  fogFar: 240,
  hemiSky: 0xdfe4ff,
  hemiGround: 0x6f6884,
  hemiIntensity: 1.7,
  sunColor: 0xfff0d8,
  sunIntensity: 1.15,
  sunOffset: [6, 20, 26],
};

/**
 * The Silent Islands: open water under an open sky.
 *
 * The brightest environment in the game, on purpose — it is played from
 * directly above, where fog and gloom would only make the board harder to
 * read, and the danger is all in what is on the water rather than in the light.
 */
export const ISLANDS_ENV: EnvironmentSettings = {
  background: 0x8fd6ef,
  fogColor: 0xbde8f4,
  fogNear: 70,
  fogFar: 210,
  hemiSky: 0xffffff,
  hemiGround: 0x7fb2c9,
  hemiIntensity: 1.5,
  sunColor: 0xfff6de,
  sunIntensity: 1.05,
  sunOffset: [10, 26, 10],
};

/**
 * The Mouldy Mountain: thin blue air, and haze in the distance.
 *
 * The fog is pushed a long way out because the level looks up a slope fifteen
 * hundred units long and the summit has to be a thing on the horizon rather
 * than a thing that appears.
 */
export const MOUNTAIN_ENV: EnvironmentSettings = {
  background: 0x8ec9ee,
  fogColor: 0xbfe0f2,
  fogNear: 90,
  fogFar: 420,
  hemiSky: 0xffffff,
  hemiGround: 0xb9c79a,
  hemiIntensity: 1.9,
  sunColor: 0xfff4dc,
  sunIntensity: 1.25,
  // Behind the camera and high, so the slope faces the light rather than
  // being lit edge-on: tilted ground caught almost none of the first sun.
  sunOffset: [18, 36, 40],
};

export interface Stage {
  renderer: THREE.WebGLRenderer;
  /** The element that is drawn into — which is not always the whole window. */
  canvas: HTMLCanvasElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  /** Offset the sun keeps from the bee; environment-dependent. */
  sunOffset: THREE.Vector3;
  setEnvironment(env: EnvironmentSettings): void;
  /**
   * Push the current environment's fog out by a multiple of itself. 1 is the
   * environment as authored; `setEnvironment` resets it. For a shot that has to
   * see much further than the level normally does.
   */
  setFogScale(scale: number): void;
  /**
   * How far the camera can see, in units, or null for the game's own setting.
   *
   * Every level but one is played from twenty or thirty units away and shares
   * a far plane of four hundred. The descent's camera stands back by a
   * multiple of the ball, which by the bottom is five hundred — and a ball
   * beyond the far plane is not drawn at all, which looks exactly like a bug
   * in the level rather than a lens that cannot see it.
   */
  setViewDistance(far: number | null): void;
  /** Dim the page behind a card, so the strip iOS keeps matches the scrim. */
  setPageDim(on: boolean): void;
  resize(): void;
  dispose(): void;
}

export function createStage(host: HTMLElement): Stage {
  const canvas = document.createElement("canvas");
  canvas.className = "game-canvas";
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    stencil: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  const fog = new THREE.Fog(PALETTE.fog, RENDER.fogNear, RENDER.fogFar);
  scene.fog = fog;

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    1,
    CAMERA.near,
    CAMERA.far,
  );
  camera.position.set(0, 6, 10);

  const hemi = new THREE.HemisphereLight(0xdff3ff, 0x6b9c58, 1.15);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
  sun.position.set(18, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
  // Tight frustum that follows the bee — a world-sized one would be mush at 1024px.
  const cam = sun.shadow.camera;
  cam.left = -22;
  cam.right = 22;
  cam.top = 22;
  cam.bottom = -22;
  cam.near = 1;
  cam.far = 90;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.035;
  scene.add(sun);
  scene.add(sun.target);

  function resize(): void {
    // Measure the canvas, not the window: level 4's puzzle takes the right-hand
    // side of the screen with CSS, and the renderer has to follow it.
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width) || window.innerWidth);
    const h = Math.max(1, Math.round(rect.height) || window.innerHeight);
    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, RENDER.maxPixelRatio),
    );
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 120));
  window.visualViewport?.addEventListener("resize", resize);

  const sunOffset = new THREE.Vector3(...MEADOW_ENV.sunOffset);

  /**
   * The page colour, which is what iOS paints the strip of an installed app it
   * won't give us — the 20pt under the home indicator. It can't be drawn into,
   * so the next best thing is for it to be the same colour as whatever is
   * directly above it: the sky, or the scrim when a card is over the sky.
   *
   * It goes on the *root* element, not the body. When `html` has a background
   * of its own that's the one that becomes the page canvas, and a background on
   * `body` only paints the body's own box — which is why setting it there did
   * nothing at all.
   */
  const pageBase = new THREE.Color(PALETTE.sky);
  /** The bottom stop of the overlay scrim in ui/styles.css. */
  const SCRIM = new THREE.Color(0x14283c);
  const SCRIM_ALPHA = 0.75;
  let pageDim = false;

  function paintPage(): void {
    const colour = pageBase.clone();
    if (pageDim) {
      colour.lerp(SCRIM, SCRIM_ALPHA);
    }
    const hex = `#${colour.getHexString()}`;
    // Both, deliberately. The page canvas comes from the root element when it
    // has a background of its own and from the body when it doesn't, and it
    // costs nothing to stop caring which rule applies.
    document.documentElement.style.backgroundColor = hex;
    document.body.style.backgroundColor = hex;
  }

  function setPageDim(on: boolean): void {
    if (on === pageDim) {
      return;
    }
    pageDim = on;
    paintPage();
  }

  /** The fog the current environment asked for, before any scaling. */
  const fogBase = {near: 0, far: 0};

  function setFogScale(scale: number): void {
    fog.near = fogBase.near * scale;
    fog.far = fogBase.far * scale;
  }

  function setEnvironment(env: EnvironmentSettings): void {
    (scene.background as THREE.Color).set(env.background);
    pageBase.set(env.background);
    paintPage();
    fog.color.set(env.fogColor);
    fogBase.near = env.fogNear;
    fogBase.far = env.fogFar;
    setFogScale(1);
    hemi.color.set(env.hemiSky);
    hemi.groundColor.set(env.hemiGround);
    hemi.intensity = env.hemiIntensity;
    sun.color.set(env.sunColor);
    sun.intensity = env.sunIntensity;
    sunOffset.set(...env.sunOffset);
  }

  function setViewDistance(far: number | null): void {
    camera.far = far ?? CAMERA.far;
    camera.updateProjectionMatrix();
  }

  return {
    renderer,
    canvas,
    setViewDistance,
    scene,
    camera,
    sun,
    sunOffset,
    setEnvironment,
    setFogScale,
    setPageDim,
    resize,
    dispose() {
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
