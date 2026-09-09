import * as THREE from "three";
import {ParticleBurst} from "../../../shared/particles";
import {Environment, Palette, STAND} from "../config";
import {Rng} from "../core/rng";
import {instance} from "../models";
import {spectator, stand} from "../models/stand";
import {Track} from "./track";

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The grandstands at the start line, and the people in them.
 *
 * One each side of the road, facing it. The crowd is instanced — four hundred
 * people between the two stands, one copy of the geometry — and each of them
 * carries their own colour and their own phase, so a jumping crowd is a crowd
 * and not a wave.
 *
 * They jump when the player finishes anywhere but last. That exception is the
 * point of the feature rather than a detail of it: a child knows when they
 * have been beaten, and an ovation for coming fourth of four is how a game
 * starts feeling like it is humouring them.
 */
export class Stands {
  readonly group = new THREE.Group();

  private readonly people: Array<THREE.InstancedMesh> = [];
  /** Where each person sits, and where in the bounce they are. */
  private readonly seats: Array<{
    x: number;
    y: number;
    z: number;
    turn: number;
    phase: number;
  }> = [];
  private cheering = 0;
  /**
   * What goes off over the line. Its own pool, because it is the one thing in
   * this game that wants to be a shower of coloured paper — or, in the desert,
   * a fire. Fire is drawn additively, which is what makes overlapping flames
   * brighten each other instead of hiding each other; paper is not, because
   * additive paper is a glowing smear.
   */
  readonly confetti: ParticleBurst;
  /** How much of the desert's fire is left to throw. */
  private burning = 0;
  private feed = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly tint = new THREE.Color();
  private readonly flare = new THREE.Vector3();

  constructor(
    rng: Rng,
    track: Track,
    palette: Palette,
    private readonly environment: Environment = "hills",
  ) {
    this.confetti = new ParticleBurst(
      STAND.confetti,
      0.9,
      environment === "desert",
    );
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const d = new THREE.Vector3();
    track.pointAt(track.startAt, p);
    track.sideAt(track.startAt, s);
    track.tangentAt(track.startAt, d);
    const facing = Math.atan2(d.x, d.z);

    for (const side of [-1, 1]) {
      const x = p.x + s.x * STAND.from * side;
      const z = p.z + s.z * STAND.from * side;
      // Square to the camera, always — not to the road.
      //
      // This looks wrong written down and is right: the camera in this game
      // never turns. It sits behind the car and looks along world −Z from one
      // end of a race to the other, whatever direction the track happens to
      // run. So "facing the player" is a fixed direction, and a stand turned
      // to face the *road* would present its side to the shot on any circuit
      // whose start line does not happen to run east-west — which is what it
      // was doing: a grey slab with a few heads peeking over the top of it.
      const turn = 0;
      void facing;

      const built = stand(palette).build();
      built.position.set(x, 0, z);
      built.rotation.y = turn;
      this.group.add(built);

      // Fill the tiers. Rows step up and back exactly as the model does, so
      // the people sit on the seats rather than through them.
      const perRow = Math.ceil(STAND.perStand / STAND.rows);
      for (let row = 0; row < STAND.rows; row++) {
        for (let i = 0; i < perRow; i++) {
          const across =
            (i / (perRow - 1) - 0.5) * (STAND.width - 8) + rng.range(-1.4, 1.4);
          const up = row * STAND.rise + STAND.rise;
          const back = -row * STAND.tread + rng.range(-1, 1);
          // Into the stand's own frame and then out into the world.
          const cos = Math.cos(turn);
          const sin = Math.sin(turn);
          this.seats.push({
            x: x + across * cos + back * sin,
            y: up,
            z: z - across * sin + back * cos,
            turn,
            phase: rng.range(0, Math.PI * 2),
          });
        }
      }
    }

    const shirts = palette.crowd;
    for (const mesh of instance(spectator(), this.seats.length)) {
      for (let i = 0; i < this.seats.length; i++) {
        mesh.setColorAt(i, this.tint.set(rng.pick(shirts)));
      }
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
      this.people.push(mesh);
      this.group.add(mesh);
    }
    this.group.add(this.confetti.mesh);
    this.confetti.mesh.frustumCulled = false;
    this.settle();
  }

  /** Where the confetti goes off: over the line, high enough to fall through
   *  the shot rather than appearing in it. */
  readonly over = new THREE.Vector3();

  /** Everybody on their feet, and paper everywhere — or, in the desert, fire.
   *  See `STAND.flame`. */
  cheer(at: THREE.Vector3, palette: Palette): void {
    this.cheering = STAND.jumpFor;
    if (this.environment === "desert") {
      this.over.copy(at);
      this.burning = STAND.flameFor;
      this.feed = 0;
      return;
    }
    // Three goes, spread across the road, so it falls as a shower rather than
    // as one ball of paper.
    for (let i = -1; i <= 1; i++) {
      this.over.set(at.x + i * 26, 34, at.z + i * 12);
      this.confetti.burst(this.over, {
        color: palette.crowd,
        count: Math.round(STAND.confetti / 3),
        speed: STAND.confettiSpeed,
        lift: STAND.confettiLift,
        gravity: STAND.confettiFall,
        ttl: STAND.confettiLasts,
        size: STAND.confettiSize,
        spherical: 0.5,
      });
    }
  }

  /**
   * The desert's fire, fed a little at a time.
   *
   * Two columns, one either side of the road, thrown up from just above the
   * ground so they climb through the shot rather than appearing at the top of
   * it. A single burst is an explosion; a burst every sixth of a second for a
   * second and a half is a fire.
   */
  private burn(dt: number): void {
    if (this.burning <= 0) {
      return;
    }
    this.burning -= dt;
    this.feed -= dt;
    if (this.feed > 0) {
      return;
    }
    this.feed = STAND.flameEvery;
    for (const side of [-1, 1]) {
      this.confetti.burst(
        this.flare.set(
          this.over.x + side * STAND.flameApart,
          STAND.flameFrom,
          this.over.z + side * STAND.flameApart * 0.45,
        ),
        {
          color: STAND.flame,
          count: STAND.flameCount,
          speed: STAND.flameSpeed,
          lift: STAND.flameLift,
          gravity: STAND.flameRise,
          ttl: STAND.flameLasts,
          size: STAND.flameSize,
          spherical: 0.16,
        },
      );
    }
  }

  /**
   * Bounces them, while there is anything to bounce about.
   *
   * Each person has their own phase, so the crowd is a crowd. Once the cheer
   * runs out the matrices are written one last time and then left alone —
   * there is no reason to push four hundred of them at the GPU every frame of
   * a race nobody has won yet.
   */
  update(dt: number): void {
    this.confetti.update(dt);
    this.burn(dt);
    if (this.cheering <= 0) {
      return;
    }
    this.cheering -= dt;
    const fading = Math.max(0, Math.min(1, this.cheering));
    const t = STAND.jumpFor - this.cheering;
    for (const mesh of this.people) {
      this.seats.forEach((seat, i) => {
        // Absolute sine, so they land and push off again rather than sinking
        // into the seat on the way down.
        const hop =
          Math.abs(Math.sin(t * STAND.jumpRate + seat.phase)) *
          STAND.jumpHeight *
          fading;
        this.q.setFromAxisAngle(UP, seat.turn);
        this.m.compose(
          this.pos.set(seat.x, seat.y + hop, seat.z),
          this.q,
          this.one,
        );
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Sits everybody down where they belong. */
  private settle(): void {
    for (const mesh of this.people) {
      this.seats.forEach((seat, i) => {
        this.q.setFromAxisAngle(UP, seat.turn);
        this.m.compose(this.pos.set(seat.x, seat.y, seat.z), this.q, this.one);
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
