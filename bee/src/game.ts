import * as THREE from 'three';
import { LEVELS, POLLEN_KINDS } from './config';
import { Audio } from './core/audio';
import { AltitudeStick } from './core/altitudeStick';
import { Joystick, type StickInput } from './core/input';
import { GameLoop } from './core/loop';
import { Rng } from './core/rng';
import { Save } from './core/save';
import { BabyRing } from './entities/babyRing';
import { BeeActor } from './entities/beeActor';
import { WaspActor } from './entities/waspActor';
import { FlowerField } from './entities/flowerField';
import { createFireworks, createPollenPuff } from './fx/particles';
import { FoundingLevel } from './levels/level1Founding';
import { RoyalChamberLevel } from './levels/level2RoyalChamber';
import { WaspLevel } from './levels/level3Wasp';
import type { EnvironmentName, FlightSettings, GameContext, Level } from './levels/level';
import { CameraRig } from './render/cameraRig';
import { createQueen } from './render/geometry/bee';
import { createHiveInterior, type HiveInterior } from './render/geometry/hiveInterior';
import { createHiveSite, createMeadow, type HiveSite } from './render/geometry/world';
import { solidToon } from './render/materials';
import { createStage, HIVE_ENV, MEADOW_ENV, type Stage } from './render/stage';
import { Hud } from './ui/hud';
import { createCodenameScreen, createMessageScreen, type Overlay } from './ui/overlays';

const WORLD_SEED = 20260811;

export class Game {
  private readonly stage: Stage;
  private readonly loop: GameLoop;
  private readonly save = new Save();
  private readonly audio = new Audio();
  private readonly hud: Hud;
  private readonly stick: Joystick;
  private readonly altitude: AltitudeStick;
  private readonly bee = new BeeActor();
  private readonly rig: CameraRig;
  private readonly flowers: FlowerField;
  private readonly hive: HiveSite;
  /** Meadow scenery, toggled wholesale against the hive interior. */
  private readonly meadowGroup = new THREE.Group();
  private readonly interior: HiveInterior;
  private readonly queen = createQueen();
  private readonly babies: BabyRing;
  private readonly wasp = new WaspActor();
  private readonly puff = createPollenPuff();
  private readonly fireworks = createFireworks();
  private readonly beacon: THREE.Group;
  private readonly ctx: GameContext;
  private readonly flash: HTMLDivElement;
  /** Neutral input handed to the bee while a cutscene owns it. */
  private readonly idleStick: StickInput = { x: 0, y: 0, magnitude: 0 };

  private level: Level = new FoundingLevel();
  private levelNumber = 1;
  private codenameScreen!: Overlay;
  private completeScreen!: Overlay;
  private running = false;
  private elapsed = 0;
  private beaconTime = 0;
  private beaconHeight = 0;

  constructor(host: HTMLElement) {
    this.stage = createStage(host);

    const rng = new Rng(WORLD_SEED);

    // --- meadow (level 1) ---
    this.meadowGroup.add(createMeadow(rng));
    this.hive = createHiveSite(new THREE.Vector3(0, 0, 0));
    this.meadowGroup.add(this.hive.group);
    this.flowers = new FlowerField(rng);
    this.meadowGroup.add(this.flowers.group);
    this.meadowGroup.add(this.wasp.object);
    this.stage.scene.add(this.meadowGroup);

    // --- hive interior (level 2) ---
    this.interior = createHiveInterior(rng);
    this.queen.group.position.copy(this.interior.queenPosition);
    this.interior.group.add(this.queen.group);
    this.babies = new BabyRing(this.interior.babyPositions, rng);
    this.interior.group.add(this.babies.group);
    this.interior.group.visible = false;
    this.stage.scene.add(this.interior.group);

    this.stage.scene.add(this.bee.object);
    this.stage.scene.add(this.puff.mesh);
    this.stage.scene.add(this.fireworks.mesh);

    this.beacon = createBeacon();
    this.beacon.visible = false;
    this.stage.scene.add(this.beacon);

    this.rig = new CameraRig(this.stage.camera);
    this.rig.snap(this.bee);

    const uiLayer = document.createElement('div');
    uiLayer.style.position = 'absolute';
    uiLayer.style.inset = '0';
    uiLayer.style.pointerEvents = 'none';
    host.appendChild(uiLayer);

    this.hud = new Hud(uiLayer, (muted) => this.audio.setMuted(muted));
    this.stick = new Joystick(uiLayer);
    this.altitude = new AltitudeStick(uiLayer, this.bee.desiredHeight);

    this.flash = document.createElement('div');
    this.flash.className = 'screen-flash';
    uiLayer.appendChild(this.flash);

    this.ctx = {
      scene: this.stage.scene,
      save: this.save,
      hud: this.hud,
      audio: this.audio,
      bee: this.bee,
      flowers: this.flowers,
      hive: this.hive,
      interior: this.interior,
      babies: this.babies,
      wasp: this.wasp,
      puff: this.puff,
      fireworks: this.fireworks,
      setObjectiveMarker: (p) => this.setObjectiveMarker(p),
      flashScreen: () => this.flashScreen(),
      setEnvironment: (name) => this.setEnvironment(name),
      configureFlight: (s) => this.configureFlight(s),
      placeBee: (position, desiredHeight) => this.placeBee(position, desiredHeight),
      setCameraZoom: (z) => this.rig.setZoom(z),
    };

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );

    this.buildOverlays(uiLayer);
    this.loop.start();

    // Dev handle: lets us poke at flight/camera tuning from the console.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).game = this;
  }

  // ---- level management ---------------------------------------------------

  /** The levels that actually exist. Saves beyond the last one clamp back. */
  private static readonly LEVELS: ReadonlyArray<{ number: number; name: string }> = [
    { number: 1, name: 'Sunny Meadow' },
    { number: 2, name: 'The Royal Chamber' },
    { number: 3, name: 'Wasp at the Hive' },
  ];

  private static readonly LAST_LEVEL = Game.LEVELS.length;

  private createLevel(n: number): Level {
    if (n >= 3) return new WaspLevel();
    if (n === 2) return new RoyalChamberLevel();
    return new FoundingLevel();
  }

  private switchLevel(n: number): void {
    const clamped = Math.min(Math.max(1, n), Game.LAST_LEVEL);
    this.levelNumber = clamped;
    this.save.mutate((d) => {
      d.maxLevel = Math.max(d.maxLevel, clamped);
    });
    // Levels that don't want a wasp shouldn't have to say so; level 3 spawns
    // its own in enter().
    this.wasp.reset();
    this.audio.setThreat(0);
    this.level = this.createLevel(clamped);
    this.completeScreen.setText(this.level.completionTitle, this.level.completionBody);
    this.level.enter(this.ctx);
  }

  /**
   * True if the player has already finished this level, so picking it from the
   * welcome screen means "play it again" rather than "carry on".
   *
   * Only level 1 needs asking: the babies live in memory, so level 2 always
   * starts fresh on a new session anyway.
   */
  private isLevelFinished(n: number): boolean {
    if (n !== 1) return false;
    const { gathered, maxLevel } = this.save.data;
    return maxLevel > 1 && POLLEN_KINDS.every((k) => gathered[k] >= LEVELS.foundingQuota[k]);
  }

  /** Wind a finished level back to its start so it can be replayed. */
  private restartLevel(n: number): void {
    if (n !== 1) return;
    this.save.mutate((d) => {
      d.gathered = { white: 0, yellow: 0, orange: 0 };
    });
  }

  private setEnvironment(name: EnvironmentName): void {
    const inHive = name === 'hive';
    this.meadowGroup.visible = !inHive;
    this.interior.group.visible = inHive;
    this.stage.setEnvironment(inHive ? HIVE_ENV : MEADOW_ENV);
  }

  private configureFlight(s: FlightSettings): void {
    this.bee.bounds.radius = s.boundsRadius;
    this.rig.distance = s.cameraDistance;
    this.rig.height = s.cameraHeight;
    // A new level starts framed normally; it can widen the shot itself.
    this.rig.setZoom(1, true);
    this.altitude.setRange(
      s.minHeight,
      s.maxHeight,
      THREE.MathUtils.clamp(this.bee.desiredHeight, s.minHeight, s.maxHeight),
    );
  }

  private placeBee(position: THREE.Vector3, desiredHeight?: number): void {
    this.bee.scripted = false;
    this.bee.object.visible = true;
    this.bee.setScale(1);
    this.bee.position.copy(position);
    this.bee.velocity.set(0, 0, 0);
    const height = desiredHeight ?? position.y;
    this.bee.snapHeight(height);
    this.altitude.setHeight(height);
    this.rig.snap(this.bee);
  }

  private buildOverlays(uiLayer: HTMLElement): void {
    this.completeScreen = createMessageScreen(
      uiLayer,
      this.level.completionTitle,
      this.level.completionBody,
      'Keep flying',
      () => {
        this.completeScreen.hide();
        this.running = true;
        // Finishing a level bumps the save; if a next level exists, go there.
        const next = this.save.data.level;
        if (next > this.levelNumber && this.levelNumber < Game.LAST_LEVEL) {
          this.switchLevel(next);
        } else {
          this.level.resumeAfterCompletion(this.ctx);
        }
      },
    );

    const unlocked = Math.min(this.save.data.maxLevel, Game.LAST_LEVEL);
    const resumeAt = Math.min(Math.max(1, this.save.data.level), Game.LAST_LEVEL);

    this.codenameScreen = createCodenameScreen(uiLayer, {
      existing: this.save.data.codename,
      levels: Game.LEVELS.filter((l) => l.number <= unlocked).map((l) => ({
        ...l,
        note: this.isLevelFinished(l.number) ? 'Play again from the start' : undefined,
      })),
      selected: resumeAt,
      onStart: (codename, level) => {
        this.audio.unlock();
        this.save.mutate((d) => {
          d.codename = codename;
          d.level = level;
        });
        // Picking a level you've already finished means replaying it.
        if (this.isLevelFinished(level)) this.restartLevel(level);
        this.codenameScreen.hide();
        this.switchLevel(level);
        this.running = true;
      },
      onReset: () => {
        this.save.reset();
        location.reload();
      },
    });
    this.codenameScreen.show();
  }

  private update(dt: number): void {
    if (!this.running) return;

    const locked = this.level.controlsLocked;

    if (!locked) this.bee.desiredHeight = this.altitude.desiredHeight;
    this.bee.update(dt, locked ? this.idleStick : this.stick, this.rig.yaw);
    this.altitude.setActualHeight(this.bee.height);

    // Flowers only exist in the meadow, and harvesting is suspended during a
    // cutscene; the level still runs so its state machine can advance.
    const harvest =
      locked || !this.meadowGroup.visible ? null : this.flowers.update(dt, this.bee.position);
    const wasComplete = this.level.complete;
    this.level.update(dt, this.ctx, harvest);

    // After the level, so a cutscene's freshly written position is what the
    // camera actually frames this step.
    this.rig.update(dt, this.bee);

    this.puff.update(dt);
    this.fireworks.update(dt);
    this.audio.setFlightIntensity(locked ? 0 : this.bee.speed01);
    // Level 2 drives the dwell meter itself (loading and feeding).
    if (this.meadowGroup.visible) this.hud.setHarvest(locked ? 0 : this.flowers.harvestProgress);

    if (!wasComplete && this.level.complete) {
      this.running = false;
      this.save.flush();
      this.completeScreen.show();
    }
  }

  private flashScreen(): void {
    this.flash.classList.remove('on');
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add('on');
  }

  private render(alpha: number, frameDt: number): void {
    this.elapsed += frameDt;
    this.bee.render(alpha);
    if (this.wasp.visible) this.wasp.render(alpha);
    if (this.meadowGroup.visible) this.hive.updateGlow(this.elapsed);
    if (this.interior.group.visible) this.queen.animate(this.elapsed, 0, 0);

    // Keep the shadow frustum on the bee so 1024px of shadow map isn't wasted
    // covering ground the player can't see.
    const off = this.stage.sunOffset;
    this.stage.sun.position.set(
      this.bee.object.position.x + off.x,
      off.y,
      this.bee.object.position.z + off.z,
    );
    this.stage.sun.target.position.copy(this.bee.object.position);
    this.stage.sun.target.updateMatrixWorld();

    if (this.beacon.visible) {
      this.beaconTime += frameDt;
      this.beacon.rotation.y = this.beaconTime * 1.2;
      this.beacon.children[0].position.y =
        this.beaconHeight + 1.3 + Math.sin(this.beaconTime * 3) * 0.22;
    }

    this.stage.renderer.render(this.stage.scene, this.stage.camera);
    this.hud.setPerf(this.loop.fps, this.stage.renderer.info.render.calls);
  }

  private setObjectiveMarker(position: THREE.Vector3 | null): void {
    if (!position) {
      this.beacon.visible = false;
      return;
    }
    this.beacon.visible = true;
    // The group sits on the ground; only the chevron rides at the flower head.
    this.beacon.position.set(position.x, 0, position.z);
    this.beaconHeight = position.y;
  }
}

/** Floating chevron + ground ring marking the current objective. */
function createBeacon(): THREE.Group {
  const g = new THREE.Group();

  const arrowMat = solidToon(0xfff0a8);
  arrowMat.transparent = true;
  arrowMat.opacity = 0.9;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 5), arrowMat);
  arrow.rotation.x = Math.PI;
  arrow.position.y = 1.6;
  g.add(arrow);

  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfff0a8,
    transparent: true,
    opacity: 0.35,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);

  return g;
}
