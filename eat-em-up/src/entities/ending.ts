import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {ENDING, WORLD} from "../config";
import {paint, vertexToon} from "../render/materials";
import {Caterpillar} from "./caterpillar";
import type {Bough, Climbable, Forest} from "./forest";

export type EndingPhase =
  "seek" | "curl" | "chrysalis" | "split" | "fly" | "free";

/**
 * The whole ending, which the plan makes the win condition: when you have
 * eaten enough you curl up, become a chrysalis, and fly off as a butterfly.
 *
 * The curl is not animated. The caterpillar is steered in a tightening circle
 * and its own body-follows-the-head machinery coils it, which looks far better
 * than a curl I could have keyframed.
 *
 * It does not end with the butterfly. Once it has climbed out and away, the
 * player gets the controls back and can fly the wood for as long as they like:
 * the game is won, and this is the reward.
 */
export class Ending {
  readonly group = new THREE.Group();

  phase: EndingPhase = "seek";
  /** Seconds spent in the current phase. */
  private elapsed = 0;
  private readonly centre = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private spin = 0;

  /** The pod, as two half shells so it can burst rather than simply vanish. */
  private readonly chrysalis = new THREE.Group();
  private readonly shells: Array<THREE.Mesh> = [];
  private burst = false;
  private readonly butterfly: THREE.Group;
  private readonly wings: Array<THREE.Group> = [];
  private wingPhase = 0;
  /** Which way the butterfly is flying, for the camera to sit behind. */
  heading = 0;
  private bob = 0;

  /** The tree and branch it has set off for, once it has picked one. */
  private target: {tree: Climbable; bough: Bough} | null = null;
  /** How long it has been on the errand, so it cannot go on for ever. */
  private seeking = 0;
  /** Set once it is out on the branch and ready to change. */
  private arrived = false;

  constructor(private readonly forest: Forest) {
    for (const side of [-1, 1]) {
      const shell = new THREE.Mesh(chrysalisHalf(side), vertexToon());
      this.chrysalis.add(shell);
      this.shells.push(shell);
    }
    this.chrysalis.visible = false;
    this.group.add(this.chrysalis);

    this.butterfly = new THREE.Group();
    this.butterfly.visible = false;
    const body = new THREE.Mesh(butterflyBody(), vertexToon());
    this.butterfly.add(body);
    for (const side of [-1, 1]) {
      // Each wing is its own group hinged at the body, so flapping is a
      // rotation of the hinge and never touches the butterfly's own transform.
      const hinge = new THREE.Group();
      hinge.add(new THREE.Mesh(wingGeometry(side), vertexToon()));
      this.butterfly.add(hinge);
      this.wings.push(hinge);
    }
    this.group.add(this.butterfly);
  }

  /** Where the butterfly is now, for the camera to watch. */
  get focus(): THREE.Vector3 {
    if (this.phase === "seek" || this.phase === "curl") {
      return this.centre;
    }
    return this.butterfly.visible
      ? this.butterfly.position
      : this.chrysalis.position;
  }

  /**
   * Drives the ending. Returns the direction the caterpillar should crawl in,
   * which is a zero vector once it has stopped crawling.
   */
  update(
    dt: number,
    cat: Caterpillar,
    fly?: THREE.Vector3,
    wantHeight?: number,
  ): THREE.Vector3 {
    this.elapsed += dt;
    this.dir.set(0, 0, 0);

    switch (this.phase) {
      case "seek":
        this.centre.copy(cat.position);
        this.seek(dt, cat);
        break;

      case "curl": {
        // A circle that tightens as it goes, so the body winds into a coil
        // rather than lapping the same ring.
        const t = Math.min(1, this.elapsed / ENDING.curl);
        // On a branch it simply stops and gathers itself. The spiral is for
        // the open floor: up here it would walk the caterpillar along the
        // branch and off the end of it before the chrysalis ever formed.
        if (this.forest.boughUnder(cat.position, cat.radius + 0.5)) {
          this.dir.set(0, 0, 0);
        } else {
          this.spin += dt * (2.6 + t * 5.5);
          const drive = 1 - t * 0.55;
          this.dir
            .set(Math.sin(this.spin), 0, Math.cos(this.spin))
            .multiplyScalar(drive);
        }
        this.centre.copy(cat.position);
        if (this.elapsed >= ENDING.curl) {
          this.enter("chrysalis");
          this.chrysalis.position.copy(cat.position);
          // Slung under the branch it is on, rather than sitting on top of it.
          const bough = this.forest.boughUnder(cat.position, cat.radius + 0.5);
          this.chrysalis.position.y = bough
            ? cat.position.y - cat.radius * 1.4
            : cat.position.y + cat.radius * 0.6;
          this.chrysalis.visible = true;
          this.chrysalis.scale.setScalar(0.001);
        }
        break;
      }

      case "chrysalis": {
        const t = Math.min(1, this.elapsed / ENDING.chrysalis);
        // Swells over the coiled caterpillar, which fades out underneath it.
        const grow = easeOut(Math.min(1, t * 1.8));
        this.chrysalis.scale.setScalar(grow * (cat.radius * 2.4));
        cat.group.visible = t < 0.55;
        if (this.elapsed >= ENDING.chrysalis) {
          this.enter("split");
        }
        break;
      }

      case "split": {
        const t = Math.min(1, this.elapsed / ENDING.split);
        if (t < ENDING.burstAt) {
          // A shiver that builds. A child reads the shake as "something is
          // about to happen", which is what earns the burst that follows.
          const shake = (t / ENDING.burstAt) ** 2 * 0.18;
          this.chrysalis.rotation.z = Math.sin(this.elapsed * 34) * shake;
        } else {
          if (!this.burst) {
            this.burst = true;
            this.chrysalis.rotation.z = 0;
            this.butterfly.visible = true;
            this.butterfly.position.copy(this.chrysalis.position);
          }
          const b = (t - ENDING.burstAt) / (1 - ENDING.burstAt);
          // The shell gives way: two halves thrown apart and down, shrinking
          // out of shot rather than lying about on the floor afterwards.
          this.shells.forEach((shell, i) => {
            const side = i === 0 ? -1 : 1;
            shell.position.x = side * b * ENDING.shellFly;
            shell.position.y = -b * b * ENDING.shellDrop;
            shell.rotation.z = side * -b * 1.6;
            shell.scale.setScalar(Math.max(0, 1 - b));
          });
          if (b >= 1) {
            this.chrysalis.visible = false;
          }
          // And the butterfly bursts out, overshooting its size before it
          // settles. The pop is what makes it burst rather than appear.
          this.butterfly.scale.setScalar(
            0.35 + easeOut(b) * 1.05 + Math.sin(b * Math.PI) * 0.3,
          );
        }
        if (this.elapsed >= ENDING.split) {
          this.enter("fly");
        }
        break;
      }

      case "free":
        this.freeFlight(dt, fly, wantHeight);
        break;

      case "fly": {
        const t = this.elapsed;
        // Rises on a widening spiral. The turn is what sells it as flight
        // rather than as a balloon let go.
        const angle = t * ENDING.spiralRate * Math.PI * 2;
        const r = ENDING.spiralRadius * Math.min(1, t / 1.5);
        this.butterfly.position.x =
          this.chrysalis.position.x + Math.cos(angle) * r;
        this.butterfly.position.z =
          this.chrysalis.position.z + Math.sin(angle) * r;
        this.butterfly.position.y += ENDING.riseSpeed * dt;
        // Banks into the turn, facing the way it is going. The body is built
        // nose along +Z, so a heading h is simply rotation.y = h — the same
        // convention the caterpillar's head uses.
        this.butterfly.rotation.y = -angle;
        this.butterfly.rotation.z = Math.sin(t * 1.4) * 0.18;
        this.heading = -angle;
        if (this.elapsed >= ENDING.flyAway) {
          this.enter("free");
        }
        break;
      }
    }

    if (this.butterfly.visible) {
      this.wingPhase += dt * ENDING.wingBeatHz * Math.PI * 2;
      const beat = Math.sin(this.wingPhase);
      this.wings[0].rotation.z = -beat * 0.9;
      this.wings[1].rotation.z = beat * 0.9;
    }

    return this.dir;
  }

  /**
   * Taking itself off to a branch to change on.
   *
   * Driven through the caterpillar's own controls rather than moved by hand —
   * it walks to a tree, takes hold of it, climbs, steps onto a branch and
   * edges out along it, using exactly the machinery the player uses. That way
   * it cannot end up somewhere the game's own rules say is impossible.
   */
  private seek(dt: number, cat: Caterpillar): void {
    this.seeking += dt;

    // On a branch already? Walk a little way out along it and settle.
    const bough = this.forest.boughUnder(cat.position, cat.radius + 0.5);
    if (bough && !cat.climbing) {
      const along =
        (cat.position.x - bough.base.x) * bough.dir.x +
        (cat.position.z - bough.base.z) * bough.dir.y;
      const want = Math.min(
        bough.length - 0.5,
        bough.startAlong + ENDING.seekOut,
      );
      if (this.arrived || along >= want) {
        this.arrived = true;
        this.enter("curl");
        return;
      }
      this.dir
        .set(bough.dir.x, 0, bough.dir.y)
        .multiplyScalar(ENDING.seekSpeed);
      return;
    }

    if (this.seeking > ENDING.seekGiveUp) {
      // Long enough. Change where it stands rather than never changing.
      this.enter("curl");
      return;
    }

    if (!this.target) {
      this.target = this.pickBranch(cat);
      if (!this.target) {
        this.enter("curl");
        return;
      }
    }
    const {tree, bough: aim} = this.target;

    if (cat.climbing) {
      // Climbing takes the stick in screen axes: x goes round the trunk, z up
      // and down it. Steer round to the branch's own bearing as it rises.
      const here = Math.atan2(cat.position.z - tree.z, cat.position.x - tree.x);
      const wanted = Math.atan2(aim.dir.y, aim.dir.x);
      let turn = wanted - here;
      while (turn > Math.PI) {
        turn -= Math.PI * 2;
      }
      while (turn < -Math.PI) {
        turn += Math.PI * 2;
      }
      // Line up under the branch first, then climb straight into it.
      //
      // Not both at once: steering round the trunk without climbing is what
      // the climb reads as circling, and circling deliberately refuses to take
      // a branch — so a caterpillar doing both hung there turning for ever.
      const foot = cat.position.y - cat.radius;
      const below = aim.base.y - 0.7;
      let around = 0;
      let climb = 1;
      if (Math.abs(turn) > 0.15) {
        around = THREE.MathUtils.clamp(turn * 1.5, -1, 1);
        // Hold station below the branch while it turns.
        climb = foot < below ? 1 : foot > below + 0.35 ? -1 : 0;
      }
      // Screen axes: up the screen is negative z.
      this.dir.set(around, 0, -climb);
      return;
    }

    // Still on the floor: walk at the tree until it takes hold of it.
    this.dir
      .set(tree.x - cat.position.x, 0, tree.z - cat.position.z)
      .setY(0)
      .normalize()
      .multiplyScalar(ENDING.seekSpeed);
  }

  /** The nearest tree with a branch it can actually get onto. */
  private pickBranch(cat: Caterpillar): {tree: Climbable; bough: Bough} | null {
    let best: {tree: Climbable; bough: Bough} | null = null;
    let bestDist = Infinity;
    for (const bough of this.forest.boughs) {
      const tree = bough.trunk;
      // Only branches whose base is within a climb, on a tree in the wood.
      if (!tree || bough.base.y > tree.climbTop) {
        continue;
      }
      const d = Math.hypot(tree.x - cat.position.x, tree.z - cat.position.z);
      if (d < bestDist) {
        best = {tree, bough};
        bestDist = d;
      }
    }
    return best;
  }

  /**
   * Flying the butterfly about, on the player's stick.
   *
   * Height is not steered. There is one stick on a tablet, and giving a child
   * an altitude control as well would be a second thing to learn at the very
   * moment the game has stopped asking anything of them. Instead it holds a
   * cruising height under the canopy and drifts gently, which cannot be flown
   * into anything.
   */
  private freeFlight(
    dt: number,
    fly?: THREE.Vector3,
    wantHeight?: number,
  ): void {
    const drive = fly ? Math.min(1, fly.length()) : 0;
    if (drive > 0.001 && fly) {
      const want = Math.atan2(fly.x, fly.z);
      let delta = want - this.heading;
      while (delta > Math.PI) {
        delta -= Math.PI * 2;
      }
      while (delta < -Math.PI) {
        delta += Math.PI * 2;
      }
      const step = ENDING.flyTurn * dt;
      const turn = THREE.MathUtils.clamp(delta, -step, step);
      this.heading += turn;
      this.butterfly.position.x +=
        Math.sin(this.heading) * ENDING.flySpeed * drive * dt;
      this.butterfly.position.z +=
        Math.cos(this.heading) * ENDING.flySpeed * drive * dt;
      // Rolled into the turn, by how hard it is turning.
      this.butterfly.rotation.z = THREE.MathUtils.lerp(
        this.butterfly.rotation.z,
        (-turn / Math.max(step, 1e-4)) * ENDING.flyBank,
        Math.min(1, dt * 4),
      );
    } else {
      this.butterfly.rotation.z = THREE.MathUtils.lerp(
        this.butterfly.rotation.z,
        0,
        Math.min(1, dt * 3),
      );
    }

    // Climb or dive toward the height the slider is asking for, at a fixed
    // rate rather than easing in — the bee game does the same, and it is what
    // makes holding the knob somewhere feel like flying there under your own
    // power rather than being placed.
    this.bob += dt * ENDING.flyBobRate;
    const target =
      (wantHeight ?? ENDING.cruiseHeight) + Math.sin(this.bob) * ENDING.flyBob;
    const gap = target - this.butterfly.position.y;
    const step = ENDING.climbSpeed * dt;
    this.butterfly.position.y += THREE.MathUtils.clamp(gap, -step, step);

    // Kept inside the wood, so it can't be flown off into blank fog.
    const r = Math.hypot(this.butterfly.position.x, this.butterfly.position.z);
    const edge = WORLD.radius - 2;
    if (r > edge) {
      this.butterfly.position.x = (this.butterfly.position.x / r) * edge;
      this.butterfly.position.z = (this.butterfly.position.z / r) * edge;
    }

    // Nose along +Z, so the heading is the rotation. It had a half turn added
    // to it, which flew the butterfly tail first.
    this.butterfly.rotation.y = this.heading;
    this.butterfly.scale.setScalar(1.4);
  }

  private enter(phase: EndingPhase): void {
    this.phase = phase;
    this.elapsed = 0;
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Half of the green-gold pod, split down the middle so the two halves can be
 * thrown apart when the butterfly comes out.
 *
 * Each half is a hemisphere shell rather than a solid: together the seam does
 * not show, and once they part you are meant to see that they are hollow.
 */
function chrysalisHalf(side: number): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const phiStart = side < 0 ? Math.PI / 2 : -Math.PI / 2;

  const pod = new THREE.SphereGeometry(0.5, 10, 10, phiStart, Math.PI);
  pod.scale(0.72, 1.15, 0.72);
  parts.push(paint(pod, 0x86b64a));

  // A gold band round the top, the way a monarch's chrysalis is marked.
  const band = new THREE.TorusGeometry(0.35, 0.045, 6, 10, Math.PI);
  band.rotateX(Math.PI / 2);
  band.rotateY(-phiStart);
  band.translate(0, 0.24, 0);
  parts.push(paint(band, 0xffd44a));

  // The stalk it hangs by belongs to one half only, so it isn't drawn twice.
  if (side > 0) {
    const tip = new THREE.ConeGeometry(0.12, 0.28, 7);
    tip.translate(0, -0.62, 0);
    parts.push(paint(tip, 0x6d9139));
  }

  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge chrysalis half");
  }
  return geo;
}

function butterflyBody(): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];
  const body = new THREE.SphereGeometry(0.16, 8, 7);
  body.scale(1, 1, 3.1);
  parts.push(paint(body, 0x3a2a22));

  const head = new THREE.SphereGeometry(0.15, 8, 7);
  head.translate(0, 0.03, 0.5);
  parts.push(paint(head, 0x2e211b));

  // A face, so it is plainly the same creature that was crawling about a
  // moment ago. The whites stand proud of the head; coplanar they would
  // flicker.
  for (const side of [-1, 1]) {
    const white = new THREE.SphereGeometry(0.085, 8, 7);
    white.translate(side * 0.07, 0.07, 0.575);
    parts.push(paint(white, 0xfdfdfd));

    const pupil = new THREE.SphereGeometry(0.042, 7, 6);
    pupil.translate(side * 0.075, 0.07, 0.64);
    parts.push(paint(pupil, 0x241a1a));
  }

  // And a smile: a half torus tipped forward, most of it buried in the head.
  const smile = new THREE.TorusGeometry(0.062, 0.017, 6, 12, Math.PI);
  smile.rotateZ(Math.PI);
  smile.rotateX(0.25);
  smile.translate(0, -0.025, 0.63);
  parts.push(paint(smile, 0xc4705a));

  for (const side of [-1, 1]) {
    const antenna = new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4);
    antenna.translate(0, 0.25, 0);
    antenna.rotateZ(side * -0.35);
    antenna.rotateX(-0.5);
    antenna.translate(side * 0.06, 0.12, 0.58);
    parts.push(paint(antenna, 0x2e211b));
  }

  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge butterfly body");
  }
  return geo;
}

/** Fore and hind wing for one side, hinged at the origin so it can flap. */
function wingGeometry(side: number): THREE.BufferGeometry {
  const parts: Array<THREE.BufferGeometry> = [];

  // Squashed spheres rather than flat discs: a disc is one-sided, and the
  // butterfly is watched from below for most of its climb.
  const fore = new THREE.SphereGeometry(0.62, 12, 9);
  fore.scale(1, 0.06, 0.86);
  fore.translate(0.62, 0, 0.2);
  parts.push(paint(fore, 0xff9c3d));

  const hind = new THREE.SphereGeometry(0.44, 11, 8);
  hind.scale(1, 0.06, 0.9);
  hind.translate(0.46, 0, -0.42);
  parts.push(paint(hind, 0xf9722f));

  // Spots, standing just proud of the wing so they don't z-fight it.
  for (const [x, z, r] of [
    [0.72, 0.36, 0.13],
    [0.95, 0.06, 0.1],
    [0.5, -0.5, 0.09],
  ]) {
    const spot = new THREE.SphereGeometry(r, 8, 6);
    spot.scale(1, 0.09, 1);
    spot.translate(x, 0.022, z);
    parts.push(paint(spot, 0x2e211b));
  }

  const geo = mergeGeometries(parts);
  if (!geo) {
    throw new Error("could not merge butterfly wing");
  }
  // Built for the right-hand side, mirrored for the left.
  if (side < 0) {
    geo.scale(-1, 1, 1);
  }
  return geo;
}
