import * as THREE from "three";
import {BEAR, CAMERA, COTTAGE, DANCE, FLIGHT, WORLD} from "../config";
import {DanceMat} from "../entities/danceMat";
import type {Music} from "../core/music";
import {Rng} from "../core/rng";
import {FIREWORK_PALETTE} from "../../../shared/particles";
import type {GameContext, Level} from "./level";

const CELEBRATION_TIME = 2.8;
/** Where the bee waits between hops, above the centre pad. */
const CENTRE_PAD = 4;

/**
 * The establishing shot: a slow sweep past the cottage before the game starts.
 *
 * A quadratic Bezier for the eye — the control point pushes the path up and
 * back so it arcs around the house rather than sliding along a straight line —
 * and a straight lerp for what it's looking at, from the cottage down to the
 * mat. It ends exactly where the follow rig wants to be, so handing control
 * back is invisible.
 *
 * The three points below are relative to the house; the clearing itself stands
 * away at COTTAGE.yardOffsetZ, so they're shifted by `YARD` when used.
 */
const PAN_TIME = 4.6;
const PAN_FROM = new THREE.Vector3(-42, 24, 16);
const PAN_CONTROL = new THREE.Vector3(-14, 40, 54);
const PAN_LOOK_FROM = new THREE.Vector3(0, 17, 0);

/**
 * Coming back out of the cottage with the honey.
 *
 * It is one open space, so there is no cut and no wash: she flies out of the
 * same opening she flew in through, jar swinging under her, and the shot arcs in
 * and lands exactly where the chase rig wants to sit, so handing control back is
 * invisible — the same trick the establishing pan above plays.
 */
/** Her flight from the opening out over the mat. */
const EMERGE_FLY = 3.4;
/** The whole shot. The tail is the bear finishing its walk into frame. */
const EMERGE_TIME = 5.4;
/**
 * The wide shot, relative to the centre of the mat: out in the yard, off to
 * one side and high enough to hold the roof, looking back at the door.
 *
 * It has to stand well back. The house is 36 units to the ridge and about as
 * wide, so anything nearer than about 60 crops it — at 66 it sits in half the
 * frame with the mat in the foreground, which is the shot.
 */
const EMERGE_FROM = new THREE.Vector3(-32, 22, 30);
/** Pushes the arc up and around the front of the house rather than across it. */
const EMERGE_CONTROL = new THREE.Vector3(-26, 30, 4);

/** The clearing's offset from the world origin. */
const YARD = new THREE.Vector3(0, 0, COTTAGE.yardOffsetZ);

type Phase =
  | "establishing"
  | "arriving"
  | "dancing"
  | "opening"
  | "entering"
  | "inside"
  | "carrying"
  | "emerging"
  | "chased"
  | "delivering"
  | "distracting"
  | "puzzling"
  | "scaring"
  | "celebrating"
  | "done";

/**
 * Half the width of the 3x3 board, from the pads themselves — three across
 * with two gaps between them. Derived rather than written down so it can't
 * drift out of step with the mat that gets built.
 */
const MAT_HALF_WIDTH = (3 * DANCE.padSize + 2 * DANCE.padGap) / 2;

/** The phases spent flying the lane between the yard and the hive. */
const HOMEWARD_PHASES: ReadonlySet<Phase> = new Set<Phase>([
  "emerging",
  "chased",
  "delivering",
]);

/**
 * The phases played to the parked shot on the mat. Once the dance is passed the
 * camera leaves this shot for the fly-in behind her (see updateEnterCamera), so
 * "opening" and "entering" are not here.
 */
const MAT_PHASES: ReadonlySet<Phase> = new Set<Phase>(["arriving", "dancing"]);

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpMob = new THREE.Vector3();
const tmpOrbit = new THREE.Vector3();
const panEye = new THREE.Vector3();
const boardEye = new THREE.Vector3();
const panLook = new THREE.Vector3();

/**
 * Level 4, stage 1 — the dance mat at Caramel Cottage.
 *
 * The cottage door is locked. A 3x3 mat sits in front of it; the bee hovers
 * over the middle square and the eight around it light up on the beat. Tap each
 * one before it goes dark. Land 90% and the door opens.
 *
 * Prompt timing comes from the audio clock, not frame deltas, so the pads stay
 * locked to the music. If audio was never unlocked the level still plays — it
 * falls back to its own clock and simply runs silent.
 */
export class CottageLevel implements Level {
  readonly name = "Caramel Cottage";
  readonly completionTitle = "The hive is safe!";
  readonly completionBody =
    "You danced the door open, carried the honey home, and sent that bear packing. Some day for a small bee.";

  complete = false;

  private phase: Phase = "arriving";
  private phaseTime = 0;
  /** Seconds of fallback musical time when there's no audio context. */
  private silentTime = 0;
  private nextFirework = 0;

  /** True once the brood has poured out of the hive to tease the bear. */
  private babiesOut = false;
  /** Bearing of the circling camera while the bear is reared up. */
  private orbit = 0;

  private mat: DanceMat | null = null;
  private music: Music | null = null;
  private rounds = 0;

  /** The hop out to a tapped pad and back. */
  private hop: {from: THREE.Vector3; to: THREE.Vector3; t: number} | null =
    null;
  private readonly hover = new THREE.Vector3();
  /** Where the follow rig will sit once a scripted shot ends. */
  private readonly panTo = new THREE.Vector3();
  /** Where in the room she was when she turned for the door. */
  private readonly exitFrom = new THREE.Vector3();
  /** The eased eye and target of the fly-in shot behind her; see onRoundFinished. */
  private readonly enterEye = new THREE.Vector3();
  private readonly enterLook = new THREE.Vector3();

  get controlsLocked(): boolean {
    // Stage 1 is tapped rather than flown; stage 2 hands flight back.
    return (
      this.phase !== "inside" &&
      this.phase !== "carrying" &&
      this.phase !== "chased"
    );
  }

  /**
   * Leaving mid-round — the menu, or replaying the level — has to take the
   * music with it. The Game builds a fresh level object every switch, so
   * anything this one started is otherwise orphaned and keeps playing
   * underneath its replacement, half a bar out.
   */
  exit(): void {
    this.music?.stop();
    this.music = null;
    this.mat?.reset();
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment("cottage");
    ctx.configureFlight({
      // Bounds are a circle about the world origin — which is the hive, not the
      // cottage. It has to be wide enough to hold the clearing off at the north
      // end, or the bee is shoved out of her own level.
      boundsRadius: COTTAGE.flightRadius,
      minHeight: COTTAGE.minHeight,
      maxHeight: COTTAGE.maxHeight,
      cameraDistance: COTTAGE.cameraDistance,
      cameraHeight: COTTAGE.cameraHeight,
    });
    ctx.setFlightControls(false);
    ctx.setObjectiveMarker(null);

    this.hover.copy(ctx.cottage.padCentres[CENTRE_PAD]).setY(DANCE.hoverHeight);

    // Arrive from out in the clearing, facing the cottage.
    const start = new THREE.Vector3().copy(this.hover).add(tmpB.set(0, 1.4, 9));
    // Facing the house, i.e. down -Z, which puts the camera in front of her
    // on +Z — the side the locked-off mat shot watches from.
    ctx.placeBee(start, DANCE.hoverHeight + 1.4, Math.PI);
    ctx.bee.setCrown(true);
    ctx.bee.scripted = true;
    ctx.bee.setYaw(Math.PI); // face the door, which is at -Z of the mat

    ctx.hud.setBanner(this.name);
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
    ctx.hud.setObjective("Caramel Cottage…");

    this.phase = "establishing";
    this.phaseTime = 0;
    this.silentTime = 0;
    this.rounds = 0;
    this.complete = false;
    this.hop = null;
    this.babiesOut = false;
    this.mat = null;
    // Belt and braces: entering is a fresh start, whatever came before.
    this.music?.stop();
    this.music = null;

    ctx.hud.setCounters([
      {
        key: "dance",
        label: "Steps",
        color: 0xffd75e,
        value: 0,
        target: DanceMat.totalPads,
      },
    ]);
  }

  /**
   * The parked shot over the mat, held while she dances.
   *
   * Recomputed each frame rather than once, so a rotate or a resize re-fits it —
   * the position it returns is fixed for a given screen, so it's still a camera
   * that doesn't move. Once the dance is passed the shot leaves the mat for the
   * fly-in behind her; see updateEnterCamera.
   */
  private holdMatCamera(ctx: GameContext): void {
    const {matCentre} = ctx.cottage;
    // Copied: framedCameraEye hands back a shared vector.
    boardEye.copy(
      ctx.framedCameraEye(
        matCentre,
        MAT_HALF_WIDTH,
        DANCE.cameraPitch,
        DANCE.boardFill,
      ),
    );
    ctx.setCameraCinematic(boardEye, matCentre);
  }

  /**
   * The fly-in, once the dance is passed: pull the shot out and drop it behind
   * the bee, looking forward and down at the cottage, then hold that station
   * behind her as she flies through the opening — so the house fills the view
   * she's heading into rather than being watched from the side.
   *
   * Eased toward each frame from wherever the dance shot ended (set in
   * onRoundFinished), which turns the change into a move, and the last position
   * it settles on is close to where the interior follow rig wants to sit, so
   * `beginInside` hands control back with barely a glide.
   */
  private updateEnterCamera(dt: number, ctx: GameContext): void {
    const bee = ctx.bee.position;
    const E = COTTAGE.enterCam;
    // Eye behind and above her; target ahead of her and a touch down.
    tmp.copy(bee);
    tmp.y += E.up;
    tmp.z += E.back;
    panLook.copy(bee);
    panLook.y += E.lookY;
    panLook.z -= E.ahead;
    const k = 1 - Math.exp(-E.rate * dt);
    this.enterEye.lerp(tmp, k);
    this.enterLook.lerp(panLook, k);
    ctx.setCameraCinematic(this.enterEye, this.enterLook);
  }

  /**
   * How far off the lane's centre line she may be at this z.
   *
   * The widest of three: the lane itself, the yard she is leaving, and the
   * meadow she is heading for. Taking the largest makes the ends open out on
   * their own — deep in the clearing the yard's disc is wider than the lane,
   * and near the hive the meadow's is — so there is no seam where the corridor
   * meets either end.
   */
  private laneAllowance(z: number): number {
    const disc = (radius: number, offset: number): number =>
      Math.sqrt(Math.max(0, radius * radius - offset * offset));
    return Math.max(
      COTTAGE.laneHalfWidth,
      disc(COTTAGE.clearingRadius, z - COTTAGE.yardOffsetZ),
      disc(WORLD.radius, z),
    );
  }

  /** Hold her in the lane on the way home. See COTTAGE.laneHalfWidth. */
  private confineToLane(ctx: GameContext): void {
    const p = ctx.bee.position;
    // Only north of the hive: past it she is home and the level has her.
    if (p.z > 0) {
      return;
    }
    const allowed = this.laneAllowance(p.z);
    if (Math.abs(p.x) <= allowed) {
      return;
    }
    p.x = Math.sign(p.x) * allowed;
    // Shed the speed she was carrying into it, so holding the stick at the
    // treeline is a slide along it rather than a grind.
    ctx.bee.velocity.x *= 0.4;
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    this.updateHop(dt, ctx);

    // While she flies the room the shot can end up shoved through a wall — she's
    // up against it, facing away, and the boom has nowhere to go. Fade whatever
    // stands between the eye and her, the way the Windy Woods fades its hedges.
    // Every other phase leaves the house solid.
    if (this.phase === "inside" || this.phase === "carrying") {
      ctx.cottage.setWallFade(ctx.cameraPosition, ctx.bee.position);
    } else {
      ctx.cottage.setWallFade(null, ctx.bee.position);
    }

    // The run home is a corridor, not the open meadow.
    if (HOMEWARD_PHASES.has(this.phase)) {
      this.confineToLane(ctx);
    }

    // Arriving and dancing are played to the one parked shot over the mat.
    if (MAT_PHASES.has(this.phase)) {
      this.holdMatCamera(ctx);
    }
    // Once the dance is passed the shot pulls out and drops behind her, so the
    // cottage fills the view ahead as she flies in. `beginInside`'s
    // configureFlight hands the follow rig back from here.
    if (this.phase === "opening" || this.phase === "entering") {
      this.updateEnterCamera(dt, ctx);
    }
    // Once the brood is out it flies itself, in every phase from here on —
    // without this they simply hang in the hive doorway where they hatched.
    if (this.babiesOut) {
      ctx.babies.update(dt, ctx.bee.position, null);
    }

    switch (this.phase) {
      case "establishing":
        this.updateEstablishing(ctx);
        break;
      case "arriving":
        this.updateArrival(ctx);
        break;
      case "dancing":
        this.updateDance(dt, ctx);
        break;
      case "opening":
        // A beat for the shot to pull out behind her before she flies in.
        if (this.phaseTime > 1.4) {
          this.phase = "entering";
          this.phaseTime = 0;
          ctx.hud.setObjective("In you go!");
        }
        break;
      case "entering":
        this.updateEntering(ctx);
        break;
      case "inside":
        this.updateInside(ctx);
        break;
      case "carrying":
        this.updateCarrying(ctx);
        break;
      case "emerging":
        this.updateEmerging(dt, ctx);
        break;
      case "chased":
        this.updateChase(dt, ctx);
        break;
      case "delivering":
        this.updateDelivering(dt, ctx);
        break;
      case "distracting":
        this.updateDistracting(dt, ctx);
        break;
      case "puzzling":
        this.updatePuzzling(dt, ctx);
        break;
      case "scaring":
        this.updateScaring(dt, ctx);
        break;
      case "celebrating":
        this.updateCelebration(dt, ctx);
        break;
      case "done":
        break;
    }
  }

  /** Sweep past the cottage and settle into the shot the mat is played on. */
  private updateEstablishing(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / PAN_TIME);
    const u = ease(t);

    // Quadratic Bezier from PAN_FROM through PAN_CONTROL to where the locked
    // shot stands, so the sweep arrives exactly on it and stops — no cut, and
    // nothing left for a spring to glide out afterwards.
    this.panTo.copy(
      ctx.framedCameraEye(
        ctx.cottage.matCentre,
        MAT_HALF_WIDTH,
        DANCE.cameraPitch,
        DANCE.boardFill,
      ),
    );
    const inv = 1 - u;
    panEye
      .copy(PAN_FROM)
      .add(YARD)
      .multiplyScalar(inv * inv)
      .addScaledVector(tmp.copy(PAN_CONTROL).add(YARD), 2 * inv * u)
      .addScaledVector(this.panTo, u * u);

    panLook.lerpVectors(
      tmp.copy(PAN_LOOK_FROM).add(YARD),
      ctx.cottage.matCentre,
      ease(Math.max(0, t * 1.35 - 0.35)),
    );
    ctx.setCameraCinematic(panEye, panLook);

    if (t < 1) {
      return;
    }

    this.phase = "arriving";
    this.phaseTime = 0;
    ctx.hud.setObjective("The door is locked… what is that mat for?");
  }

  /** Fly in and settle over the centre pad, then start the music. */
  private updateArrival(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.8);
    ctx.bee.position.lerpVectors(
      tmp.copy(this.hover).add(tmpB.set(0, 1.4, 9)),
      this.hover,
      ease(t),
    );
    if (t < 1) {
      return;
    }

    this.phase = "dancing";
    this.phaseTime = 0;
    this.beginRound(ctx);
  }

  private beginRound(ctx: GameContext): void {
    this.rounds++;
    this.mat?.reset();
    // A fresh pattern each attempt, so a retry isn't the same round again.
    this.mat = new DanceMat(
      ctx.cottage.pads,
      ctx.cottage.padColours,
      new Rng(0x51ce5 + this.rounds * 7919),
    );
    this.silentTime = 0;

    // Never start a second track over the first.
    this.music?.stop();
    this.music = ctx.audio.createMusic(DANCE.bpm);
    this.music?.start();

    ctx.hud.setCount("dance", 0, DanceMat.totalPads);
    ctx.hud.setObjective("Tap each square as it lights up!");
  }

  private updateDance(dt: number, ctx: GameContext): void {
    if (!this.mat) {
      return;
    }
    this.silentTime += dt;

    // Musical position.
    //
    // The frame clock leads, and we ease it toward the audio clock. Neither
    // works alone: frame deltas drift off the track within a few bars, while
    // the audio clock is wrong in both directions — it keeps running when the
    // simulation is paused or backgrounded (arriving back to find the whole
    // round expired), and it *stops* running if the context is suspended
    // (which would stall the level forever). Leading with dt means the game
    // always advances; the correction keeps the pads on the beat when audio is
    // healthy, and a big divergence re-anchors the track instead of the game.
    const spb = 60 / DANCE.bpm;
    let beats = this.silentTime / spb;

    if (this.music) {
      const drift = this.music.beats - beats;
      if (Math.abs(drift) < 0.5) {
        beats += drift * 0.1;
        this.silentTime = beats * spb;
      } else {
        this.music.rebase(beats);
      }
    }

    this.mat.update(beats, dt);

    // A tap on a pad counts for whichever pad it hit.
    const hitObject = ctx.pickTap(ctx.cottage.pads);
    if (hitObject) {
      const pad = ctx.cottage.pads.indexOf(hitObject as THREE.Mesh);
      if (pad >= 0 && this.mat.tap(pad)) {
        this.startHop(ctx, pad);
      }
    }

    for (const event of this.mat.events.splice(0)) {
      switch (event.type) {
        case "lit":
          ctx.audio.collect(0);
          break;
        case "hit":
          ctx.audio.collect(3);
          ctx.puff.burst(
            tmp.copy(ctx.cottage.padCentres[event.pad]).setY(0.5),
            {
              color: [0xffe066, 0xfff3c4, 0x9be36b],
              count: 12,
              speed: 1.8,
              ttl: 0.6,
              spherical: 1,
            },
          );
          ctx.hud.setCount("dance", this.mat.hits, this.mat.total, true);
          break;
        case "miss":
          ctx.hud.setCount("dance", this.mat.hits, this.mat.total);
          break;
        case "stepUp":
          ctx.hud.setObjective("Two at a time now!");
          break;
        case "finished":
          this.onRoundFinished(ctx, event.passed);
          break;
      }
    }
  }

  private onRoundFinished(ctx: GameContext, passed: boolean): void {
    this.music?.stop();
    this.music = null;
    this.mat?.reset();

    if (!passed) {
      // No failing in this game — just go again, with a fresh pattern.
      const scored = this.mat ? Math.round(this.mat.ratio * 100) : 0;
      ctx.hud.setObjective(`${scored}% — so close! Let's try that again`);
      this.phase = "arriving";
      // Skip the fly-in; she's already on the mat.
      this.phaseTime = 1.8;
      return;
    }

    this.phase = "opening";
    this.phaseTime = 0;
    ctx.audio.levelComplete();
    ctx.flashScreen();
    ctx.hud.setObjective("You did it! In you go…");
    // Start the fly-in shot from wherever the dance camera left off, so pulling
    // out and dropping behind her reads as a move rather than a cut.
    this.enterEye.copy(ctx.cameraPosition);
    this.enterLook.copy(ctx.cottage.matCentre);
  }

  /** Fly in through the wide opening; then hand control back inside. */
  private updateEntering(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.8);
    // Straight in from the mat to just inside the opening — it is one space now,
    // so no shrink into a doorway and no cut to a separate room.
    ctx.bee.position.lerpVectors(
      this.hover,
      ctx.cottage.entryPosition,
      ease(t),
    );
    ctx.bee.setYaw(Math.PI); // heading in, i.e. down -Z into the house
    if (t < 1) {
      return;
    }

    this.beginInside(ctx);
  }

  // ---- stage 2: inside the cottage ---------------------------------------

  /** Hand control back and let the player fly to the mantel for the honey. */
  private beginInside(ctx: GameContext): void {
    this.phase = "inside";
    this.phaseTime = 0;

    // No scene swap — the same open-fronted model is the room. Just tighten the
    // flight to a small disc about the house and pull the camera in.
    ctx.configureFlight({
      boundsRadius: COTTAGE.interior.boundsRadius,
      boundsCentre: new THREE.Vector3(0, 0, COTTAGE.yardOffsetZ),
      minHeight: COTTAGE.interior.minHeight,
      maxHeight: COTTAGE.interior.maxHeight,
      cameraDistance: COTTAGE.interior.cameraDistance,
      cameraHeight: COTTAGE.interior.cameraHeight,
    });
    ctx.honeyJar.reset(ctx.cottage.jarRest);
    ctx.cottage.glow.mesh.visible = true;
    // Facing the mantel (down -Z, deeper into the house) so the follow camera
    // sits back by the opening and looks in at the fire, not out at the yard.
    ctx.placeBee(ctx.cottage.entryPosition, COTTAGE.entry.y, Math.PI);
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.scripted = false;
    ctx.setFlightControls(true);

    ctx.hud.setCounters([]);
    ctx.hud.setObjective("Honey! Fly up to the jar on the mantel");
    ctx.setObjectiveMarker(
      tmp.copy(ctx.cottage.jarRest).setY(ctx.cottage.jarRest.y + 2),
    );
  }

  private updateInside(ctx: GameContext): void {
    const jarPos = ctx.cottage.jar.getWorldPosition(tmp);
    if (ctx.bee.position.distanceTo(jarPos) > COTTAGE.interior.pickupRadius) {
      return;
    }

    ctx.honeyJar.pickUp(
      tmpB.copy(ctx.bee.position).setY(ctx.bee.position.y - 0.35),
    );
    // The halo was there to say "come and get this"; it has done its job.
    ctx.cottage.glow.mesh.visible = false;
    ctx.audio.quotaComplete();
    ctx.puff.burst(jarPos, {
      color: [0xffb02e, 0xffe6a8, 0xfff6e8],
      count: 22,
      speed: 2.2,
      ttl: 0.9,
      spherical: 1,
    });
    ctx.setObjectiveMarker(null);
    ctx.hud.setObjective("Got it! Mind how you swing it");
    this.phase = "carrying";
    this.phaseTime = 0;
  }

  /** A moment to enjoy flying with it, then head back out. */
  private updateCarrying(ctx: GameContext): void {
    if (this.phaseTime < 4) {
      return;
    }
    this.beginEmerging(ctx);
    ctx.hud.setObjective("Home with it, then!");
  }

  // ---- stage 3: the bear ---------------------------------------------------

  /**
   * Fly back out through the opening, where the bear is waiting.
   *
   * One space now, so there is no wash and no scene swap: she simply flies out
   * of the same house she flew into, the camera pulls back, the bear lumbers in
   * from the left, and through the gate in the fence the hive is glowing at the
   * far end of the lane home.
   */
  private beginEmerging(ctx: GameContext): void {
    this.phase = "emerging";
    this.phaseTime = 0;

    ctx.configureFlight({
      boundsRadius: COTTAGE.flightRadius,
      minHeight: FLIGHT.minHeight,
      maxHeight: FLIGHT.maxHeight,
      cameraDistance: CAMERA.distance,
      cameraHeight: CAMERA.height,
    });

    // From wherever in the house she happens to be, out through the opening.
    this.exitFrom.copy(ctx.bee.position);
    // She ends the shot over the mat she danced on — dark now, its job done.
    this.mat?.reset();
    this.hover.copy(ctx.cottage.matCentre).setY(DANCE.hoverHeight + 2.5);
    // Where the shot has to land: the chase rig's resting place behind her.
    // Facing the gate is yaw 0, which puts the camera at -Z of her, i.e.
    // between her and the house.
    this.panTo
      .copy(this.hover)
      .add(
        tmpB.set(
          0,
          CAMERA.height * COTTAGE.chaseZoom,
          -CAMERA.distance * COTTAGE.chaseZoom,
        ),
      );

    // Right back: a bear at this scale needs the room, and the gate and the
    // lane beyond it have to be readable from the off.
    ctx.setCameraZoom(COTTAGE.chaseZoom);

    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);
    ctx.bee.setYaw(0); // facing the gate, and home
    ctx.setFlightControls(false);

    // The jar is already on her rope from the mantel; carry it across to the
    // meadow so it stays drawn on the flight home.
    ctx.bringHoney();

    // The hive is the destination and it says so, from this far off.
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(true);
    ctx.setObjectiveMarker(
      tmp.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 1.4),
    );

    // In from the left of shot. The camera looks down +Z, which puts +X on the
    // left — the sign here is not the one you'd guess.
    ctx.bear.spawn(
      tmp
        .copy(ctx.cottage.matCentre)
        .add(tmpB.set(BEAR.ambushOffset * 3, 0, -3)),
      this.hover,
    );

    ctx.hud.setCounters([]);
    ctx.hud.setObjective("A bear!");
    ctx.audio.setThreat(0.4);
  }

  /**
   * She flies out of the opening and the camera arcs in behind her while the
   * bear lumbers into frame.
   */
  private updateEmerging(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);

    // Out of the house to her station over the mat, a quadratic through the
    // opening so she clears the wall rather than cutting the corner of it, then
    // bobbing there while the bear closes in.
    const f = ease(Math.min(1, this.phaseTime / EMERGE_FLY));
    const finv = 1 - f;
    ctx.bee.position
      .copy(this.exitFrom)
      .multiplyScalar(finv * finv)
      .addScaledVector(ctx.cottage.doorway, 2 * finv * f)
      .addScaledVector(this.hover, f * f);
    ctx.bee.position.y += Math.sin(this.phaseTime * 2.2) * 0.25 * f;

    const u = ease(this.phaseTime / EMERGE_TIME);
    const inv = 1 - u;
    panEye
      .copy(EMERGE_FROM)
      .add(ctx.cottage.matCentre)
      .multiplyScalar(inv * inv)
      .addScaledVector(
        tmp.copy(EMERGE_CONTROL).add(ctx.cottage.matCentre),
        2 * inv * u,
      )
      .addScaledVector(this.panTo, u * u);
    // Holds on the opening while she comes out of it, then settles onto her.
    panLook.lerpVectors(
      ctx.cottage.doorway,
      ctx.bee.position,
      ease((this.phaseTime / EMERGE_TIME) * 1.6 - 0.35),
    );
    ctx.setCameraCinematic(panEye, panLook);

    // Long enough for the bear to walk into shot from off to the left.
    if (this.phaseTime < EMERGE_TIME) {
      return;
    }
    ctx.setCameraCinematic(null);
    this.beginChase(ctx);
  }

  /**
   * The flight home. The bear corners badly, the gate is a bottleneck it has
   * to lumber around, and the hive is a long way off.
   */
  private beginChase(ctx: GameContext): void {
    this.phase = "chased";
    this.phaseTime = 0;

    ctx.bee.scripted = false;
    ctx.setFlightControls(true);
    ctx.bear.pursue();

    ctx.hud.setObjective("Through the gate — get the honey home to the hive!");
  }

  private updateChase(dt: number, ctx: GameContext): void {
    const event = ctx.bear.update(dt, ctx.bee.position);
    if (event === "swiped") {
      ctx.bee.knockBackFrom(
        ctx.bear.position,
        BEAR.knockbackSpeed,
        BEAR.stunSeconds,
      );
      ctx.audio.sting();
      ctx.flashScreen();
    }

    const distance = ctx.bear.position.distanceTo(ctx.bee.position);
    ctx.audio.setThreat(
      THREE.MathUtils.clamp(1 - (distance - BEAR.swipeRadius) / 20, 0.2, 1),
    );

    if (ctx.bee.position.distanceTo(ctx.hive.entrance) < BEAR.deliverRadius) {
      this.beginDelivery(ctx);
    }
  }

  /** Drop the honey into the hive. */
  private beginDelivery(ctx: GameContext): void {
    this.phase = "delivering";
    this.phaseTime = 0;
    ctx.bee.scripted = true;
    ctx.setFlightControls(false);
    ctx.setCameraZoom(1.4);
    ctx.honeyJar.stow();
    ctx.cottage.jar.visible = false;
    ctx.audio.quotaComplete();
    ctx.puff.burst(tmp.copy(ctx.hive.entrance), {
      color: [0xffb02e, 0xffe6a8, 0xfff6e8],
      count: 26,
      speed: 2.4,
      ttl: 1.0,
      spherical: 1,
    });
    ctx.hud.setObjective("Honey delivered!");
    ctx.setObjectiveMarker(null);
  }

  private updateDelivering(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    // Hold station by the hive door while the honey goes in.
    ctx.bee.position.lerp(
      tmp.copy(ctx.hive.entrance).add(tmpB.set(0, 0.6, 3)),
      0.06,
    );
    if (this.phaseTime < 1.6) {
      return;
    }
    this.beginDistraction(ctx);
  }

  /** The brood pours out and mobs the bear, which rears up and swipes at air. */
  private beginDistraction(ctx: GameContext): void {
    this.phase = "distracting";
    this.phaseTime = 0;
    ctx.releaseBabies(ctx.hive.entrance);
    this.babiesOut = true;
    // Start the circle from roughly where the follow camera already is, so the
    // handover isn't a jump cut.
    this.orbit = 0.5;
    ctx.bear.distract(ctx.hive.position, BEAR.distractStandoff);
    ctx.audio.setThreat(0.25);
    ctx.hud.setObjective(
      "The babies are teasing it — quick, while it is busy!",
    );
  }

  private updateDistracting(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    this.mobBear(ctx);
    this.orbitBear(dt, ctx);
    // Park the bee safely to one side to watch.
    ctx.bee.position.lerp(
      tmp.copy(ctx.hive.entrance).add(tmpB.set(6, 2.5, 7)),
      0.04,
    );
    if (this.phaseTime < 2.4) {
      return;
    }

    this.phase = "puzzling";
    this.phaseTime = 0;
    ctx.showPuzzle(true);
    ctx.hud.setObjective("Fix the scary picture to frighten it off!");
  }

  /**
   * Point the brood at the bear's head every frame. It's a live target, so
   * they keep swirling around it even as the bear turns and rears.
   */
  private mobBear(ctx: GameContext): void {
    ctx.babies.mobAround(ctx.bear.headPosition(tmpMob));
  }

  /**
   * Circle the reared bear, slowly, for as long as it's up on its hind legs.
   *
   * The shot holds for a minute or more while the puzzle is solved, and a fixed
   * camera makes that minute feel like a still image. Circling keeps it alive
   * and shows the swarm from every side.
   *
   * It orbits the midpoint between the bear and the hive rather than the bear
   * itself: the bear is enormous and stands close enough to the hive to eclipse
   * it entirely from a camera centred on the bear alone.
   *
   * @param towardHive 0 centres on the bear, 1 on the hive. Once the bear is
   *   fleeing it heads for the horizon, and a camera still tracking it would be
   *   flung along with it — so that beat holds on the hive and lets it run out
   *   of shot, which is the point of the beat anyway.
   */
  private orbitBear(dt: number, ctx: GameContext, towardHive = 0.5): void {
    this.orbit += dt * BEAR.orbitRate;
    const centre = tmpOrbit
      .copy(ctx.bear.position)
      .lerp(ctx.hive.position, towardHive);
    ctx.setCameraCinematic(
      tmp.set(
        centre.x + Math.sin(this.orbit) * BEAR.orbitRadius,
        BEAR.orbitHeight,
        centre.z + Math.cos(this.orbit) * BEAR.orbitRadius,
      ),
      tmpB.copy(centre).setY(BEAR.orbitLookHeight),
    );
  }

  private updatePuzzling(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    this.mobBear(ctx);
    this.orbitBear(dt, ctx);
  }

  /** Called by the Game when the sliding puzzle is completed. */
  onPuzzleSolved(ctx: GameContext): void {
    if (this.phase !== "puzzling") {
      return;
    }
    this.phase = "scaring";
    this.phaseTime = 0;
    ctx.celebratePuzzle();
    // Job done — they drift back to their own loops round the hive rather
    // than chasing the bear off the map.
    ctx.babies.mobAround(null);
    ctx.bear.flee(ctx.hive.position);
    ctx.audio.setThreat(0);
    ctx.audio.levelComplete();
    ctx.hud.setObjective("It is running away!");
  }

  private updateScaring(dt: number, ctx: GameContext): void {
    const event = ctx.bear.update(dt, ctx.bee.position);
    // Keep circling as it turns tail, and let go of the camera once it's away.
    this.orbitBear(dt, ctx, 1);
    if (this.phaseTime < 1.2) {
      return;
    }
    ctx.showPuzzle(false);
    if (event !== "departed" && this.phaseTime < BEAR.fleeSeconds) {
      return;
    }

    ctx.setCameraCinematic(null);
    this.phase = "celebrating";
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.flashScreen();
    ctx.hud.setObjective("The hive is safe, and full of honey!");
  }

  private updateCelebration(dt: number, ctx: GameContext): void {
    this.nextFirework -= dt;
    if (this.nextFirework <= 0 && this.phaseTime < CELEBRATION_TIME - 0.4) {
      this.nextFirework = 0.26;
      const a = this.phaseTime * 2.9 + Math.random() * Math.PI * 2;
      const r = 2 + Math.random() * 5;
      tmp.set(Math.cos(a) * r, 4 + Math.random() * 4, Math.sin(a) * r + 2);
      ctx.fireworks.burst(tmp, {
        color: FIREWORK_PALETTE,
        count: 30,
        speed: 4.2,
        lift: 0.4,
        gravity: 2.2,
        ttl: 1.5,
        spherical: 1,
      });
    }

    if (this.phaseTime >= CELEBRATION_TIME) {
      // Back out on the doorstep so the chamber isn't left with an invisible bee.
      ctx.bee.object.visible = true;
      ctx.bee.setScale(1);
      ctx.bee.position.copy(this.hover);
      this.phase = "done";
      this.complete = true;
      ctx.save.mutate(d => {
        d.level = 5;
      });
    }
  }

  // ---- the hop ------------------------------------------------------------

  /** A little arc out to the pad she just tapped, and straight back. */
  private startHop(ctx: GameContext, pad: number): void {
    this.hop = {
      from: this.hover.clone(),
      to: ctx.cottage.padCentres[pad].clone().setY(DANCE.hoverHeight * 0.72),
      t: 0,
    };
  }

  private updateHop(dt: number, ctx: GameContext): void {
    if (this.phase !== "dancing") {
      return;
    }
    if (!this.hop) {
      ctx.bee.position.copy(this.hover);
      return;
    }

    this.hop.t += dt / DANCE.hopTime;
    if (this.hop.t >= 1) {
      this.hop = null;
      ctx.bee.position.copy(this.hover);
      return;
    }

    // Out and back within one hop, with a lift over the middle of each leg.
    const u = this.hop.t < 0.5 ? this.hop.t * 2 : (1 - this.hop.t) * 2;
    ctx.bee.position.lerpVectors(this.hop.from, this.hop.to, ease(u));
    ctx.bee.position.y += Math.sin(u * Math.PI) * DANCE.hopArc;

    // Face the pad on the way out.
    tmp.copy(this.hop.to).sub(this.hop.from);
    if (tmp.lengthSq() > 1e-4) {
      ctx.bee.setYaw(Math.atan2(tmp.x, tmp.z));
    }
  }
}

/** Smoothstep. */
function ease(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
