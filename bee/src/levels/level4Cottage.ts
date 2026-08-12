import * as THREE from 'three';
import { BEAR, CAMERA, COTTAGE, DANCE, FLIGHT, INSIDE } from '../config';
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
 *
 * The three points below are relative to the house; the clearing itself stands
 * away at COTTAGE.yardOffsetZ, so they're shifted by `YARD` when used.
 */
const PAN_TIME = 4.6;
const PAN_FROM = new THREE.Vector3(-42, 24, 16);
const PAN_CONTROL = new THREE.Vector3(-14, 40, 54);
const PAN_LOOK_FROM = new THREE.Vector3(0, 17, 0);

/** The clearing's offset from the world origin. */
const YARD = new THREE.Vector3(0, 0, COTTAGE.yardOffsetZ);

type Phase =
  | 'establishing'
  | 'arriving'
  | 'dancing'
  | 'opening'
  | 'entering'
  | 'inside'
  | 'carrying'
  | 'leaving'
  | 'emerging'
  | 'chased'
  | 'delivering'
  | 'distracting'
  | 'puzzling'
  | 'scaring'
  | 'celebrating'
  | 'done';

const tmp = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpMob = new THREE.Vector3();
const tmpOrbit = new THREE.Vector3();
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
  readonly completionTitle = 'The hive is safe!';
  readonly completionBody =
    'You danced the door open, carried the honey home, and sent that bear packing. Some day for a small bee.';

  complete = false;

  private phase: Phase = 'arriving';
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
    ctx.cottage.setDoorOpen(false);

    this.hover.copy(ctx.cottage.padCentres[CENTRE_PAD]).setY(DANCE.hoverHeight);

    // Arrive from out in the clearing, facing the cottage.
    const start = new THREE.Vector3().copy(this.hover).add(tmpB.set(0, 1.4, 9));
    // Facing the house, i.e. down -Z, which puts the camera behind her on +Z.
    // That's where the pan has to land.
    ctx.placeBee(start, DANCE.hoverHeight + 1.4, Math.PI);
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
    this.babiesOut = false;
    this.mat = null;
    this.music = null;

    ctx.hud.setCounters([
      { key: 'dance', label: 'Steps', color: 0xffd75e, value: 0, target: DanceMat.totalPads },
    ]);
  }

  update(dt: number, ctx: GameContext): void {
    this.phaseTime += dt;
    this.updateHop(dt, ctx);
    // Once the brood is out it flies itself, in every phase from here on —
    // without this they simply hang in the hive doorway where they hatched.
    if (this.babiesOut) ctx.babies.update(dt, ctx.bee.position, null);

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
      case 'emerging':
        this.updateEmerging(dt, ctx);
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
      .add(YARD)
      .multiplyScalar(inv * inv)
      .addScaledVector(tmp.copy(PAN_CONTROL).add(YARD), 2 * inv * u)
      .addScaledVector(this.panTo, u * u);

    panLook.lerpVectors(
      tmp.copy(PAN_LOOK_FROM).add(YARD),
      this.hover,
      ease(Math.max(0, t * 1.35 - 0.35)),
    );
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

    ctx.hud.setCount('dance', 0, DanceMat.totalPads);
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
          ctx.hud.setCount('dance', this.mat.hits, this.mat.total, true);
          break;
        case 'miss':
          ctx.hud.setCount('dance', this.mat.hits, this.mat.total);
          break;
        case 'stepUp':
          ctx.hud.setObjective('Two at a time now!');
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
      const scored = this.mat ? Math.round(this.mat.ratio * 100) : 0;
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

  /** Out the door: shrink into the doorway from inside… */
  private updateLeaving(ctx: GameContext): void {
    const t = Math.min(1, this.phaseTime / 1.4);
    ctx.bee.scripted = true;
    ctx.setFlightControls(false);
    ctx.bee.position.lerpVectors(this.hover, ctx.inside.entryPosition, ease(t));
    ctx.bee.setScale(Math.max(0.001, 1 - t * t * 0.9));
    if (t < 1) return;
    this.beginEmerging(ctx);
  }

  /**
   * …and back out over the mat, where the bear is waiting.
   *
   * The clearing sits at the north end of the meadow's world, so there is no
   * cut here and none later: the camera pulls right back, the bear lumbers in
   * from the left, and through the gate in the fence the hive is already
   * glowing at the far end of the flight. Everything from here to the hive is
   * one continuous shot.
   */
  private beginEmerging(ctx: GameContext): void {
    this.phase = 'emerging';
    this.phaseTime = 0;

    ctx.setEnvironment('cottage');
    ctx.configureFlight({
      boundsRadius: COTTAGE.flightRadius,
      minHeight: FLIGHT.minHeight,
      maxHeight: FLIGHT.maxHeight,
      cameraDistance: CAMERA.distance,
      cameraHeight: CAMERA.height,
    });

    // Back out over the mat she danced on — dark now, its job done.
    this.mat?.reset();
    this.hover.copy(ctx.cottage.matCentre).setY(DANCE.hoverHeight + 2.5);
    // Facing the gate and the meadow beyond it — the way home.
    ctx.placeBee(this.hover, this.hover.y, 0);
    ctx.bee.object.visible = true;
    ctx.bee.setScale(1);
    ctx.bee.scripted = true;
    ctx.bee.setCrown(true);
    ctx.bee.setYaw(0); // facing the gate, and home
    ctx.setFlightControls(false);
    // Right back: a bear at this scale needs the room, and the gate and the
    // meadow beyond it have to be readable from the off.
    ctx.setCameraZoom(COTTAGE.chaseZoom);

    // The jar comes with her — it is the whole point of the trip.
    ctx.bringHoney();
    ctx.honeyJar.pickUp(tmp.copy(this.hover).setY(this.hover.y - 0.35));

    // The hive is the destination and it says so, from this far off.
    ctx.hive.setProgress(1);
    ctx.hive.setGlow(true);
    ctx.setObjectiveMarker(tmp.copy(ctx.hive.entrance).setY(ctx.hive.entrance.y + 1.4));

    // In from the left of shot. The camera looks down +Z, which puts +X on the
    // left — the sign here is not the one you'd guess.
    ctx.bear.spawn(
      tmp.copy(ctx.cottage.matCentre).add(tmpB.set(BEAR.ambushOffset * 3, 0, -3)),
      this.hover,
    );

    ctx.hud.setCounters([]);
    ctx.hud.setObjective('A bear!');
    ctx.audio.setThreat(0.4);
  }

  /** Let it lumber into shot, then hand the controls back and run. */
  private updateEmerging(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    // Hold station over the mat, bobbing, while it closes in.
    ctx.bee.position.y = this.hover.y + Math.sin(this.phaseTime * 2.2) * 0.25;
    // Long enough for the bear to walk into shot from off to the left.
    if (this.phaseTime < 4) return;
    this.beginChase(ctx);
  }

  /**
   * The flight home. The bear corners badly, the gate is a bottleneck it has
   * to lumber around, and the hive is a long way off.
   */
  private beginChase(ctx: GameContext): void {
    this.phase = 'chased';
    this.phaseTime = 0;

    ctx.bee.scripted = false;
    ctx.setFlightControls(true);
    ctx.bear.pursue();

    ctx.hud.setObjective('Through the gate — get the honey home to the hive!');
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
    this.babiesOut = true;
    // Start the circle from roughly where the follow camera already is, so the
    // handover isn't a jump cut.
    this.orbit = 0.5;
    ctx.bear.distract(ctx.hive.position, BEAR.distractStandoff);
    ctx.audio.setThreat(0.25);
    ctx.hud.setObjective('The babies are teasing it — quick, while it is busy!');
  }

  private updateDistracting(dt: number, ctx: GameContext): void {
    ctx.bear.update(dt, ctx.bee.position);
    this.mobBear(ctx);
    this.orbitBear(dt, ctx);
    // Park the bee safely to one side to watch.
    ctx.bee.position.lerp(tmp.copy(ctx.hive.entrance).add(tmpB.set(6, 2.5, 7)), 0.04);
    if (this.phaseTime < 2.4) return;

    this.phase = 'puzzling';
    this.phaseTime = 0;
    ctx.showPuzzle(true);
    ctx.hud.setObjective('Fix the scary picture to frighten it off!');
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
    const centre = tmpOrbit.copy(ctx.bear.position).lerp(ctx.hive.position, towardHive);
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
    if (this.phase !== 'puzzling') return;
    this.phase = 'scaring';
    this.phaseTime = 0;
    ctx.celebratePuzzle();
    // Job done — they drift back to their own loops round the hive rather
    // than chasing the bear off the map.
    ctx.babies.mobAround(null);
    ctx.bear.flee(ctx.hive.position);
    ctx.audio.setThreat(0);
    ctx.audio.levelComplete();
    ctx.hud.setObjective('It is running away!');
  }

  private updateScaring(dt: number, ctx: GameContext): void {
    const event = ctx.bear.update(dt, ctx.bee.position);
    // Keep circling as it turns tail, and let go of the camera once it's away.
    this.orbitBear(dt, ctx, 1);
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
