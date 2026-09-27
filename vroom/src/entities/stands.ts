import * as THREE from "three";
import {mergeGeometries} from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type {NearFade} from "../../../shared/fadeInFront";
import {ParticleBurst} from "../../../shared/particles";
import {Environment, Palette, STAND} from "../config";
import {Rng} from "../core/rng";
import {instance} from "../models";
import type {Assembly} from "../models/assembly";
import {
  spectatorBody,
  spectatorBun,
  spectatorHair,
  spectatorFlag,
  spectatorHat,
  spectatorHead,
  spectatorLong,
  spectatorTail,
  stand,
} from "../models/stand";
import {fadingVertex} from "../render/sprites";
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

  /**
   * The two stands themselves, and whether each is currently in the way.
   *
   * Held because a grandstand between the camera and the car is not something
   * to dissolve a hole in — see `STAND.blocks` — it is something to take off
   * the screen, and taking it off the screen means knowing which people belong
   * to it as well as which slab.
   */
  private readonly builds: Array<{
    mesh: THREE.Mesh;
    at: THREE.Vector3;
    hidden: boolean;
  }> = [];
  private readonly people: Array<THREE.InstancedMesh> = [];
  /** For the pieces only some of them wear — a ponytail, a bun, a beard —
   *  who is wearing one. */
  private readonly wears = new Map<THREE.InstancedMesh, Array<boolean>>();
  /** Where each person sits, and where in the bounce they are. */
  private readonly seats: Array<{
    x: number;
    y: number;
    z: number;
    turn: number;
    phase: number;
    /** Which stand they are sitting in, so they go when it does. */
    stand: number;
  }> = [];
  private cheering = 0;
  /** The stand and its crowd get out of the way of the car, the way the trees
   *  and the city do; see `fadeInFront`. */
  readonly fades: Array<NearFade> = [];
  /**
   * What goes off over the line. Its own pool, because it is the one thing in
   * this game that wants to be a shower of coloured paper — or, in the desert,
   * a fire. Fire is drawn additively, which is what makes overlapping flames
   * brighten each other instead of hiding each other; paper is not, because
   * additive paper is a glowing smear.
   */
  readonly confetti: ParticleBurst;
  /** The car the desert's fire goes off round: the player's own position,
   *  held rather than copied so the fire keeps up with it. */
  private following: THREE.Vector3 | null = null;
  /** How much of the desert's fire is left to throw. */
  private burning = 0;
  private feed = 0;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  /** An instanced mesh cannot skip a copy; a copy of no size is how one is
   *  left out. */
  private readonly none = new THREE.Vector3(0, 0, 0);
  private readonly tint = new THREE.Color();
  private readonly flare = new THREE.Vector3();
  /** Held for the blocking test, which runs every frame. */
  private readonly axis = new THREE.Vector3();
  private readonly rel = new THREE.Vector3();

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
      // Sparks in the desert are motes; everywhere else this is paper, and
      // paper tumbles.
      environment === "desert" ? "mote" : "paper",
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
      // Both stands face the road, so the crowd is watching the race.
      //
      // The camera in this game never turns: it sits behind the car and looks
      // along world −Z whatever direction the track runs. So the stand on the
      // far side of the road, which is the one the camera looks at, faces the
      // camera and the road at once — and it is left as it was. The near one
      // faced the camera as well, which put its back to the race and its
      // crowd watching the trees. It is turned round.
      const turn = z > p.z ? Math.PI : 0;
      void facing;

      // The stand itself, as one fading mesh rather than one mesh per
      // substance: a grandstand sits right beside the line, and at the flag
      // the shot comes down in front of the car with the stand between the
      // two. Everything else that can come between them — trees, tyre
      // stacks, city blocks — dissolves; this did not, and a child crossing
      // the line watched a grey slab.
      const {material, fade} = fadingVertex("stand");
      const parts = stand(palette)
        .parts()
        .map(({geometry}) => geometry);
      const built = new THREE.Mesh(mergeGeometries(parts, false), material);
      built.castShadow = true;
      built.receiveShadow = true;
      built.position.set(x, 0, z);
      built.rotation.y = turn;
      this.group.add(built);
      this.fades.push(fade);
      const which = this.builds.length;
      this.builds.push({
        mesh: built,
        at: new THREE.Vector3(x, 0, z),
        hidden: false,
      });

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
            stand: which,
          });
        }
      }
    }

    // What everybody looks like, decided once and kept. A crowd of one
    // haircut is a crowd of clones, and at this size the head is most of what
    // there is to tell one from another.
    const looks = this.seats.map(() => ({
      hair: rng.pick(STAND.hair),
      skin: rng.pick(STAND.skins),
      shirt: rng.pick(palette.crowd),
      style: rng.pick(STAND.styles),
      hat: rng.range(0, 1) < STAND.hats ? rng.pick(palette.crowd) : null,
      flag: rng.range(0, 1) < STAND.flags ? rng.pick(palette.crowd) : null,
    }));

    // Each piece is its own instanced mesh in the same seats, because an
    // instance takes one colour and a person is not one colour — and because
    // the hair somebody is not wearing has to be left out, which is done by
    // scaling it to nothing.
    const paint = (): THREE.Material => {
      // The crowd goes with the stand it sits in, or the seats empty and the
      // people are left hanging in the air.
      const {material, fade} = fadingVertex("crowd");
      this.fades.push(fade);
      return material;
    };
    const parts: Array<{
      built: Assembly;
      colour: (look: (typeof looks)[number]) => number;
      worn?: (look: (typeof looks)[number]) => boolean;
    }> = [
      {built: spectatorBody(), colour: look => look.shirt},
      {built: spectatorHead(), colour: look => look.skin},
      {
        built: spectatorHair(),
        colour: look => look.hair,
        worn: look => look.style !== "bald",
      },
      {
        built: spectatorTail(),
        colour: look => look.hair,
        worn: look => look.style === "tail",
      },
      {
        built: spectatorLong(),
        colour: look => look.hair,
        worn: look => look.style === "long",
      },
      {
        built: spectatorBun(),
        colour: look => look.hair,
        worn: look => look.style === "bun",
      },
      {
        built: spectatorHat(),
        colour: look => look.hat ?? 0xffffff,
        worn: look => look.hat !== null,
      },
      {
        built: spectatorFlag(),
        colour: look => look.flag ?? 0xffffff,
        worn: look => look.flag !== null,
      },
    ];
    for (const {built, colour, worn} of parts) {
      for (const mesh of instance(built, this.seats.length, paint)) {
        for (let i = 0; i < this.seats.length; i++) {
          mesh.setColorAt(i, this.tint.set(colour(looks[i])));
        }
        if (mesh.instanceColor) {
          mesh.instanceColor.needsUpdate = true;
        }
        if (worn) {
          this.wears.set(
            mesh,
            looks.map(look => worn(look)),
          );
        }
        this.people.push(mesh);
        this.group.add(mesh);
      }
    }
    this.group.add(this.confetti.mesh);
    this.confetti.mesh.frustumCulled = false;
    this.settle();
  }

  /** Where the confetti goes off: over the line, high enough to fall through
   *  the shot rather than appearing in it. */
  readonly over = new THREE.Vector3();

  /**
   * Everybody on their feet, and paper everywhere — or, in the desert, spark
   * fountains. See `STAND.flame`.
   *
   * The paper is its own colours rather than the crowd's: see `STAND.paper`.
   */
  cheer(at: THREE.Vector3): void {
    this.cheering = STAND.jumpFor;
    if (this.environment === "desert") {
      this.over.copy(at);
      this.following = at;
      this.burning = STAND.flameFor;
      this.feed = 0;
      return;
    }
    // Five goes, spread right across the road, so it comes down as a shower
    // over the whole finish rather than as one ball of paper above the car.
    for (let i = -2; i <= 2; i++) {
      this.over.set(at.x + i * 30, 34 + Math.abs(i) * 4, at.z + i * 14);
      this.confetti.burst(this.over, {
        color: STAND.paper,
        count: Math.round(STAND.confetti / 5),
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
   * Round the winner's car: a burst either side of it, following the car as
   * it rolls on past the line, and thrown small enough that none of it lands
   * on the car. They used to go off
   * beside the grandstands, out of the way of the car — which, with the shot
   * coming down in front of the car at the flag, was out of the way of the
   * shot as well, and a child asked for them where they could see them.
   * Screen left and right are world x, since the camera never turns.
   */
  private burn(dt: number): void {
    if (this.burning <= 0 || !this.following) {
      return;
    }
    this.burning -= dt;
    this.feed -= dt;
    if (this.feed > 0) {
      return;
    }
    this.feed = STAND.flameEvery;
    const car = this.following;
    // Either side of it, never over it: sparks over the roof are between the
    // camera and the car, and a child wants to see their car cross the line.
    for (const across of [-STAND.flameBeside, STAND.flameBeside]) {
      const up = STAND.flameLow;
      this.confetti.burst(this.flare.set(car.x + across, up, car.z), {
        color: STAND.flame,
        count: STAND.flameCount,
        speed: STAND.flameSpeed,
        lift: STAND.flameLift,
        gravity: STAND.flameRise,
        ttl: STAND.flameLasts,
        size: STAND.flameSize,
        // Nought: every spark leaves straight up, and the only spread is the
        // small sideways speed above. That is what makes a fountain rather
        // than a ball of fire.
        spherical: 0,
      });
    }
  }

  /**
   * Takes a grandstand off the screen while it stands between the camera and
   * the car.
   *
   * The camera never turns, so at a start line running across the shot one of
   * the two stands sits squarely behind the car — and a grandstand a few yards
   * from the lens is most of the picture. The near-fade is no use for it: its
   * cone comes to a point at the camera, so all it can do to something that
   * close is cut a car-shaped hole in it.
   *
   * Only while it is actually in the way. A stand beside the road, or one the
   * camera is looking past rather than through, is part of the place and stays
   * exactly where it is.
   */
  keepClear(eye: THREE.Vector3, car: THREE.Vector3): void {
    this.axis.subVectors(car, eye);
    const span = Math.max(this.axis.lengthSq(), 1e-4);
    let moved = false;
    for (const build of this.builds) {
      this.rel.subVectors(build.at, eye);
      const along = this.rel.dot(this.axis) / span;
      let blocking = false;
      // Between the two of them rather than behind the camera or past the car.
      if (along > 0.02 && along < 0.98) {
        const off = this.rel
          .addScaledVector(this.axis, -along)
          .setY(0)
          .length();
        // Hysteresis: it has to get properly clear before it comes back, or a
        // stand on the boundary blinks with every twitch of the car.
        blocking = build.hidden ? off < STAND.clears : off < STAND.blocks;
      }
      if (blocking !== build.hidden) {
        build.hidden = blocking;
        build.mesh.visible = !blocking;
        moved = true;
      }
    }
    // The crowd's matrices are written only when something about them changes
    // — four hundred people rewritten every frame would be four hundred people
    // rewritten for nothing — so this is one of the moments they change.
    if (moved && this.cheering <= 0) {
      this.settle();
    }
  }

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
      const worn = this.wears.get(mesh);
      this.seats.forEach((seat, i) => {
        // Absolute sine, so they land and push off again rather than sinking
        // into the seat on the way down.
        const hop =
          Math.abs(Math.sin(t * STAND.jumpRate + seat.phase)) *
          STAND.jumpHeight *
          fading;
        this.q.setFromAxisAngle(UP, seat.turn);
        const there = !this.builds[seat.stand]?.hidden && (!worn || worn[i]);
        this.m.compose(
          this.pos.set(seat.x, seat.y + hop, seat.z),
          this.q,
          there ? this.one : this.none,
        );
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Sits everybody down where they belong. */
  private settle(): void {
    for (const mesh of this.people) {
      const worn = this.wears.get(mesh);
      this.seats.forEach((seat, i) => {
        this.q.setFromAxisAngle(UP, seat.turn);
        const there = !this.builds[seat.stand]?.hidden && (!worn || worn[i]);
        this.m.compose(
          this.pos.set(seat.x, seat.y, seat.z),
          this.q,
          there ? this.one : this.none,
        );
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
