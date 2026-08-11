import * as THREE from 'three';
import { CAMERA, PALETTE, RENDER } from '../config';

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

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  /** Offset the sun keeps from the bee; environment-dependent. */
  sunOffset: THREE.Vector3;
  setEnvironment(env: EnvironmentSettings): void;
  resize(): void;
  dispose(): void;
}

export function createStage(host: HTMLElement): Stage {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
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

  const camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
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
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));
  window.visualViewport?.addEventListener('resize', resize);

  const sunOffset = new THREE.Vector3(...MEADOW_ENV.sunOffset);

  function setEnvironment(env: EnvironmentSettings): void {
    (scene.background as THREE.Color).set(env.background);
    fog.color.set(env.fogColor);
    fog.near = env.fogNear;
    fog.far = env.fogFar;
    hemi.color.set(env.hemiSky);
    hemi.groundColor.set(env.hemiGround);
    hemi.intensity = env.hemiIntensity;
    sun.color.set(env.sunColor);
    sun.intensity = env.sunIntensity;
    sunOffset.set(...env.sunOffset);
  }

  return {
    renderer,
    scene,
    camera,
    sun,
    sunOffset,
    setEnvironment,
    resize,
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
  };
}
