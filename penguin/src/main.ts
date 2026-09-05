import * as THREE from "three";

// Penguin — a starter scene.
//
// A red ball on a green field: move it with your finger, the arrow keys or
// WASD, and jump with the space bar. It is here only so a fresh project runs
// and shows something — replace all of it with the real game.

const app = document.getElementById("app");
if (!app) {
  throw new Error("missing #app element");
}

const renderer = new THREE.WebGLRenderer({antialias: true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd7f0);

const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x557755, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(6, 12, 4);
scene.add(sun);

// The flat green field.
const FIELD = 40;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(FIELD, FIELD),
  new THREE.MeshStandardMaterial({color: 0x4f9e4f}),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// The red circle you move about.
const RADIUS = 0.9;
const player = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS, 28, 18),
  new THREE.MeshStandardMaterial({color: 0xe0403a}),
);
player.position.y = RADIUS;
scene.add(player);

// ---- input ----------------------------------------------------------------

const held = new Set<string>();
window.addEventListener("keydown", event => {
  if (event.key === " ") {
    event.preventDefault();
    jump();
    return;
  }
  held.add(event.key.toLowerCase());
});
window.addEventListener("keyup", event => {
  held.delete(event.key.toLowerCase());
});

// Finger / mouse: while a pointer is held down the ball heads for the point on
// the field beneath it — a ray from the camera met with the ground plane.
const ndc = new THREE.Vector2();
const ray = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const target = new THREE.Vector3();
let steering = false;

function readPointer(event: PointerEvent): void {
  ndc.x = (event.clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(event.clientY / window.innerHeight) * 2 + 1;
}
renderer.domElement.addEventListener("pointerdown", event => {
  steering = true;
  readPointer(event);
});
window.addEventListener("pointermove", event => {
  if (steering) {
    readPointer(event);
  }
});
window.addEventListener("pointerup", () => {
  steering = false;
});

// ---- movement -------------------------------------------------------------

const SPEED = 10; // units a second across the field
const GRAVITY = 30;
const JUMP = 11;
let vy = 0;

function grounded(): boolean {
  return player.position.y <= RADIUS + 1e-3;
}

function jump(): void {
  if (grounded()) {
    vy = JUMP;
  }
}

const move = new THREE.Vector3();

function fromKeys(): void {
  move.set(0, 0, 0);
  if (held.has("arrowup") || held.has("w")) {
    move.z -= 1;
  }
  if (held.has("arrowdown") || held.has("s")) {
    move.z += 1;
  }
  if (held.has("arrowleft") || held.has("a")) {
    move.x -= 1;
  }
  if (held.has("arrowright") || held.has("d")) {
    move.x += 1;
  }
}

function fromPointer(): void {
  ray.setFromCamera(ndc, camera);
  if (ray.ray.intersectPlane(groundPlane, target)) {
    move.set(target.x - player.position.x, 0, target.z - player.position.z);
    // A dead zone, so the ball settles on the spot rather than jittering.
    if (move.length() < 0.25) {
      move.set(0, 0, 0);
    }
  }
}

function step(dt: number): void {
  fromKeys();
  if (steering && move.lengthSq() === 0) {
    fromPointer();
  }
  if (move.lengthSq() > 0) {
    move.normalize();
    player.position.x += move.x * SPEED * dt;
    player.position.z += move.z * SPEED * dt;
  }
  // Keep it on the field.
  const edge = FIELD / 2 - RADIUS;
  player.position.x = THREE.MathUtils.clamp(player.position.x, -edge, edge);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -edge, edge);

  // Jump and fall.
  vy -= GRAVITY * dt;
  player.position.y += vy * dt;
  if (player.position.y < RADIUS) {
    player.position.y = RADIUS;
    vy = 0;
  }
}

// ---- camera + loop --------------------------------------------------------

const offset = new THREE.Vector3(0, 12, 16);
const eye = new THREE.Vector3();

function frame(dt: number): void {
  step(dt);
  eye.copy(player.position).add(offset);
  camera.position.lerp(eye, Math.min(1, dt * 4));
  camera.lookAt(player.position.x, player.position.y, player.position.z);
  renderer.render(scene, camera);
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

let last = performance.now();
function tick(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
