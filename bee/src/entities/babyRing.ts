import * as THREE from "three";
import {
  INTERIOR,
  LEVELS,
  POLLEN_COLOR,
  POLLEN_KINDS,
  type PollenKind,
} from "../config";
import type {Rng} from "../core/rng";
import {createBaby, type BabyModel} from "../render/geometry/bee";

/** How the celebration flight is shaped, in seconds and world units. */
const CELEBRATION = {
  /** Stagger between each baby leaving its perch. */
  stagger: 0.14,
  /** How long one baby takes to reach cruising height. */
  riseTime: 1.35,
  riseHeight: 5.4,
  /** Radians/sec they circle the queen once airborne. */
  orbitRate: 0.95,
  /** How far the orbit breathes in and out. */
  orbitWobble: 1.1,
} as const;

/** How tightly they crowd whatever they're teasing, in world units. */
const MOB = {
  /** Base loop radius around the head; each baby varies off this. */
  radius: 2.6,
  /** Extra radians/sec on top of the baby's own wander rate. */
  rate: 1.5,
  /** Loops sit a little above the head, so they buzz over it. */
  rise: 0.9,
  bob: 1.0,
} as const;

/** A wandering flight path for one baby, once they're loose in the meadow. */
interface SwarmPath {
  centreX: number;
  centreZ: number;
  radiusX: number;
  radiusZ: number;
  rateX: number;
  rateZ: number;
  rateY: number;
  phaseX: number;
  phaseZ: number;
  phaseY: number;
  height: number;
  bob: number;
  /** Seconds before this one leaves the doorway. */
  delay: number;
}

interface Baby {
  index: number;
  model: BabyModel;
  /** Set while swarming outside; null when they're on their perches. */
  swarm: SwarmPath | null;
  /** Previous position, so we can face them along their own path. */
  readonly prev: THREE.Vector3;
  /** Perch it hatched on — the anchor the celebration orbit is built from. */
  readonly home: THREE.Vector3;
  /** Angle around the queen, for the celebration orbit. */
  readonly angle: number;
  /** Live position; only differs from `home` once they take flight. */
  position: THREE.Vector3;
  /** What it wants right now; null when content or fully grown. */
  craving: PollenKind | null;
  /** Seconds until it gets hungry again. */
  contentFor: number;
  feeds: number;
  grown: boolean;
  /** The floating want-bubble above its head. */
  bubble: THREE.Group;
  bubbleBall: THREE.Mesh;
  /** 0..1 eased, how far up on end it is begging to be fed. */
  rear: number;
}

export interface FeedResult {
  index: number;
  position: THREE.Vector3;
  /** True if this feed was the one that grew the baby up. */
  grewUp: boolean;
  kind: PollenKind;
}

/**
 * The ring of babies around the queen. Each gets hungry on its own clock and
 * craves one specific pollen; the player has to bring that colour. Three feeds
 * and a baby grows up.
 */
export class BabyRing {
  readonly group = new THREE.Group();
  private readonly babies: Array<Baby> = [];
  private elapsed = 0;

  /** Progress on the baby currently being fed, for the HUD ring. */
  private feedTarget: Baby | null = null;
  private feedTime = 0;

  /** Once set, the babies have left their perches for good. */
  private celebrating = false;
  private celebrateTime = 0;

  /** Loose in the meadow, wandering their own paths. */
  private swarming = false;
  private swarmTime = 0;
  private readonly swarmOrigin = new THREE.Vector3();

  /** Set while they're teasing something — they crowd this point instead. */
  private mobbing = false;
  private mobBlend = 0;
  private readonly mobPoint = new THREE.Vector3();

  constructor(
    positions: ReadonlyArray<THREE.Vector3>,
    private readonly rng: Rng,
  ) {
    positions.slice(0, LEVELS.babyCount).forEach((position, index) => {
      const model = createBaby();
      model.group.position.copy(position);
      // Face outward from the queen, so the ring looks arranged.
      model.group.rotation.y = Math.atan2(position.x, position.z);
      this.group.add(model.group);

      const {bubble, ball} = createWantBubble();
      bubble.position.copy(position).add(new THREE.Vector3(0, 1.7, 0));
      bubble.visible = false;
      this.group.add(bubble);

      const baby: Baby = {
        index,
        model,
        swarm: null,
        prev: position.clone(),
        home: position.clone(),
        angle: Math.atan2(position.z, position.x),
        position: position.clone(),
        craving: null,
        // Stagger the first hunger so they don't all shout at once.
        contentFor: index * 0.9,
        feeds: 0,
        grown: false,
        bubble,
        bubbleBall: ball,
        rear: 0,
      };
      model.setGrowth(0);
      this.babies.push(baby);
    });
  }

  /**
   * Put every baby back on its perch, hungry and un-grown. Level 2 calls this
   * on entry so replaying it from the menu actually replays it — the ring
   * lives on the Game, not the level, so it would otherwise still be a room
   * full of grown bees with nothing to feed.
   */
  reset(): void {
    this.celebrating = false;
    this.celebrateTime = 0;
    this.swarming = false;
    this.mobbing = false;
    this.mobBlend = 0;
    this.feedTarget = null;
    this.feedTime = 0;
    for (const baby of this.babies) {
      baby.swarm = null;
      baby.feeds = 0;
      baby.grown = false;
      baby.craving = null;
      baby.rear = 0;
      baby.contentFor = baby.index * 0.9;
      baby.position.copy(baby.home);
      baby.model.setGrowth(0);
      baby.model.group.position.copy(baby.home);
      baby.model.group.rotation.set(0, Math.atan2(baby.home.x, baby.home.z), 0);
      baby.bubble.visible = false;
      baby.bubble.position.copy(baby.home).add(new THREE.Vector3(0, 1.7, 0));
    }
  }

  get grownCount(): number {
    return this.babies.filter(b => b.grown).length;
  }

  get allGrown(): boolean {
    return this.babies.every(b => b.grown);
  }

  /** 0..1 progress on whichever baby is being fed right now. */
  get feedProgress(): number {
    if (!this.feedTarget) {
      return 0;
    }
    return Math.min(1, this.feedTime / INTERIOR.feedSeconds);
  }

  /**
   * @param carrying what the player is holding, or null
   * @returns a feed event on the frame a delivery lands
   */
  update(
    dt: number,
    beePosition: THREE.Vector3,
    carrying: PollenKind | null,
  ): FeedResult | null {
    this.elapsed += dt;

    if (this.swarming) {
      this.updateSwarm(dt);
      return null;
    }
    if (this.celebrating) {
      this.updateCelebration(dt);
      return null;
    }

    for (const baby of this.babies) {
      if (!baby.grown && baby.craving === null) {
        baby.contentFor -= dt;
        if (baby.contentFor <= 0) {
          baby.craving = this.pickCraving();
        }
      }

      const hungry = baby.craving !== null;
      baby.bubble.visible = hungry;

      // Up on end the moment the food it asked for is on its way over —
      // eased, so it rises to meet the bee rather than snapping upright, and
      // sinks back down if she carries it somewhere else.
      const begging =
        hungry &&
        carrying === baby.craving &&
        baby.position.distanceToSquared(beePosition) <
          INTERIOR.noticeRadius * INTERIOR.noticeRadius;
      baby.rear += ((begging ? 1 : 0) - baby.rear) * Math.min(1, 7 * dt);

      // The lift is applied here rather than in the model: animate() must not
      // write to the group the ring positions, or the two fight each other.
      const lift = baby.rear * INTERIOR.rearLift;
      baby.model.group.position.y = baby.position.y + lift;

      if (hungry) {
        const mat = baby.bubbleBall.material as THREE.MeshBasicMaterial;
        mat.color.set(POLLEN_COLOR[baby.craving!]);
        baby.bubble.position.y =
          baby.position.y +
          lift +
          1.7 +
          Math.sin(this.elapsed * 2.6 + baby.index) * 0.14;
        baby.bubble.rotation.y = this.elapsed * 0.9;
      }
      baby.model.animate(
        this.elapsed + baby.index * 1.7,
        hungry ? 1 : 0.12,
        baby.rear,
      );
    }

    // Feeding: hover near a baby that wants exactly what you're carrying.
    const target = carrying
      ? this.nearestMatching(beePosition, carrying)
      : null;
    if (target !== this.feedTarget) {
      this.feedTarget = target;
      this.feedTime = 0;
    }
    if (!this.feedTarget) {
      return null;
    }

    this.feedTime += dt;
    if (this.feedTime < INTERIOR.feedSeconds) {
      return null;
    }

    const baby = this.feedTarget;
    const kind = baby.craving!;
    baby.feeds++;
    baby.craving = null;
    baby.contentFor = INTERIOR.hungerDelay;
    baby.model.setGrowth(baby.feeds / LEVELS.feedsToGrow);
    if (baby.feeds >= LEVELS.feedsToGrow) {
      baby.grown = true;
      baby.bubble.visible = false;
    }
    this.feedTarget = null;
    this.feedTime = 0;

    return {
      index: baby.index,
      position: baby.position.clone().add(new THREE.Vector3(0, 0.7, 0)),
      grewUp: baby.grown,
      kind,
    };
  }

  /**
   * The brood is grown — send them up. They lift off their perches in a
   * staggered wave and then circle the queen, and they stay up there: the
   * level is over, and a chamber full of flying bees is the reward.
   */
  beginCelebration(): void {
    if (this.celebrating) {
      return;
    }
    this.celebrating = true;
    this.celebrateTime = 0;
    for (const baby of this.babies) {
      baby.bubble.visible = false;
    }
  }

  private updateCelebration(dt: number): void {
    this.celebrateTime += dt;

    for (const baby of this.babies) {
      // Each baby's own clock, so they peel off one after another.
      const t = Math.max(
        0,
        this.celebrateTime - baby.index * CELEBRATION.stagger,
      );
      const lift = easeOutBack(Math.min(1, t / CELEBRATION.riseTime));

      const angle = baby.angle + t * CELEBRATION.orbitRate * lift;
      const radius =
        INTERIOR.babyRingRadius +
        Math.sin(t * 1.5 + baby.index) * CELEBRATION.orbitWobble * lift;

      baby.position.set(
        Math.cos(angle) * radius,
        baby.home.y +
          lift * CELEBRATION.riseHeight +
          Math.sin(t * 3.1 + baby.index) * 0.35 * lift,
        Math.sin(angle) * radius,
      );
      baby.model.group.position.copy(baby.position);

      // Face the way they're flying (tangent to the orbit), with a happy
      // barrel-roll wobble and a nose-up tilt while they're still climbing.
      baby.model.group.rotation.y = -angle + Math.PI / 2;
      baby.model.group.rotation.z = Math.sin(t * 4.2 + baby.index) * 0.5 * lift;
      baby.model.group.rotation.x =
        -Math.max(0, 1 - t / CELEBRATION.riseTime) * 0.5;

      // Wings flat out — they're working hard and delighted about it.
      baby.model.animate(this.elapsed + baby.index * 1.7, 1);
    }
  }

  /**
   * Let the whole brood out of the hive to fly around the meadow.
   *
   * They pour out of `origin` one after another and then wander their own
   * lissajous loops around it — two out-of-step sines per axis, so the paths
   * drift and cross instead of looking like a carousel. They're grown by now,
   * so they fly at full size.
   */
  swarm(origin: THREE.Vector3): void {
    this.swarming = true;
    this.celebrating = false;
    this.mobbing = false;
    this.mobBlend = 0;
    this.swarmTime = 0;
    this.swarmOrigin.copy(origin);

    this.babies.forEach((baby, i) => {
      baby.grown = true;
      baby.craving = null;
      baby.bubble.visible = false;
      baby.model.setGrowth(1);
      baby.position.copy(origin);
      baby.prev.copy(origin);
      baby.model.group.position.copy(origin);

      // Spread the loop centres around the hive so nobody parks on the doorway.
      const bearing =
        (i / this.babies.length) * Math.PI * 2 + this.rng.range(-0.4, 0.4);
      const spread = this.rng.range(7, 14);
      baby.swarm = {
        centreX: origin.x + Math.cos(bearing) * spread,
        centreZ: origin.z + Math.sin(bearing) * spread,
        radiusX: this.rng.range(3.5, 7.5),
        radiusZ: this.rng.range(3.5, 7.5),
        rateX: this.rng.range(0.35, 0.7),
        rateZ: this.rng.range(0.35, 0.7),
        rateY: this.rng.range(0.5, 1.1),
        phaseX: this.rng.range(0, Math.PI * 2),
        phaseZ: this.rng.range(0, Math.PI * 2),
        phaseY: this.rng.range(0, Math.PI * 2),
        height: this.rng.range(2.6, 6.5),
        bob: this.rng.range(0.6, 1.6),
        delay: i * 0.18 + this.rng.range(0, 0.14),
      };
    });
  }

  /**
   * Aim the loose brood at a moving point — the bear's head, while they're
   * teasing it — or pass null to send them back to wandering the meadow.
   *
   * Call it every frame with a live position: the point is only a target, and
   * they ease onto it over about a second, so a moving one just drags the
   * whole cloud along with it.
   */
  mobAround(point: THREE.Vector3 | null): void {
    this.mobbing = point !== null;
    if (point) {
      this.mobPoint.copy(point);
    }
  }

  private updateSwarm(dt: number): void {
    this.swarmTime += dt;
    // Ease the whole cloud between wandering and mobbing rather than snapping,
    // so they visibly fly over to the bear and back off again afterwards.
    this.mobBlend +=
      ((this.mobbing ? 1 : 0) - this.mobBlend) * Math.min(1, 1.1 * dt);

    for (const baby of this.babies) {
      const p = baby.swarm;
      if (!p) {
        continue;
      }

      const t = Math.max(0, this.swarmTime - p.delay);
      // Burst out of the doorway, then settle onto the wandering loop.
      const out = easeOutCubic(Math.min(1, t / 1.3));

      tmpTarget.set(
        p.centreX + Math.sin(t * p.rateX + p.phaseX) * p.radiusX,
        p.height + Math.sin(t * p.rateY + p.phaseY) * p.bob,
        p.centreZ + Math.cos(t * p.rateZ + p.phaseZ) * p.radiusZ,
      );

      if (this.mobBlend > 0.001) {
        // A tight, tilted loop of its own around the head. The rates are
        // deliberately faster and mutually prime-ish so the cloud churns
        // instead of settling into a tidy carousel.
        const radius = MOB.radius + (p.radiusX - 3.5) * 0.3;
        const spin = t * (p.rateX + MOB.rate);
        tmpMob.set(
          this.mobPoint.x + Math.sin(spin + p.phaseX) * radius,
          this.mobPoint.y +
            MOB.rise +
            Math.sin(t * (p.rateY + 1.4) + p.phaseY) * MOB.bob,
          this.mobPoint.z + Math.cos(spin * 1.27 + p.phaseZ) * radius,
        );
        tmpTarget.lerp(tmpMob, this.mobBlend);
      }

      baby.prev.copy(baby.position);
      baby.position.lerpVectors(this.swarmOrigin, tmpTarget, out);
      baby.model.group.position.copy(baby.position);

      // Face the way they're actually travelling.
      tmpDelta.copy(baby.position).sub(baby.prev);
      if (tmpDelta.lengthSq() > 1e-6) {
        baby.model.group.rotation.y = Math.atan2(tmpDelta.x, tmpDelta.z);
        baby.model.group.rotation.z = Math.sin(t * 2.3 + baby.index) * 0.35;
        baby.model.group.rotation.x = -tmpDelta.y * 6;
      }
      baby.model.animate(this.elapsed + baby.index * 1.7, 1);
    }
  }

  /** Live positions, so fireworks can track the rising babies. */
  positionOf(index: number): THREE.Vector3 {
    return this.babies[index % this.babies.length].position;
  }

  /** Where the beacon should point: the nearest baby wanting what you hold. */
  guidanceTarget(
    from: THREE.Vector3,
    carrying: PollenKind | null,
  ): THREE.Vector3 | null {
    const baby = carrying
      ? this.nearestMatching(from, carrying, Infinity)
      : this.nearestHungry(from);
    return baby
      ? baby.position.clone().add(new THREE.Vector3(0, 0.9, 0))
      : null;
  }

  /** What the hungry babies are asking for, for the HUD. */
  cravings(): Array<PollenKind> {
    return this.babies.flatMap(b => (b.craving ? [b.craving] : []));
  }

  private pickCraving(): PollenKind {
    return POLLEN_KINDS[this.rng.int(0, POLLEN_KINDS.length)];
  }

  private nearestMatching(
    from: THREE.Vector3,
    kind: PollenKind,
    maxDistance: number = INTERIOR.feedRadius,
  ): Baby | null {
    let best: Baby | null = null;
    let bestDist = maxDistance * maxDistance;
    for (const baby of this.babies) {
      if (baby.grown || baby.craving !== kind) {
        continue;
      }
      const d = baby.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = baby;
      }
    }
    return best;
  }

  private nearestHungry(from: THREE.Vector3): Baby | null {
    let best: Baby | null = null;
    let bestDist = Infinity;
    for (const baby of this.babies) {
      if (baby.grown || !baby.craving) {
        continue;
      }
      const d = baby.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = baby;
      }
    }
    return best;
  }
}

const tmpTarget = new THREE.Vector3();
const tmpMob = new THREE.Vector3();
const tmpDelta = new THREE.Vector3();

/** Fast start, gentle arrival — reads as bursting out of the doorway. */
function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/** Overshoots slightly before settling — reads as an eager little jump. */
function easeOutBack(t: number): number {
  const u = t - 1;
  return 1 + 2.9 * u * u * u + 1.9 * u * u;
}

/**
 * Floating "I want this" bubble. This is the only thing telling the player
 * which colour to fetch, so it's deliberately oversized and bright — it has to
 * be readable from the far wall of the dome, not just up close.
 */
function createWantBubble(): {bubble: THREE.Group; ball: THREE.Mesh} {
  const bubble = new THREE.Group();

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 16, 12),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  bubble.add(shell);

  // The coloured pollen ball is unlit so the dim interior can't mute it.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.38, 16, 12),
    new THREE.MeshBasicMaterial({color: 0xffffff}),
  );
  bubble.add(ball);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.055, 6, 24),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  bubble.add(ring);

  // A little stalk down to the baby, so it's obvious whose want it is.
  const stalk = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.34, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
    }),
  );
  stalk.rotation.x = Math.PI;
  stalk.position.y = -0.72;
  bubble.add(stalk);

  return {bubble, ball};
}
