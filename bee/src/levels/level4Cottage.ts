import * as THREE from 'three';
import { BEAR, CAMERA, COTTAGE, DANCE, FLIGHT, INSIDE, WORLD } from '../config';
import { DanceMat } from '../entities/danceMat';
import type { Music } from '../core/music';
import { Rng } from '../core/rng';
import { FIREWORK_PALETTE } from '../fx/particles';
import type { GameContext, Level } from './level';

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
 */
const PAN_TIME = 4.6;
const PAN_FROM = new THREE.Vector3(-42, 24, 16);
const PAN_CONTROL = new THREE.Vector3(-14, 40, 54);
const PAN_LOOK_FROM = new THREE.Vector3(0, 17, 0);

type Phase =
  | 'establishing'
  | 'arriving'
  | 'dancing'
  | 'opening'
  | 'entering'
  | 'inside'
  | 'carrying'
  | 'leaving'
  | 'chased'
  | 'delivering'
  | 'distracting'
  | 'puzzling'
  | 'scaring'
  | 'celebrating'
  | 'done';

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const panEye = new THREE.Vector3();
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
  readonly name = 'Caramel Cottage';
  readonly completionTitle = 'The door is open!';
  readonly completionBody =
    'You danced the lock right off it. Inside the cottage is next — that part is still being built.';

  complete = false;

  private phase: Phase = 'arriving';
  private phaseTime = 0;
  /** Seconds of fallback musical time when there's no audio context. */
  private silentTime = 0;
  private nextFirework = 0;

  private mat: DanceMat | null = null;
  private music: Music | null = null;
  private rounds = 0;

  /** The hop out to a tapped pad and back. */
  private hop: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  private readonly hover = new THREE.Vector3();
  /** Where the follow rig will sit once the pan ends. */
  private readonly panTo = new THREE.Vector3();

  get controlsLocked(): boolean {
    // Stage 1 is tapped rather than flown; stage 2 hands flight back.
    return this.phase !== 'inside' && this.phase !== 'carrying' && this.phase !== 'chased';
  }

  enter(ctx: GameContext): void {
    ctx.setEnvironment('cottage');
    ctx.configureFlight({
      boundsRadius: COTTAGE.boundsRadius,
      minHeight: COTTAGE.minHeight,
      maxHeight: COTTAGE.maxHeight,
      cameraDistance: COTTAGE.cameraDistance,
      cameraHeight: COTTAGE.cameraHeight,
    });
    ctx.setFlightControls(false);
    ctx.setObjectiveMarker(null);
    ctx.cottage.setDoorOpen(false);

    this.hover.copy(ctx.cottage.padCentres[CENTRE_PAD]).setY(DANCE.hoverHeight);

    // Arrive from out in the clearing, facing the cottage.
    const start = new THREE.Vector3().copy(this.hover).add(tmpB.set(0, 1.4, 9));
    ctx.placeBee(start, DANCE.hoverHeight + 1.4);
    // placeBee snaps the rig facing the origin, which puts the camera directly
    // behind the bee on +Z. That's where the pan has to land.
    this.panTo
      .copy(start)
      .add(tmpB.set(0, COTTAGE.cameraHeight, COTTAGE.cameraDistance));
    ctx.bee.setCrown(true);
    ctx.bee.scripted = true;
    ctx.bee.setYaw(Math.PI); // face the door, which is at -Z of the mat

    ctx.hud.setBanner(this.name);
    ctx.hud.setCarrying(null);
    ctx.hud.setHarvest(0);
    ctx.hud.setObjective('Caramel Cottage…');

    this.phase = 'establishing';
    this.phaseTime = 0;
    this.silentTime = 0;
    this.rounds = 0;
    this.complete = false;
    this.hop = null;
    this.mat = null;
    this.music = null;

    ctx.hud.setCounters([
      { key: 'dance', label: 'Steps', color: 0xffd75e, value: 0, target: DANCE.prompts },
    ]);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    ctx.cottage.update(this.phaseTime);
    this.updateHop(dt, ctx);

    switch (this.phase) {
      case 'establishing':
        this.updateEstablishing(ctx);
        break;
      case 'arriving':
        this.updateArrival(ctx);
        break;
      case 'dancing':
        this.updateDance(dt, ctx);
        break;
      case 'opening':
        // Let the door swing before she goes in.
        if (this.phaseTime > 1.4) {
          this.phase = 'entering';
          this.phaseTime = 0;
          ctx.hud.setObjective('In you go!');
        }
        break;
      case 'entering':
        this.updateEntering(ctx);
        break;
      case 'inside':
        this.updateInside(ctx);
        break;
      case 'carrying':
        this.updateCarrying(ctx);
        break;
      case 'leaving':
        this.updateLeaving(ctx);
        break;
      case 'chased':
        this.updateChase(dt, ctx);
        break;
      case 'delivering':
        this.updateDelivering(dt, ctx);
        break;
      case 'distracting':
        this.updateDistracting(dt, ctx);
        break;
      case 'puzzling':
        this.updatePuzzling(dt, ctx);
        break;
      case 'scaring':
        this.updateScaring(dt, ctx);
        break;
      case 'celebrating':
        this.updateCelebration(dt, ctx);
        break;
      case 'done':
        break;
    }
  }

  /** Sweep past the cottage, then hand the camera back and fly the bee in. */
  private updateEstablishing(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / PAN_TIME);
    const u = ease(t);

    // Quadratic Bezier from PAN_FROM through PAN_CONTROL to the follow rig's
    // resting place, so the shot lands exactly where the chase camera wants.
    const inv = 1 - u;
    panEye
      .copy(PAN_FROM)
      .multiplyScalar(inv * inv)
      .addScaledVector(PAN_CONTROL, 2 * inv * u)
      .addScaledVector(this.panTo, u * u);

    panLook.lerpVectors(PAN_LOOK_FROM, this.hover, ease(Math.max(0, t * 1.35 - 0.35)));
    ctx.setCameraCinematic(panEye, panLook);

    if (t < 1) return;

    ctx.setCameraCinematic(null);
    this.phase = 'arriving';
    this.phaseTime = 0;
    ctx.hud.setObjective('The door is locked… what is that mat for?');
  }

  /** Fly in and settle over the centre pad, then start the music. */
  private updateArrival(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.8);
    ctx.bee.position.lerpVectors(
      tmp.copy(this.hover).add(tmpB.set(0, 1.4, 9)),
      this.hover,
      ease(t),
    );
    if (t < 1) return;

    this.phase = 'dancing';
    this.phaseTime = 0;
    this.beginRound(ctx);
  }

  private beginRound(ctx: GameContext): void {
    this.rounds++;
    this.mat?.reset();
    // A fresh pattern each attempt, so a retry isn't the same round again.
    this.mat = new DanceMat(ctx.cottage.pads, new Rng(0x51ce5 + this.rounds * 7919));
    this.silentTime = 0;

    this.music = ctx.audio.createMusic(DANCE.bpm);
    this.music?.start();

    ctx.hud.setCount('dance', 0, DANCE.prompts);
    ctx.hud.setObjective('Tap each square as it lights up!');
  }

  private updateDance(dt: number, ctx: GameContext): void {
    if (!this.mat) return;
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
      if (pad >= 0 && this.mat.tap(pad)) this.startHop(ctx, pad);
    }

    for (const event of this.mat.events.splice(0)) {
      switch (event.type) {
        case 'lit':
          ctx.audio.collect(0);
          break;
        case 'hit':
          ctx.audio.collect(3);
          ctx.puff.burst(tmp.copy(ctx.cottage.padCentres[event.pad]).setY(0.5), {
            color: [0xffe066, 0xfff3c4, 0x9be36b],
            count: 12,
            speed: 1.8,
            ttl: 0.6,
            spherical: 1,
          });
          ctx.hud.setCount('dance', this.mat.hits, DANCE.prompts, true);
          break;
        case 'miss':
          ctx.hud.setCount('dance', this.mat.hits, DANCE.prompts);
          break;
        case 'finished':
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
      const scored = this.mat ? Math.round((this.mat.hits / DANCE.prompts) * 100) : 0;
      ctx.hud.setObjective(`${scored}% — so close! Let's try that again`);
      this.phase = 'arriving';
      // Skip the fly-in; she's already on the mat.
      this.phaseTime = 1.8;
      return;
    }

    this.phase = 'opening';
    this.phaseTime = 0;
    ctx.cottage.setDoorOpen(true);
    ctx.audio.levelComplete();
    ctx.flashScreen();
    ctx.hud.setObjective('The lock springs open!');
  }

  /** Fly through the doorway once it's open, then cut to the room inside. */
  private updateEntering(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.6);
    ctx.bee.position.lerpVectors(this.hover, ctx.cottage.doorway, ease(t));
    ctx.bee.setScale(Math.max(0.001, 1 - t * t * 0.9));
    if (t < 1) return;

    this.beginInside(ctx);
  }

  // ---- stage 2: inside the cottage ---------------------------------------

  /** Hand control back and let the player fly the room. */
  private beginInside(ctx: GameContext): void {
    this.phase = 'inside';
    this.phaseTime = 0;

    ctx.setEnvironment('inside');
    ctx.configureFlight({
      boundsRadius: INSIDE.boundsRadius,
      minHeight: INSIDE.minHeight,
      maxHeight: INSIDE.maxHeight,
      cameraDistance: INSIDE.cameraDistance,
      cameraHeight: INSIDE.cameraHeight,
    });
    ctx.honeyJar.reset(ctx.inside.jarRest);
    ctx.inside.glow.mesh.visible = true;
    ctx.placeBee(ctx.inside.entryPosition, 2.6);
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.scripted = false;
    ctx.setFlightControls(true);

    ctx.hud.setCounters([]);
    ctx.hud.setObjective('Honey! Fly over and pick up the jar');
    ctx.setObjectiveMarker(tmp.copy(ctx.inside.jarRest).setY(ctx.inside.jarRest.y + 1.2));
  }

  private updateInside(ctx: GameContext): void {
    const jarPos = ctx.inside.jar.getWorldPosition(tmp);
    if (ctx.bee.position.distanceTo(jarPos) > INSIDE.pickupRadius) return;

    ctx.honeyJar.pickUp(tmpB.copy(ctx.bee.position).setY(ctx.bee.position.y - 0.35));
    // The field was there to say "come and get this"; it has done its job.
    ctx.inside.glow.mesh.visible = false;
    ctx.audio.quotaComplete();
    ctx.puff.burst(jarPos, {
      color: [0xffb02e, 0xffe6a8, 0xfff6e8],
      count: 22,
      speed: 2.2,
      ttl: 0.9,
      spherical: 1,
    });
    ctx.setObjectiveMarker(null);
    ctx.hud.setObjective('Got it! Mind how you swing it');
    this.phase = 'carrying';
    this.phaseTime = 0;
  }

  /** A moment to enjoy flying with it, then head for the door. */
  private updateCarrying(ctx: GameContext): void {
    if (this.phaseTime < 4) return;
    this.phase = 'leaving';
    this.phaseTime = 0;
    ctx.hud.setObjective('Home with it, then!');
  }

  // ---- stage 3: the bear ---------------------------------------------------

  /** Out the door and straight into trouble. */
  private updateLeaving(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.4);
    ctx.bee.scripted = true;
    ctx.setFlightControls(false);
    ctx.bee.position.lerpVectors(this.hover, ctx.inside.entryPosition, ease(t));
    ctx.bee.setScale(Math.max(0.001, 1 - t * t * 0.9));
    if (t < 1) return;
    this.beginChase(ctx);
  }

  /**
   * Cut to the meadow with the bear already on her tail. The hive is a long
   * way off, and the bear corners badly — the flight home is the level.
   */
  private beginChase(ctx: GameContext): void {
    this.phase = 'chased';
    this.phaseTime = 0;

    ctx.setEnvironment('meadow');
    ctx.configureFlight({
      boundsRadius: WORLD.radius,
      minHeight: FLIGHT.minHeight,
      maxHeight: FLIGHT.maxHeight,
      cameraDistance: CAMERA.distance,
      cameraHeight: CAMERA.height,
    });
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(true);

    // Start out at the far edge of the meadow, hive in the distance.
    const start = new THREE.Vector3(0, 4, WORLD.radius - 8);
    ctx.placeBee(start, 4);
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.scripted = false;
    ctx.bee.setCrown(true);
    ctx.setFlightControls(true);
    // A flatter, wider chase shot: steeper and the dangling jar sits on top of
    // the bee instead of below her.
    ctx.setCameraZoom(1.3);

    // The jar comes with her — it is the whole point of the trip.
    ctx.bringHoney();
    ctx.honeyJar.pickUp(tmp.copy(start).setY(start.y - 0.35));

    // Off to one side as well as behind, so it is in shot from the first frame
    // rather than hidden directly behind the camera.
    ctx.bear.spawn(tmp.copy(start).add(tmpB.set(11, 0, BEAR.ambushOffset)), start);
    ctx.bear.pursue();

    ctx.hud.setCounters([]);
    ctx.hud.setObjective('A bear! Get the honey home to the hive!');
    ctx.setObjectiveMarker(tmp.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 1.4));
    ctx.audio.setThreat(0.4);
  }

  private updateChase(dt: number, ctx: GameContext): void {
    const event = ctx.bear.update(dt, ctx.bee.position);
    if (event === 'swiped') {
      ctx.bee.knockBackFrom(ctx.bear.position, BEAR.knockbackSpeed, BEAR.stunSeconds);
      ctx.audio.sting();
      ctx.flashScreen();
    }

    const distance = ctx.bear.position.distanceTo(ctx.bee.position);
    ctx.audio.setThreat(THREE.MathUtils.clamp(1 - (distance - BEAR.swipeRadius) / 20, 0.2, 1));

    if (ctx.bee.position.distanceTo(ctx.hive.entrance) < BEAR.deliverRadius) {
      this.beginDelivery(ctx);
    }
  }

  /** Drop the honey into the hive. */
  private beginDelivery(ctx: GameContext): void {
    this.phase = 'delivering';
    this.phaseTime = 0;
    ctx.bee.scripted = true;
    ctx.setFlightControls(false);
    ctx.setCameraZoom(1.4);
    ctx.honeyJar.stow();
    ctx.inside.jar.visible = false;
    ctx.audio.quotaComplete();
    ctx.puff.burst(tmp.copy(ctx.hive.entrance), {
      color: [0xffb02e, 0xffe6a8, 0xfff6e8],
      count: 26,
      speed: 2.4,
      ttl: 1.0,
      spherical: 1,
    });
    ctx.hud.setObjective('Honey delivered!');
    ctx.setObjectiveMarker(null);
  }

  private updateDelivering(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    // Hold station by the hive door while the honey goes in.
    ctx.bee.position.lerp(tmp.copy(ctx.hive.entrance).add(tmpB.set(0, 0.6, 3)), 0.06);
    if (this.phaseTime < 1.6) return;
    this.beginDistraction(ctx);
  }

  /** The brood pours out and mobs the bear, which rears up and swipes at air. */
  private beginDistraction(ctx: GameContext): void {
    this.phase = 'distracting';
    this.phaseTime = 0;
    ctx.releaseBabies(ctx.hive.entrance);
    ctx.bear.distract();
    ctx.audio.setThreat(0.25);
    ctx.hud.setObjective('The babies are teasing it — quick, while it is busy!');
  }

  private updateDistracting(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    // Park the bee safely to one side to watch.
    ctx.bee.position.lerp(tmp.copy(ctx.hive.entrance).add(tmpB.set(6, 2.5, 7)), 0.04);
    if (this.phaseTime < 2.4) return;

    this.phase = 'puzzling';
    this.phaseTime = 0;
    ctx.showPuzzle(true);
    ctx.hud.setObjective('Fix the scary picture to frighten it off!');
  }

  private updatePuzzling(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    // Drift the camera onto the bear and the babies, which is the show.
    ctx.setCameraCinematic(
      tmp.copy(ctx.bear.position).add(tmpB.set(9, 9, 15)),
      tmpB.copy(ctx.bear.position).setY(5),
    );
    void dt;
  }

  /** Called by the Game when the sliding puzzle is completed. */
  onPuzzleSolved(ctx: GameContext): void {
    if (this.phase !== 'puzzling') return;
    this.phase = 'scaring';
    this.phaseTime = 0;
    ctx.celebratePuzzle();
    ctx.bear.flee(ctx.hive.position);
    ctx.audio.setThreat(0);
    ctx.audio.levelComplete();
    ctx.hud.setObjective('It is running away!');
  }

  private updateScaring(dt: number, ctx: GameContext): void {
    const event = ctx.bear.update(dt, ctx.bee.position);
    ctx.setCameraCinematic(
      tmp.copy(ctx.bear.position).add(tmpB.set(9, 9, 15)),
      tmpB.copy(ctx.bear.position).setY(4),
    );
    if (this.phaseTime < 1.2) return;
    ctx.showPuzzle(false);
    if (event !== 'departed' && this.phaseTime < BEAR.fleeSeconds) return;

    ctx.setCameraCinematic(null);
    this.phase = 'celebrating';
    this.phaseTime = 0;
    this.nextFirework = 0;
    ctx.flashScreen();
    ctx.hud.setObjective('The hive is safe, and full of honey!');
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
      this.phase = 'done';
      this.complete = true;
      ctx.save.mutate((d) => {
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
    if (this.phase !== 'dancing') return;
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
    if (tmp.lengthSq() > 1e-4) ctx.bee.setYaw(Math.atan2(tmp.x, tmp.z));
  }

  resumeAfterCompletion(ctx: GameContext): void {
    if (this.phase !== 'done') return;
    this.complete = false;
    ctx.hud.setObjective('Have a look around');
    ctx.setFlightControls(true);
    ctx.bee.scripted = false;
  }
}

/** Smoothstep. */
function ease(t: number): number {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
