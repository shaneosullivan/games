import * as THREE from "three";
import {ISLANDS as I, ISLANDS_PALETTE as P} from "../config";
import type {Hop} from "../core/hopButtons";
import {Rng} from "../core/rng";
import {createBaby, type BabyModel} from "../render/geometry/bee";
import {FIREWORK_PALETTE} from "../fx/particles";
import {
  createIslandsScene,
  type IslandsScene,
  type Rider,
} from "../render/geometry/islands";
import type {GameContext, Level} from "./level";

type Phase =
  "waiting" | "rising" | "playing" | "delivering" | "struck" | "won" | "done";

/** What one of the brood is doing. */
type BabyState = "waiting" | "joining" | "following" | "dancing" | "parked";

interface Baby {
  model: BabyModel;
  state: BabyState;
  /** Where it sits before it is fetched, and where it ends up. */
  readonly home: THREE.Vector3;
  readonly perch: THREE.Vector3;
  /** How far through joining, dancing or settling it is, in seconds. */
  time: number;
  /** Where it set off from, for the two moves it makes on its own. */
  readonly from: THREE.Vector3;
}

/** One position the queen has been, and how far she had flown to reach it. */
interface Crumb {
  /** Distance along her whole route, so the trail can be read backwards. */
  along: number;
  pos: THREE.Vector3;
}

const eye = new THREE.Vector3();
const look = new THREE.Vector3();
const fromEye = new THREE.Vector3();
const fromLook = new THREE.Vector3();
const blend = new THREE.Vector3();
const blendLook = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** Forward is (sin yaw, cos yaw), so this faces her down the board at -z. */
const FACING_ACROSS = Math.PI;

const ease = (t: number): number =>
  t < 0.5 ? 2 * t * t : 1 - (1 - t) * (1 - t) * 2;

/**
 * Level 7 — Bee vs Frog.
 *
 * Frogger, with the frogs on the other side of it. Eight streams run in
 * alternate directions between two banks, carrying lilypads and alligators,
 * and the bee hops square by square across them. Share a stream with a frog
 * and come within one square and its tongue has you; meet an alligator and it
 * doesn't need a tongue.
 *
 * The board is the level: see ISLANDS in config.ts, where the streams are a
 * table of speed against how many things ride, and the note there gives the
 * arithmetic that keeps every one of them crossable.
 *
 * She is scripted throughout — the level writes her position every frame — so
 * the flight model, the stick and the altitude slider are all switched off in
 * `enter`. What replaces them is four buttons; see core/hopButtons.ts.
 */
export class IslandsLevel implements Level {
  readonly name = "Bee vs Frog";
  readonly completionTitle = "Across the water!";
  readonly completionBody =
    "Not one frog got you, and the whole brood is across the water.";
  /**
   * The card offers the map rather than "keep flying": the far bank is a strip
   * of grass with nothing left on it, and being left standing there is a dead
   * end rather than a reward. The Ant Hunt is on the same land, and the map is
   * how you get to it.
   */
  readonly finishesGame = true;
  readonly failTitle = "Snap!";
  readonly failBody =
    "A frog got you. Watch which way each stream is going, and hop when the water beside you is empty. Want another go?";

  complete = false;
  failed = false;

  private scene!: IslandsScene;
  private phase: Phase = "waiting";
  private phaseTime = 0;

  /** Where she is on the board. Row 0 is the near bank. */
  private row = 0;
  private col = (I.cols - 1) / 2;
  /** The hop in progress: where it started, and how far through it is. */
  private hopFrom = new THREE.Vector3();
  private hopTo = new THREE.Vector3();
  private hopT = 1;
  /** The brood, in the order she takes them across. */
  private readonly babies: Array<Baby> = [];
  /** Which one is with her, or null when she is on her way back. */
  private escorting: Baby | null = null;
  private delivered = 0;
  /**
   * Where she has been, newest last.
   *
   * The baby is played back from this rather than steered: it goes where she
   * went, a fraction of a second later, so it follows her round a frog instead
   * of cutting the corner across it.
   */
  private readonly trail: Array<Crumb> = [];
  private trailTime = 0;
  private striker: Rider | null = null;
  private nextBurst = 0;
  private bursts = 0;

  get controlsLocked(): boolean {
    return this.phase !== "playing";
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("islands");
    // Nothing here is flown. The buttons are turned on when play starts, not
    // now: pressing them during the opening shot would bank hops she then
    // takes the moment the camera settles.
    ctx.setFlightControls(false);

    this.scene = createIslandsScene(new Rng(0x15_1a_4d_51));
    ctx.islands.add(this.scene.group);

    ctx.configureFlight({
      // She is never handed to the flight model; these only have to be sane.
      boundsRadius: 4000,
      minHeight: 0,
      maxHeight: 40,
      cameraDistance: 13,
      cameraHeight: 6,
    });

    this.row = 0;
    this.col = (I.cols - 1) / 2;
    this.hopT = 1;
    this.striker = null;
    this.complete = false;
    this.failed = false;
    this.phase = "waiting";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;

    this.cell(this.row, this.col, tmp);
    ctx.placeBee(tmp, tmp.y, FACING_ACROSS);
    ctx.bee.setYaw(FACING_ACROSS);
    ctx.bee.setScale(I.beeScale);
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);

    // The opening shot: the ordinary over-the-shoulder view, from the bank,
    // looking at what she has to cross.
    const {back, up, side} = I.approachCamera;
    fromEye.set(tmp.x + side, tmp.y + up, tmp.z + back);
    fromLook.copy(tmp);
    ctx.setCameraCinematic(fromEye, fromLook);

    // The brood, waiting their turn on the near pedestals.
    this.babies.length = 0;
    this.escorting = null;
    this.delivered = 0;
    this.seedTrail(0, FACING_ACROSS);
    for (let i = 0; i < I.babies; i++) {
      const model = createBaby();
      model.group.scale.setScalar(I.babyScale);
      model.setGrowth(1);
      const home = this.scene.nearPedestals[i].clone();
      model.group.position.copy(home);
      // Facing the water, which is the way they are going and the way the
      // queen is looking. Unturned they face the camera, so the three of them
      // stood with their backs to the errand.
      model.group.rotation.y = FACING_ACROSS;
      this.scene.group.add(model.group);
      this.babies.push({
        model,
        state: "waiting",
        home,
        perch: this.scene.farPedestals[i].clone(),
        time: 0,
        from: new THREE.Vector3(),
      });
    }

    ctx.hud.setBanner(this.name);
    ctx.hud.setObjective(
      "Lead each baby across the streams, then go back for the next.",
    );
    ctx.hud.setCounters([
      {
        key: "babies",
        label: "Babies",
        color: P.frog,
        value: 0,
        target: I.babies,
      },
    ]);
  }

  exit(ctx: GameContext): void {
    ctx.hopButtons.setVisible(false);
    ctx.hud.setCallout(null);
    ctx.islands.remove(this.scene.group);
    this.scene.dispose();
    ctx.bee.scripted = false;
    ctx.bee.setScale(1);
    ctx.bee.setCrown(false);
  }

  /**
   * Another go, without losing the babies already across.
   *
   * The level is five crossings. Sending her back to the near bank with an
   * empty far side after a mistake on the last leg is more than a child will
   * sit through twice, so what is already done stays done: every baby on a far
   * pedestal stays on it, and she starts the go from the bank she was working
   * from. Caught on the way back for the next one, she restarts at the far
   * bank — the trip she died on is the trip she repeats, and no more.
   *
   * The one thing that is given back is the baby she was carrying: it never
   * arrived, so it goes home to its own pedestal and waits to be fetched
   * again.
   */
  retry(ctx: GameContext): void {
    // First, and the reason for the comment: the Game shows the try-again
    // card on `failed` going from false to true. Leaving it set meant the
    // *second* death raised no card at all — the level went quietly to "done"
    // with the controls locked, and the bee sat frozen half-way through a hop
    // with nothing to tap and nothing said.
    this.failed = false;
    this.complete = false;

    const carried = this.escorting;
    if (carried) {
      carried.state = "waiting";
      carried.model.group.position.copy(carried.home);
      carried.model.group.rotation.y = FACING_ACROSS;
    }
    this.escorting = null;
    this.striker = null;
    this.scene.hideTongue();

    // The bank she was working from: the far one if she was on her way back
    // for the next baby, the near one if she still had one to take over.
    const returning = !carried && this.delivered > 0;
    this.row = returning ? I.streams + 1 : 0;
    this.col = (I.cols - 1) / 2;
    this.hopT = 1;
    this.cell(this.row, this.col, tmp);
    ctx.bee.teleport(tmp);
    const facing = returning ? 0 : FACING_ACROSS;
    ctx.bee.setYaw(facing);
    this.seedTrail(this.row, facing);

    this.phase = "playing";
    this.phaseTime = 0;
    ctx.hopButtons.setVisible(true);
    ctx.hopButtons.clear();
    ctx.hud.setCallout(
      returning ? "Go back for the next one!" : "Take her across!",
    );
    ctx.hud.setCount("babies", this.delivered, I.babies);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    // Above every phase's early return: the water runs whatever the camera is
    // doing, so the opening shot shows a board already in motion, and the
    // brood is ticked wherever it is — a baby frozen mid-dance because the
    // level moved on to another phase is exactly the kind of thing the Game
    // has been caught by before.
    this.scene.update(dt);
    this.dropCrumb(ctx, dt);
    this.updateBabies(dt);

    switch (this.phase) {
      case "waiting":
        this.updateWaiting(ctx);
        break;
      case "rising":
        this.updateRising(ctx);
        break;
      case "playing":
        this.updatePlaying(dt, ctx);
        break;
      case "delivering":
        this.updateDelivering(ctx);
        break;
      case "struck":
        this.updateStruck(ctx);
        break;
      case "won":
        this.updateWon(dt, ctx);
        break;
      case "done":
        break;
    }
  }

  // ---- the opening --------------------------------------------------------

  private updateWaiting(ctx: GameContext): void {
    ctx.setCameraCinematic(fromEye, fromLook);
    if (this.phaseTime >= I.waitTime) {
      this.phase = "rising";
      this.phaseTime = 0;
    }
  }

  /** Up and over, from behind her shoulder to looking down at the board. */
  private updateRising(ctx: GameContext): void {
    const t = ease(Math.min(1, this.phaseTime / I.riseTime));
    this.boardShot(ctx, eye, look);
    blend.copy(fromEye).lerp(eye, t);
    blendLook.copy(fromLook).lerp(look, t);
    ctx.setCameraCinematic(blend, blendLook);
    if (t >= 1) {
      this.phase = "playing";
      this.phaseTime = 0;
      ctx.hopButtons.setVisible(true);
      ctx.hopButtons.clear();
      ctx.hud.setCallout("Tap the arrows to hop!");
    }
  }

  /**
   * Where the camera stands to see the whole board.
   *
   * The whole of it, deliberately: this is a game about a gap four squares
   * away arriving in three seconds, and a shot that only showed the row she is
   * on would hide the entire decision.
   */
  private boardShot(
    ctx: GameContext,
    outEye: THREE.Vector3,
    outLook: THREE.Vector3,
  ): void {
    // From the near pedestals to the far ones, so both ends of the errand are
    // in shot: the brood still waiting and the ones already saved.
    const near = this.scene.rowZ(-1);
    const far = this.scene.rowZ(I.streams + 2);
    // Aimed short of the middle, which lifts the whole board up the screen and
    // leaves the bottom of the glass to the buttons — see ISLANDS.boardLift.
    outLook.set(0, 0, (near + far) / 2 + (near - far) * I.boardLift);
    const half = Math.max(((I.cols + 1) / 2) * I.square, (near - far) / 2);
    outEye.copy(ctx.framedCameraEye(outLook, half, I.boardPitch, I.boardFill));
  }

  // ---- play ---------------------------------------------------------------

  private updatePlaying(dt: number, ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);

    // The big button is whichever way she is trying to go: out with a baby, or
    // back across for the next one. There is never a third answer.
    ctx.hopButtons.setForward(this.escorting ? "up" : "down");

    // A hop in the air finishes before another is taken, so she can never be
    // between two squares in two directions at once.
    if (this.hopT < 1) {
      this.hopT = Math.min(1, this.hopT + dt / I.hopTime);
      this.placeAlongHop(ctx);
    } else {
      const hop = ctx.hopButtons.take();
      if (hop) {
        this.startHop(hop, ctx);
      }
    }

    // Reaching a bank is tested before the strike: arriving on the same frame
    // as a tongue counts as having got there.
    //
    // Only once the hop has landed, though. `row` is set the moment a hop
    // begins, so testing it alone declared her arrived while she was still
    // physically over the last stream — and the delivery then held her there,
    // hovering above the water, for the whole of the baby's dance. Play
    // resumed with a frog arriving exactly where she had been parked, which
    // is why every attempt died with one baby across.
    if (this.hopT >= 1) {
      if (this.row > I.streams && this.escorting) {
        this.deliver(ctx);
        return;
      }
      if (this.row === 0 && !this.escorting && this.delivered < I.babies) {
        this.collect(ctx);
      }
    }

    const striker = this.threat(ctx);
    if (striker) {
      this.striker = striker;
      this.phase = "struck";
      this.phaseTime = 0;
      ctx.hopButtons.setVisible(false);
      ctx.hud.setCallout(null);
      ctx.audio.sting();
    }
  }

  /**
   * Whatever on the board has her, or null.
   *
   * Distance rather than squares: she spends a fifth of every hop between two
   * of them, and a test that only looked at whole squares would let her pass
   * through a frog as long as she didn't stop on it.
   */
  private threat(ctx: GameContext): Rider | null {
    const bee = ctx.bee.position;
    for (const rider of this.scene.riders) {
      // Same stream: her middle inside the band of water this one rides.
      if (Math.abs(bee.z - this.scene.rowZ(rider.lane)) > I.square / 2) {
        continue;
      }
      const dx = bee.x - rider.x * I.square;
      if (rider.kind === "gator") {
        // The whole animal, either end of it.
        if (Math.abs(dx) <= rider.reach * I.square) {
          return rider;
        }
        continue;
      }
      // A frog only catches what is in front of it: the tongue comes out of
      // its face, and every one of them faces the way its stream runs. Behind
      // one is the safest square on the board, and being able to ride along
      // just behind a frog is worth knowing — it is the one thing here that
      // rewards watching rather than waiting.
      const ahead = dx * Math.sign(rider.speed);
      if (
        ahead >= -I.behindSlack * I.square &&
        ahead <= rider.reach * I.square
      ) {
        return rider;
      }
    }
    return null;
  }

  // ---- the brood ----------------------------------------------------------

  /**
   * Lay a square and a half of route behind her before she has flown any.
   *
   * Without it the first baby has nowhere to tuck in: the trail is a single
   * point, so "a square back along it" is the square she is standing on, and
   * the baby appears inside her.
   */
  private seedTrail(row: number, facing: number): void {
    this.trail.length = 0;
    this.trailTime = 0;
    this.cell(row, (I.cols - 1) / 2, tmp);
    // Behind her means behind whichever way she is looking.
    const back = facing === FACING_ACROSS ? 1 : -1;
    const span = I.followBehind * 1.5 * I.square;
    for (let i = 6; i >= 0; i--) {
      this.trail.push({
        along: ((6 - i) * span) / 6,
        pos: new THREE.Vector3(tmp.x, tmp.y, tmp.z + (i / 6) * span * back),
      });
    }
  }

  /** Remember where she is, and forget the route she has long since left. */
  private dropCrumb(ctx: GameContext, dt: number): void {
    this.trailTime += dt;
    const last = this.trail[this.trail.length - 1];
    const step = last ? last.pos.distanceTo(ctx.bee.position) : 0;
    // Standing still adds nothing to the route, so the trail behind her keeps
    // its length and the baby holds its square rather than closing on her.
    if (last && step < 1e-4) {
      return;
    }
    this.trail.push({
      along: (last?.along ?? 0) + step,
      pos: ctx.bee.position.clone(),
    });
    const total = this.trail[this.trail.length - 1].along;
    const keep = I.followBehind * I.square * 2;
    while (this.trail.length > 2 && total - this.trail[0].along > keep) {
      this.trail.shift();
    }
  }

  /** A square back along the route she took: where the baby belongs. */
  private trailPoint(out: THREE.Vector3): THREE.Vector3 {
    if (this.trail.length === 0) {
      return out.set(0, I.flightHeight, 0);
    }
    const want =
      this.trail[this.trail.length - 1].along - I.followBehind * I.square;
    for (let i = this.trail.length - 1; i > 0; i--) {
      const b = this.trail[i];
      const a = this.trail[i - 1];
      if (a.along <= want && want <= b.along) {
        const span = b.along - a.along;
        return out
          .copy(a.pos)
          .lerp(b.pos, span > 0 ? (want - a.along) / span : 1);
      }
    }
    return out.copy(this.trail[0].pos);
  }

  /** The next baby leaves its pedestal and tucks in behind her. */
  private collect(ctx: GameContext): void {
    const baby = this.babies[I.babyOrder[this.delivered]];
    if (!baby || baby.state !== "waiting") {
      return;
    }
    baby.state = "joining";
    baby.time = 0;
    baby.from.copy(baby.model.group.position);
    this.escorting = baby;
    ctx.hud.setCallout("Take her across!");
    ctx.audio.collect(1);
  }

  /** She has got one over: it dances, then goes to wait on a far pedestal. */
  private deliver(ctx: GameContext): void {
    const baby = this.escorting;
    if (!baby) {
      return;
    }
    baby.state = "dancing";
    baby.time = 0;
    this.phase = "delivering";
    this.phaseTime = 0;
    this.delivered++;
    this.escorting = null;
    ctx.hopButtons.setVisible(false);
    ctx.hud.setCount("babies", this.delivered, I.babies, true);
    ctx.hud.setCallout(
      this.delivered < I.babies ? "Now go back for the next one!" : null,
    );
    ctx.audio.quotaComplete();
  }

  /**
   * Move whatever each baby is doing along.
   *
   * None of this is ever tested against a frog or an alligator: a baby is
   * scenery with a story, and the only thing on the board that can be caught
   * is the queen. A child watching a baby drift through a stream full of
   * tongues has to be able to trust that.
   */
  private updateBabies(dt: number): void {
    for (const baby of this.babies) {
      baby.time += dt;
      const g = baby.model.group;
      switch (baby.state) {
        case "waiting":
        case "parked":
          // Sitting still, but alive: a small wing-shuffle on the spot.
          baby.model.animate(this.trailTime, 0.25);
          break;
        case "joining": {
          const t = Math.min(1, baby.time / I.joinTime);
          this.trailPoint(tmp);
          tmp.y = I.flightHeight - I.babyDrop;
          g.position.copy(baby.from).lerp(tmp, ease(t));
          baby.model.animate(this.trailTime, 1);
          if (t >= 1) {
            baby.state = "following";
          }
          break;
        }
        case "following": {
          this.trailPoint(tmp);
          // Its own height, not hers. The trail carries the arc of every hop
          // she has taken, so a baby that took its height from it rose with
          // her and sat level with her tail rather than under it. She hops
          // over it; it flies straight along beneath.
          tmp.y = I.flightHeight - I.babyDrop;
          // The slight delay: it closes on the square rather than appearing
          // on it, so it swings into each hop a beat after she does.
          tmp.lerp(g.position, Math.exp(-dt / I.followEase));
          // Facing the way it is going, taken from the move it just made. A
          // still baby keeps the heading it had, or it would snap to due north
          // every time the queen stops.
          tmpB.copy(tmp).sub(g.position).setY(0);
          if (tmpB.lengthSq() > 1e-4) {
            g.rotation.y = Math.atan2(tmpB.x, tmpB.z);
          }
          g.position.copy(tmp);
          baby.model.animate(this.trailTime, 1);
          break;
        }
        case "dancing": {
          // The dance, and then the flight to its own pedestal, which run one
          // after the other off the same clock.
          if (baby.time <= I.danceTime) {
            const t = baby.time / I.danceTime;
            g.rotation.y = t * Math.PI * 2 * I.danceSpins;
            this.trailPoint(tmp);
            g.position.set(
              tmp.x,
              I.flightHeight -
                I.babyDrop +
                Math.abs(Math.sin(t * Math.PI * 4)) * I.danceBob,
              tmp.z,
            );
            baby.model.animate(this.trailTime, 1);
            if (baby.time + dt > I.danceTime) {
              baby.from.copy(g.position);
            }
            break;
          }
          const t = Math.min(1, (baby.time - I.danceTime) / I.settleTime);
          g.position.copy(baby.from).lerp(baby.perch, ease(t));
          // Up and over, so it arcs onto the pedestal rather than sliding to it.
          g.position.y += Math.sin(Math.PI * t) * 1.4;
          g.rotation.y = Math.PI * 2 * I.danceSpins * (1 - t);
          baby.model.animate(this.trailTime, 1);
          if (t >= 1) {
            g.position.copy(baby.perch);
            g.rotation.y = 0;
            baby.state = "parked";
          }
          break;
        }
      }
    }
  }

  /** The dance and the settle, with the board still running underneath. */
  private updateDelivering(ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);
    const busy = this.babies.some(b => b.state === "dancing");
    if (busy) {
      return;
    }
    if (this.delivered >= I.babies) {
      this.win(ctx);
      return;
    }
    // Back to it: she still has to get home for the next one.
    this.phase = "playing";
    this.phaseTime = 0;
    ctx.hopButtons.setVisible(true);
    ctx.hopButtons.clear();
  }

  private startHop(hop: Hop, ctx: GameContext): void {
    const row = this.row + (hop === "up" ? 1 : hop === "down" ? -1 : 0);
    const col = this.col + (hop === "right" ? 1 : hop === "left" ? -1 : 0);
    // The edges of the board are walls, not deaths — a hop into one is simply
    // not taken. Being killed by the scenery for pressing a button that was
    // there to be pressed is the kind of thing that makes a child stop.
    if (row < 0 || row > I.streams + 1 || col < 0 || col > I.cols - 1) {
      return;
    }
    this.cell(this.row, this.col, this.hopFrom);
    this.cell(row, col, this.hopTo);
    this.row = row;
    this.col = col;
    this.hopT = 0;
    // The first hop is the one that says the buttons work.
    ctx.hud.setCallout(null);
    // Facing the way she is going, which on a board seen from above is the
    // only thing telling you which end of her is the front.
    ctx.bee.setYaw(
      hop === "up"
        ? FACING_ACROSS
        : hop === "down"
          ? 0
          : hop === "left"
            ? -Math.PI / 2
            : Math.PI / 2,
    );
    ctx.audio.collect(0);
  }

  /** Along the hop, and over it: a flat slide reads as a drag, not a hop. */
  private placeAlongHop(ctx: GameContext): void {
    tmp.copy(this.hopFrom).lerp(this.hopTo, this.hopT);
    tmp.y += Math.sin(Math.PI * this.hopT) * I.hopArc;
    ctx.bee.teleport(tmp);
  }

  /** The middle of a square, at flying height. */
  private cell(row: number, col: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.scene.columnX(col),
      I.flightHeight,
      this.scene.rowZ(row),
    );
  }

  // ---- the two endings ----------------------------------------------------

  private updateStruck(ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);
    if (!this.striker) {
      return;
    }
    // Eased hard out of the frog: a tongue is flicked, not extended.
    const t = Math.min(1, this.phaseTime / I.strikeReach);
    const out = 1 - (1 - t) * (1 - t) * (1 - t);
    // An alligator gets the lunge and no tongue: it hasn't got one, and it
    // doesn't need one — it caught her in its mouth.
    if (this.striker.kind === "gator") {
      this.scene.lunge(this.striker, out);
    } else {
      this.scene.strike(this.striker, ctx.bee.position, out);
    }
    if (this.phaseTime >= I.strikeReach + I.strikeHold) {
      this.scene.hideTongue();
      this.phase = "done";
      this.failed = true;
    }
  }

  private win(ctx: GameContext): void {
    // Getting the whole brood across is what opens the Ant Hunt, the other
    // level on these islands; the map comes up with it already selected.
    ctx.save.mutate(d => {
      d.level = 8;
    });
    this.phase = "won";
    this.phaseTime = 0;
    this.bursts = 0;
    this.nextBurst = 0;
    this.hopT = 1;
    ctx.hopButtons.setVisible(false);
    ctx.hud.setCallout(null);
    ctx.hud.setCount("streams", I.streams, I.streams, true);
  }

  private updateWon(dt: number, ctx: GameContext): void {
    this.boardShot(ctx, eye, look);
    ctx.setCameraCinematic(eye, look);
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && this.bursts < I.winBursts) {
      this.nextBurst = I.winBurstEvery;
      this.bursts++;
      tmp.copy(ctx.bee.position);
      tmp.x += (this.bursts % 2 === 0 ? 1 : -1) * this.bursts * I.square * 0.35;
      tmp.y += 1.5 + this.bursts * 0.3;
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 26,
        speed: 9,
        spherical: 1,
        ttl: 1.5,
        size: 0.8,
      });
      ctx.audio.levelComplete();
    }
    if (this.bursts >= I.winBursts && this.nextBurst <= 0) {
      this.phase = "done";
      this.complete = true;
    }
  }
}
