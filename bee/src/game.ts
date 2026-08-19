import * as THREE from "three";
import {CAMERA, INSIDE, LEVELS, POLLEN_KINDS} from "./config";
import {Audio} from "./core/audio";
import {AltitudeStick} from "./core/altitudeStick";
import {watchInput} from "./core/controlLog";
import {Joystick, type StickInput} from "./core/input";
import {ThrottleStick} from "./core/throttleStick";
import {TurnButtons} from "./core/turnButtons";
import {HopButtons} from "./core/hopButtons";
import {HoldInput} from "./core/holdInput";
import {PointerAim} from "./core/pointerAim";
import {GameLoop} from "./core/loop";
import {Rng} from "./core/rng";
import {Save} from "./core/save";
import {BabyRing} from "./entities/babyRing";
import {BeeActor} from "./entities/beeActor";
import {WaspActor} from "./entities/waspActor";
import {FlowerField} from "./entities/flowerField";
import {createFireworks, createPollenPuff} from "./fx/particles";
import {FoundingLevel} from "./levels/level1Founding";
import {RoyalChamberLevel} from "./levels/level2RoyalChamber";
import {WaspLevel} from "./levels/level3Wasp";
import {CottageLevel} from "./levels/level4Cottage";
import {MazeLevel} from "./levels/level5Maze";
import {LairLevel} from "./levels/level6Lair";
import {IslandsLevel} from "./levels/level7Islands";
import {AntHuntLevel} from "./levels/level8AntHunt";
import {AscentLevel} from "./levels/level9Ascent";
import {DescentLevel} from "./levels/level10Descent";
import type {
  EnvironmentName,
  FlightControls,
  FlightSettings,
  GameContext,
  Level,
} from "./levels/level";
import {CameraRig} from "./render/cameraRig";
import {createQueen} from "./render/geometry/bee";
import {BearActor} from "./entities/bearActor";
import {DanglingLoad} from "./entities/danglingLoad";
import {Larder} from "./entities/larder";
import {createCottage, type CottageScene} from "./render/geometry/cottage";
import {
  createHiveInterior,
  type HiveInterior,
} from "./render/geometry/hiveInterior";
import {
  createHiveSite,
  createMeadow,
  type HiveSite,
} from "./render/geometry/world";
import {solidToon} from "./render/materials";
import {
  createStage,
  COTTAGE_ENV,
  HIVE_ENV,
  LAIR_ENV,
  ISLANDS_ENV,
  MOUNTAIN_ENV,
  MEADOW_ENV,
  WOODS_ENV,
  type Stage,
} from "./render/stage";
import {Hud} from "./ui/hud";
import {
  createChoiceScreen,
  createCodenameScreen,
  createMessageScreen,
  type Overlay,
} from "./ui/overlays";
import {createMapDraw, type MapDraw} from "./ui/mapDraw";
import {burstRainbow, createSlidePuzzle, type SlidePuzzle} from "./ui/puzzle";

const WORLD_SEED = 20260811;
/** How far south of a shut gate the bee is held. */
const GATE_STANDOFF = 4;
const tmpBelly = new THREE.Vector3();

export class Game {
  private readonly stage: Stage;
  private readonly loop: GameLoop;
  private readonly save = new Save();
  private readonly audio = new Audio();
  private readonly hud: Hud;
  private readonly stick: Joystick;
  private readonly altitude: AltitudeStick;
  /** Swaps in for the altitude slider under tank steering. */
  private readonly turnButtons: TurnButtons;
  /** Four buttons in two corners — level 7's only control. */
  private readonly hopButtons: HopButtons;
  /** ...and this for the thumbstick: forward and back, nothing else. */
  private readonly throttle: ThrottleStick;
  /** What the throttle looks like to the flight model. */
  private readonly throttleInput = {x: 0, y: 0, magnitude: 0};
  private readonly bee = new BeeActor();
  private readonly rig: CameraRig;
  private readonly flowers: FlowerField;
  private readonly hive: HiveSite;
  /** Meadow scenery, toggled wholesale against the hive interior. */
  private readonly meadowGroup = new THREE.Group();
  /**
   * Where level 5 builds its maze. Empty otherwise — the woods are generated
   * fresh on entry, so all the Game keeps is the container to toggle.
   */
  private readonly woodsGroup = new THREE.Group();
  /** Where level 6 builds its cave. Empty otherwise, like the woods. */
  private readonly lairGroup = new THREE.Group();
  /** Where level 7 builds its board of streams — same arrangement again. */
  private readonly islandsGroup = new THREE.Group();
  /** And where level 9 builds its mountain. */
  private readonly mountainGroup = new THREE.Group();
  /** "Tap to flap" — level 6's only control. */
  private readonly hold = new HoldInput();
  /** Where the pointer is, for the level that flies to it. */
  private readonly aim: PointerAim;
  private readonly interior: HiveInterior;
  private readonly queen = createQueen();
  private readonly babies: BabyRing;
  private readonly larder: Larder;
  private readonly wasp = new WaspActor();
  private readonly bear = new BearActor();
  private puzzle!: SlidePuzzle;
  /** Level 6's drawing task. Built with the rest of the UI, shown on demand. */
  private mapDraw!: MapDraw;
  private readonly puff = createPollenPuff();
  private readonly fireworks = createFireworks();
  private readonly beacon: THREE.Group;
  private readonly ctx: GameContext;
  private readonly flash: HTMLDivElement;
  /** The wash a cutscene fades through; see setScreenFade. */
  private readonly fade: HTMLDivElement;
  private readonly uiLayer: HTMLDivElement;
  private readonly cottage: CottageScene;
  private readonly honeyJar: DanglingLoad;
  private readonly raycaster = new THREE.Raycaster();
  /** NDC of a tap waiting to be consumed by a level. */
  private pendingTap: THREE.Vector2 | null = null;
  /** Neutral input handed to the bee while a cutscene owns it. */
  private readonly idleStick: StickInput = {x: 0, y: 0, magnitude: 0};

  private level: Level = new FoundingLevel();
  private levelNumber = 1;
  private codenameScreen!: Overlay;
  private completeScreen!: Overlay;
  /** "Try again" / "Back to the map", for a level you can lose. */
  private failScreen!: Overlay;
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
    this.meadowGroup.add(this.bear.object);
    this.stage.scene.add(this.meadowGroup);

    // --- cottage (level 4) ---
    // One open-fronted model is both the cottage and the room she flies into:
    // the jar sits on its mantel and the honey is collected in the same space.
    this.cottage = createCottage(rng);
    this.cottage.group.visible = false;
    this.stage.scene.add(this.cottage.group);

    this.honeyJar = new DanglingLoad(this.cottage.jar, {
      ropeLength: INSIDE.ropeLength,
      gravity: INSIDE.jarGravity,
      damping: INSIDE.jarDamping,
    });
    // The rope hangs in the group's identity root, like the jar it draws to —
    // see the jar's placement in cottage.ts.
    this.cottage.group.add(this.honeyJar.rope);

    // --- windy woods (level 5) ---
    this.woodsGroup.visible = false;
    this.stage.scene.add(this.woodsGroup);

    // --- bear's lair (level 6) ---
    this.lairGroup.visible = false;
    this.stage.scene.add(this.lairGroup);

    // --- silent islands (level 7) ---
    this.islandsGroup.visible = false;
    this.stage.scene.add(this.islandsGroup);

    // --- mouldy mountain (level 9) ---
    this.mountainGroup.visible = false;
    this.stage.scene.add(this.mountainGroup);

    // --- hive interior (level 2) ---
    this.interior = createHiveInterior(rng);
    this.queen.group.position.copy(this.interior.queenPosition);
    this.interior.group.add(this.queen.group);
    this.babies = new BabyRing(this.interior.babyPositions, rng);
    this.interior.group.add(this.babies.group);
    this.larder = new Larder(this.interior.foodCells, this.interior.carried);
    this.interior.group.add(this.larder.rope);
    this.interior.group.visible = false;
    this.stage.scene.add(this.interior.group);

    this.stage.scene.add(this.bee.object);
    this.stage.scene.add(this.puff.mesh);
    this.stage.scene.add(this.fireworks.mesh);

    this.beacon = createBeacon();
    this.beacon.visible = false;
    this.stage.scene.add(this.beacon);

    this.rig = new CameraRig(this.stage.camera);
    // Before the first snap, so a phone opens on the wide shot rather than
    // easing out to it once something happens to call resize().
    this.syncViewportZoom();
    this.rig.snap(this.bee);

    const uiLayer = document.createElement("div");
    this.uiLayer = uiLayer;
    uiLayer.style.position = "absolute";
    uiLayer.style.inset = "0";
    uiLayer.style.pointerEvents = "none";
    host.appendChild(uiLayer);

    this.hud = new Hud(
      uiLayer,
      muted => this.audio.setMuted(muted),
      () => this.openMenu(),
    );
    this.stick = new Joystick(uiLayer);
    this.aim = new PointerAim(this.stage.canvas);
    this.altitude = new AltitudeStick(uiLayer, this.bee.desiredHeight);
    this.turnButtons = new TurnButtons(uiLayer);
    this.hopButtons = new HopButtons(uiLayer);
    this.throttle = new ThrottleStick(uiLayer);

    this.puzzle = createSlidePuzzle(uiLayer, () =>
      this.level.onPuzzleSolved?.(this.ctx),
    );
    this.mapDraw = createMapDraw(uiLayer, () =>
      this.level.onMapDrawn?.(this.ctx),
    );

    this.flash = document.createElement("div");
    this.flash.className = "screen-flash";
    uiLayer.appendChild(this.flash);

    this.fade = document.createElement("div");
    this.fade.className = "screen-fade";
    uiLayer.appendChild(this.fade);

    // Captured for the getters below: inside an object literal `this` is the
    // literal, not the Game.
    const stage = this.stage;
    // Captured for the getters below: an object literal cannot see `this`.
    const game = this;
    /** Scratch for projectToScreen, which returns a shared vector. */
    const screenPoint = new THREE.Vector3();

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
      larder: this.larder,
      wasp: this.wasp,
      bear: this.bear,
      puff: this.puff,
      fireworks: this.fireworks,
      setObjectiveMarker: p => this.setObjectiveMarker(p),
      flashScreen: () => this.flashScreen(),
      setScreenFade: a => this.setScreenFade(a),
      setEnvironment: name => this.setEnvironment(name),
      setFogScale: k => this.stage.setFogScale(k),
      setViewDistance: far => this.stage.setViewDistance(far),
      configureFlight: s => this.configureFlight(s),
      placeBee: (position, desiredHeight, yaw) =>
        this.placeBee(position, desiredHeight, yaw),
      setCameraZoom: z => this.rig.setZoom(z),
      setCameraCinematic: (eye, look) => this.rig.setCinematic(eye, look),
      cameraPosition: this.stage.camera.position,
      framedCameraEye: (centre, halfWidth, pitch, fill) =>
        this.rig.framedEye(centre, halfWidth, pitch, fill),
      showMapDraw: on => {
        if (on) {
          this.mapDraw.show();
        } else {
          this.mapDraw.hide();
        }
      },
      projectToScreen: point => screenPoint.copy(point).project(stage.camera),
      showPuzzle: on => {
        this.setSplit(on);
        if (on) {
          this.puzzle.show();
        } else {
          this.puzzle.hide();
        }
      },
      celebratePuzzle: () => burstRainbow(this.puzzle.root),
      setFlightControls: (on, options) => this.setFlightControls(on, options),
      pickTap: objects => this.pickTap(objects),
      takePress: () => this.hold.takePress(),
      get cameraAspect() {
        return stage.camera.aspect;
      },
      get cameraFov() {
        return stage.camera.fov;
      },
      takeTap: () => {
        const tapped = this.pendingTap !== null;
        this.pendingTap = null;
        return tapped;
      },
      cottage: this.cottage,
      woods: this.woodsGroup,
      lair: this.lairGroup,
      islands: this.islandsGroup,
      mountain: this.mountainGroup,
      hopButtons: this.hopButtons,
      get stick() {
        return game.stick;
      },
      get holding() {
        return game.hold.held;
      },
      aim: this.aim,
      honeyJar: this.honeyJar,
      bringHoney: () => {
        // The jar lives in the cottage scene; carry it across to the meadow so
        // it stays visible on the flight home.
        this.meadowGroup.add(this.cottage.jar);
        this.meadowGroup.add(this.honeyJar.rope);
      },
      releaseBabies: origin => {
        // Reparent so they render in the meadow rather than inside the dome.
        this.meadowGroup.add(this.babies.group);
        this.babies.swarm(origin);
      },
    };

    this.loop = new GameLoop(
      dt => this.update(dt),
      (alpha, frameDt) => this.render(alpha, frameDt),
    );

    // Record taps on the world (not the UI) as normalised device coords, for
    // levels that raycast — the dance mat's pads.
    window.addEventListener("pointerdown", e => {
      if ((e.target as HTMLElement)?.closest?.(".ui-interactive")) {
        return;
      }
      this.pendingTap = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1,
      );
    });

    this.installControlsApi();
    // Silent unless chofter.logControls is on; see core/controlLog.ts.
    watchInput();

    // ?unlock=1 opens every level, for getting straight to the one you're
    // working on. Before buildOverlays, so the menu is built already unlocked.
    // Dev only: it writes to the same save the player uses, and it is not
    // something a shared link should be able to do to a child's progress.
    if (
      import.meta.env.DEV &&
      new URLSearchParams(location.search).has("unlock")
    ) {
      this.save.mutate(d => {
        d.maxLevel = Game.LAST_LEVEL;
        d.completed = [];
        for (let n = 1; n < Game.LAST_LEVEL; n++) {
          d.completed.push(n);
        }
        d.codename ||= "TESTER";
      });
    }

    this.buildOverlays(uiLayer);
    this.loop.start();

    // Dev handle: lets us poke at flight/camera tuning from the console.
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).game = this;
    }
  }

  /**
   * Hang the maze's controls off `window.chofter`, in every build.
   *
   * `window.game` is dev-only, and the controls have now failed twice on an
   * iPad while working on everything else — so the one place they can be
   * prodded from is the console handle that ships. See `core/updates.ts`.
   */
  private installControlsApi(): void {
    const chofter = (
      window as unknown as {
        chofter?: {controls?: unknown; logControls?: boolean};
      }
    ).chofter;
    if (!chofter) {
      return;
    }
    const hold = <T>(
      set: (v: T) => void,
      value: T,
      clear: T,
      ms?: number,
    ): void => {
      set(value);
      if (ms) {
        setTimeout(() => set(clear), ms);
      }
    };
    chofter.controls = {
      state: () => ({
        level: this.levelNumber,
        levelName: this.level.name,
        steering: this.bee.steering,
        controlsLocked: this.level.controlsLocked,
        running: this.running,
        turn: this.turnButtons.turn,
        throttle: Number(this.throttle.value.toFixed(2)),
        turnPadOnScreen: !document
          .querySelector(".turnpad")
          ?.classList.contains("hidden"),
        throttleOnScreen:
          document.querySelector<HTMLElement>(".throttle")?.style.display !==
          "none",
        beeHeadingDeg: Math.round((this.bee.heading * 180) / Math.PI),
        bee: this.bee.position.toArray().map(n => Number(n.toFixed(1))),
      }),
      // `forced` bypasses the buttons entirely, which is how you tell a dead
      // button apart from a control the game isn't reading.
      turn: (dir: number, ms?: number) =>
        hold(v => this.turnButtons.force(v), dir, null, ms ?? 600),
      throttle: (value: number, ms?: number) =>
        hold(v => this.throttle.force(v), value, null, ms ?? 600),
      tap: {
        left: (ms?: number) => this.pressTurnButton("left", ms),
        right: (ms?: number) => this.pressTurnButton("right", ms),
      },
      at: (x?: number, y?: number) => {
        const name = (el: Element | null): string =>
          el ? `${el.tagName}.${el.className}` : "nothing";
        if (typeof x === "number" && typeof y === "number") {
          return name(document.elementFromPoint(x, y));
        }
        // No point given: check each control against itself.
        const probe = (label: string, el: Element | null) => {
          if (!el) {
            return {[label]: "not on screen"};
          }
          const r = el.getBoundingClientRect();
          const cx = Math.round(r.left + r.width / 2);
          const cy = Math.round(r.top + r.height / 2);
          const top = document.elementFromPoint(cx, cy);
          return {
            [label]: {
              at: [cx, cy],
              size: [Math.round(r.width), Math.round(r.height)],
              onTop: name(top),
              reachable: !!top && (top === el || el.contains(top)),
            },
          };
        };
        return {
          ...probe("turnLeft", this.turnButtons.buttons.left),
          ...probe("turnRight", this.turnButtons.buttons.right),
          ...probe("throttle", document.querySelector(".throttle")),
          screen: [window.innerWidth, window.innerHeight],
        };
      },
      help: () => {
        console.log(
          [
            "chofter.logControls = true   narrate every press and release",
            "chofter.controls.state()     steering, turn, throttle, what's on screen",
            "chofter.controls.turn(1)     turn right, bypassing the buttons (-1 left, 0 stop)",
            "chofter.controls.throttle(1) drive, bypassing the track",
            "chofter.controls.tap.left()  press the real button, through the DOM",
            "chofter.controls.at()        is anything sitting over the controls?",
            "",
            "With logControls on, every pointer and touch the document sees is",
            "logged too — so a press that never reaches the button is obvious.",
            "",
            "If turn() moves her and tap() does not, the button is at fault.",
          ].join("\n"),
        );
      },
    };
  }

  /**
   * Press a turn button for real, through the DOM.
   *
   * The point of it is to tell a dead button apart from a control the game
   * isn't reading: if `chofter.controls.turn(1)` moves her and this doesn't,
   * the fault is between the finger and the handler.
   */
  private pressTurnButton(which: "left" | "right", ms = 400): void {
    const btn = this.turnButtons.buttons[which];
    const r = btn.getBoundingClientRect();
    const opts = {
      bubbles: true,
      cancelable: true,
      pointerId: 999,
      pointerType: "touch",
      isPrimary: true,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
    };
    btn.dispatchEvent(new PointerEvent("pointerdown", opts));
    setTimeout(() => {
      btn.dispatchEvent(new PointerEvent("pointerup", opts));
    }, ms);
  }

  /** Re-measure the canvas. Called when the visible viewport changes. */
  resize(): void {
    this.stage.resize();
    this.syncViewportZoom();
  }

  /**
   * Widen the shot on a small screen.
   *
   * The world doesn't get smaller on a phone, the window onto it does, so the
   * same rig that frames the meadow nicely on an iPad leaves a phone player
   * flying into things they never saw. Keyed off the shorter side so it catches
   * a phone in either orientation and leaves a tablet alone either way up.
   */
  private syncViewportZoom(): void {
    const {narrow, wide, zoom} = CAMERA.smallScreen;
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const t = (wide - shortSide) / (wide - narrow);
    const amount = Math.max(0, Math.min(1, t));
    this.rig.setViewportZoom(1 + (zoom - 1) * amount);
  }

  // ---- level management ---------------------------------------------------

  /** The levels that actually exist. Saves beyond the last one clamp back. */
  private static readonly LEVELS: ReadonlyArray<{
    number: number;
    name: string;
  }> = [
    {number: 1, name: "Sunny Meadow"},
    {number: 2, name: "The Royal Chamber"},
    {number: 3, name: "Wasp at the Hive"},
    {number: 4, name: "Caramel Cottage"},
    {number: 5, name: "The Windy Woods"},
    {number: 6, name: "The Bear's Lair"},
    {number: 7, name: "Bee vs Frog"},
    {number: 8, name: "Ant Hunt"},
    {number: 9, name: "Up the Mountain"},
    {number: 10, name: "Down the Mountain"},
  ];

  private static readonly LAST_LEVEL = Game.LEVELS.length;

  private createLevel(n: number): Level {
    if (n >= 10) {
      return new DescentLevel();
    }
    if (n === 9) {
      return new AscentLevel();
    }
    if (n === 8) {
      return new AntHuntLevel();
    }
    if (n === 7) {
      return new IslandsLevel();
    }
    if (n === 6) {
      return new LairLevel();
    }
    if (n === 5) {
      return new MazeLevel();
    }
    if (n === 4) {
      return new CottageLevel();
    }
    if (n === 3) {
      return new WaspLevel();
    }
    if (n === 2) {
      return new RoyalChamberLevel();
    }
    return new FoundingLevel();
  }

  private switchLevel(n: number): void {
    const clamped = Math.min(Math.max(1, n), Game.LAST_LEVEL);
    this.levelNumber = clamped;
    this.save.mutate(d => {
      d.maxLevel = Math.max(d.maxLevel, clamped);
    });
    // Levels that don't want a wasp shouldn't have to say so; level 3 spawns
    // its own in enter(). Same for the brood: they live in the hive unless a
    // level explicitly lets them out.
    // Let the outgoing level put away anything that outlives it, and take the
    // backing track away regardless, so a level that forgets can't leak one.
    this.level.exit?.(this.ctx);
    // Any card belonging to the level being left goes with it. Both of the
    // fail card's buttons already hide it, so this is only insurance against a
    // future path that switches level without going through one of them.
    this.failScreen?.hide();
    this.audio.stopMusic();
    this.wasp.reset();
    this.bear.reset();
    this.setSplit(false);
    this.mapDraw.hide();
    // A cutscene abandoned mid-wash — quitting to the menu from inside the
    // cottage — would otherwise leave the next level behind a white screen.
    this.setScreenFade(0);
    this.interior.group.add(this.babies.group);
    // Put the honey back on the cottage mantel before any level starts — a run
    // through level 4 reparents it to the bee and then the meadow.
    this.cottage.group.add(this.cottage.jar);
    this.cottage.group.add(this.honeyJar.rope);
    this.cottage.jar.visible = true;
    this.honeyJar.reset(this.cottage.jarRest);
    // The halo only belongs on during the gather; keep it off everywhere else,
    // including the meadow levels where the far cottage is on screen.
    this.cottage.glow.mesh.visible = false;
    this.audio.setThreat(0);
    // Flight is the default; a level turns it off in enter() if it wants taps.
    this.setFlightControls(true);
    // Level 7's buttons belong to level 7. It turns them on itself once its
    // opening shot is over.
    this.hopButtons.setVisible(false);
    // And nothing anyone was holding in the level being left carries into the
    // one being entered — see TurnButtons.release, and the maze that started
    // with the bee turning on the spot because of a key pressed two levels
    // earlier.
    this.turnButtons.release();
    this.hold.release();
    // A level that pushed the lens out doesn't get to leave it out.
    this.stage.setViewDistance(null);
    // And she does not start a level flung at wherever the finger was when the
    // last one's card was tapped.
    this.aim.reset();
    this.level = this.createLevel(clamped);
    this.completeScreen.setText(
      this.level.completionTitle,
      this.level.completionBody,
    );
    this.completeScreen.setButton?.(
      this.level.finishesGame ? "Back to the map" : "Keep flying",
    );
    this.level.enter(this.ctx);
    this.syncCottageGate();
  }

  /**
   * The gate at the mouth of the cottage lane.
   *
   * Caramel Cottage sits in the same world as the meadow, so from level 1 you
   * can see the lane leading north to it — and could fly up it. Until the
   * cottage is unlocked there's nothing there to do, so the gate stays shut and
   * the meadow stops at the fence. Level 4 itself is always allowed through,
   * whatever the save says.
   */
  private syncCottageGate(): void {
    const open = this.save.unlockedThrough() >= 4 || this.levelNumber >= 4;
    this.cottage.setGateOpen(open);
    this.bee.bounds.minZ = open
      ? -Infinity
      : this.cottage.gate.z + GATE_STANDOFF;
  }

  /**
   * True if the player has already finished this level, so picking it from the
   * welcome screen means "play it again" rather than "carry on".
   *
   * Only level 1 needs asking: the babies live in memory, so level 2 always
   * starts fresh on a new session anyway.
   */
  private isLevelFinished(n: number): boolean {
    if (n !== 1) {
      return false;
    }
    const {gathered, maxLevel} = this.save.data;
    return (
      maxLevel > 1 &&
      POLLEN_KINDS.every(k => gathered[k] >= LEVELS.foundingQuota[k])
    );
  }

  /** Wind a finished level back to its start so it can be replayed. */
  private restartLevel(n: number): void {
    if (n !== 1) {
      return;
    }
    this.save.mutate(d => {
      d.gathered = {white: 0, yellow: 0, orange: 0};
    });
  }

  private setEnvironment(name: EnvironmentName): void {
    // The cottage clearing stands at the north end of the meadow rather than in
    // a world of its own, so 'cottage' shows both: from the mat you can see
    // through the gate to the hive, and the flight home needs no cut.
    this.meadowGroup.visible = name === "meadow" || name === "cottage";
    // …and the clearing shows in the meadow too, so the gap in the hedge to the
    // north has a cottage at the end of it rather than nothing.
    this.cottage.group.visible = name === "meadow" || name === "cottage";
    this.interior.group.visible = name === "hive";
    this.woodsGroup.visible = name === "woods";
    this.lairGroup.visible = name === "lair";
    this.islandsGroup.visible = name === "islands";
    this.mountainGroup.visible = name === "mountain";
    this.stage.setEnvironment(
      name === "hive"
        ? HIVE_ENV
        : name === "woods"
          ? WOODS_ENV
          : name === "lair"
            ? LAIR_ENV
            : name === "islands"
              ? ISLANDS_ENV
              : name === "mountain"
                ? MOUNTAIN_ENV
                : name === "cottage"
                  ? COTTAGE_ENV
                  : MEADOW_ENV,
    );
  }

  private configureFlight(s: FlightSettings): void {
    this.bee.steering = s.steering ?? "camera";
    this.bee.speedScale = s.speedScale ?? 1;
    // A level either flies or it turns, so the two controls swap places. The
    // maze has nothing to do with altitude — she holds one height throughout.
    const tank = this.bee.steering === "tank";
    this.altitude.setVisible(!tank);
    this.turnButtons.setVisible(tank);
    this.throttle.setVisible(tank);
    // The floating thumbstick reads a whole circle of directions, which is
    // exactly what the maze doesn't want; the throttle answers for it there.
    this.stick.enabled = !tank;
    this.bee.bounds.radius = s.boundsRadius;
    this.bee.bounds.sphereRadius = s.boundsSphere ?? Infinity;
    // Bounds sit about the world origin unless a level recentres them; the
    // cottage interior does, since the house stands far to the north.
    this.bee.bounds.centreX = s.boundsCentre?.x ?? 0;
    this.bee.bounds.centreZ = s.boundsCentre?.z ?? 0;
    // The lane north is walled off or not by syncCottageGate, which runs after
    // the level has had its say; clear it here so nothing leaks between levels.
    this.bee.bounds.minZ = -Infinity;
    this.rig.distance = s.cameraDistance;
    this.rig.height = s.cameraHeight;
    // Only the hive interior asks to be fenced in; everywhere else the camera
    // has open sky behind it.
    this.rig.setEnclosure(s.cameraEnclosure ?? null);
    this.rig.setMaxZoom(s.maxCameraZoom ?? null);
    // A new level starts framed normally; it can widen the shot itself.
    this.rig.setZoom(1, true);
    // A new level starts with the follow rig in charge.
    this.rig.setCinematic(null);
    this.altitude.setRange(
      s.minHeight,
      s.maxHeight,
      THREE.MathUtils.clamp(this.bee.desiredHeight, s.minHeight, s.maxHeight),
    );
  }

  private placeBee(
    position: THREE.Vector3,
    desiredHeight?: number,
    yaw?: number,
  ): void {
    this.bee.scripted = false;
    this.bee.object.visible = true;
    this.bee.setScale(1);
    this.bee.teleport(position);
    const height = desiredHeight ?? position.y;
    this.bee.snapHeight(height);
    this.altitude.setHeight(height);
    this.rig.snap(this.bee, yaw);
  }

  private buildOverlays(uiLayer: HTMLElement): void {
    this.completeScreen = createMessageScreen(
      uiLayer,
      this.level.completionTitle,
      this.level.completionBody,
      "Keep flying",
      () => {
        this.completeScreen.hide();
        // Every level ends the same way: back to the map. A level that has one
        // opens it with the *next* level already selected, so a finish flows
        // straight into choosing where to go next; the last level, with nothing
        // after it, opens the map where it is. `showMenu`, not `openMenu` — this
        // button has decided, and must never be a press that appears to do
        // nothing.
        if (this.level.finishesGame) {
          this.showMenu();
        } else {
          this.showMenu(Math.min(this.levelNumber + 1, Game.LAST_LEVEL));
        }
      },
    );

    this.failScreen = createChoiceScreen(
      uiLayer,
      "Bonk!",
      "You bumped into a rock. That happens to everybody — the cave is tricky. Want another go?",
      "Try again",
      "Back to the map",
      () => {
        this.failScreen.hide();
        this.running = true;
        // A level that can pick up where it left off says so; see Level.retry.
        // Everything else goes back in at the start, where `switchLevel`
        // re-enters the level and it builds itself fresh, so there is nothing
        // to unwind here.
        if (this.level.retry) {
          this.level.retry(this.ctx);
          return;
        }
        this.switchLevel(this.levelNumber);
      },
      () => {
        this.failScreen.hide();
        this.showMenu();
      },
    );

    this.buildCodenameScreen(uiLayer);
    this.codenameScreen.show();
  }

  /**
   * Built fresh each time it's shown, because the unlocked levels, the
   * "play again" notes and the default selection all move as the player
   * progresses.
   */
  private buildCodenameScreen(
    uiLayer: HTMLElement,
    selected = this.save.data.level,
  ): void {
    const unlocked = Math.min(this.save.unlockedThrough(), Game.LAST_LEVEL);

    this.codenameScreen = createCodenameScreen(uiLayer, {
      existing: this.save.data.codename,
      // The map shows every land, so hand over every level and let it decide
      // what to padlock.
      levels: Game.LEVELS.map(l => ({
        ...l,
        note: this.isLevelFinished(l.number)
          ? "Play again from the start"
          : undefined,
      })),
      unlocked,
      selected: Math.min(Math.max(1, selected), Game.LAST_LEVEL),
      onStart: (codename, level) => {
        this.audio.unlock();
        this.save.mutate(d => {
          d.codename = codename;
          d.level = level;
        });
        // Picking a level you've already finished means replaying it.
        if (this.isLevelFinished(level)) {
          this.restartLevel(level);
        }
        this.codenameScreen.hide();
        this.switchLevel(level);
        this.running = true;
      },
      onReset: () => {
        this.save.reset();
        location.reload();
      },
    });
  }

  /**
   * Hide the flight controls and stop the joystick listening, so a level that
   * wants taps on the world (the dance mat) isn't fighting a thumbstick.
   */
  private setFlightControls(enabled: boolean, options?: FlightControls): void {
    this.uiLayer.classList.toggle("no-flight", !enabled);
    this.stick.enabled = enabled;
    // The altitude slider is hidden separately: level 9 wants the stick and
    // has no use for height, and the two have always been one switch.
    this.altitude.setVisible(enabled && (options?.altitude ?? true));
    this.stick.anywhere = options?.anywhere ?? false;
  }

  /**
   * Give the right-hand side of the screen over to the puzzle. The CSS does
   * the layout; the resize makes the renderer follow the narrower canvas.
   */
  private setSplit(on: boolean): void {
    if (this.uiLayer.parentElement) {
      this.uiLayer.parentElement.classList.toggle("split", on);
    }
    // The panel only makes sense while the screen is split for it. Tying the
    // two together here means every path that ends a level — the menu, a level
    // switch, a restart — puts the puzzle away without having to remember to.
    if (!on) {
      this.puzzle.hide();
    }
    this.stage.resize();
  }

  /** Raycast this frame's tap, if there was one, against `objects`. */
  private pickTap(
    objects: ReadonlyArray<THREE.Object3D>,
  ): THREE.Object3D | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    if (!tap) {
      return null;
    }
    this.raycaster.setFromCamera(tap, this.stage.camera);
    const hits = this.raycaster.intersectObjects(
      objects as Array<THREE.Object3D>,
      false,
    );
    return hits.length ? hits[0].object : null;
  }

  /**
   * The 🏠 button: pause and go back to the level menu.
   *
   * Guarded on the menu already being up, not on `running` — otherwise it
   * silently does nothing whenever another card is showing. Anything that has
   * *decided* to go to the menu should call `showMenu` and not have to know
   * about the guard: a button that does nothing is the worst possible answer.
   */
  private openMenu(): void {
    if (!this.codenameScreen.root.classList.contains("hidden")) {
      return;
    }
    this.showMenu();
  }

  /**
   * Put the menu up, whatever else is on screen.
   *
   * `selected` is which level sits highlighted; by default the one they are on
   * (or the save's, whichever is further). A caller that has just finished a
   * level passes the next one, so the map opens ready to go on rather than on
   * the level just cleared.
   */
  private showMenu(
    selected = Math.max(this.levelNumber, this.save.data.level),
  ): void {
    this.completeScreen.hide();
    this.running = false;
    this.audio.setThreat(0);
    // Not `setFlightIntensity(0)` — that is a bee hovering, and she carried on
    // buzzing under the map after the maze. On the menu there is no bee.
    this.audio.silenceFlight();
    // Nothing resumes from here — the menu always ends in a level switch — so
    // the backing track goes with the level it belonged to.
    this.audio.stopMusic();
    // Drop the old card and rebuild it against current progress.
    this.codenameScreen.root.remove();
    this.buildCodenameScreen(this.uiLayer, selected);
    this.codenameScreen.show();
  }

  private update(dt: number): void {
    if (!this.running) {
      return;
    }

    const locked = this.level.controlsLocked;

    const tank = this.bee.steering === "tank";
    // With the slider gone there is nothing to read; the level set her height.
    if (!locked && !tank) {
      this.bee.desiredHeight = this.altitude.desiredHeight;
    }
    if (tank) {
      // Eased, so the knob and the bee both glide rather than snapping between
      // the dead zone, full ahead and let-go.
      this.throttle.update(dt);
      // Up the track is forward, and the flight model reads forward as -y.
      this.throttleInput.y = -this.throttle.value;
      this.throttleInput.magnitude = Math.abs(this.throttle.value);
    }
    this.bee.update(
      dt,
      locked ? this.idleStick : tank ? this.throttleInput : this.stick,
      this.rig.yaw,
      locked || !tank ? 0 : this.turnButtons.turn,
    );
    // The jar hangs from the bee's belly wherever she goes.
    this.honeyJar.update(
      dt,
      tmpBelly.copy(this.bee.position).setY(this.bee.position.y - 0.35),
    );
    this.altitude.setActualHeight(this.bee.height);

    // Flowers only exist in the meadow, and harvesting is suspended during a
    // cutscene; the level still runs so its state machine can advance.
    const harvest =
      locked || !this.meadowGroup.visible
        ? null
        : this.flowers.update(dt, this.bee.position);
    const wasComplete = this.level.complete;
    const wasFailed = this.level.failed;
    this.level.update(dt, this.ctx, harvest);

    // After the level, so a cutscene's freshly written position is what the
    // camera actually frames this step. The rig follows harder when nobody is
    // steering, so it needs to know whether a thumb is down.
    // Only camera-relative steering feeds back into the rig, so only it wants
    // the gentle follow; under tank steering the yaw is the player's and the
    // camera can simply come round behind her.
    this.rig.update(
      dt,
      this.bee,
      !locked && this.bee.steering === "camera" && this.stick.magnitude > 0.05,
    );

    this.puff.update(dt);
    this.fireworks.update(dt);
    this.audio.setFlightIntensity(locked ? 0 : this.bee.speed01);
    // Level 2 drives the dwell meter itself (loading and feeding).
    if (this.meadowGroup.visible) {
      this.hud.setHarvest(locked ? 0 : this.flowers.harvestProgress);
    }

    if (!wasFailed && this.level.failed) {
      this.running = false;
      this.failScreen.setText(
        this.level.failTitle ?? "Bonk!",
        this.level.failBody ??
          "You bumped into a rock. That happens to everybody — the cave is tricky. Want another go?",
      );
      this.failScreen.show();
    }

    if (!wasComplete && this.level.complete) {
      this.running = false;
      // Finishing a level opens the next one, whether or not the level that
      // just ended remembered to say so.
      //
      // It used to unlock only what the save pointed at, and each level moved
      // that pointer itself on completion. Level 6 didn't — it was the last
      // level when it was written — so finishing the Bear's Lair left the
      // Silent Islands locked and the only way in was to play the cave again.
      // The pointer still decides which land the map opens on; what is
      // *unlocked* is now simply the level after this one.
      this.save.markComplete(this.levelNumber);
      this.save.mutate(d => {
        d.maxLevel = Math.max(
          d.maxLevel,
          d.level,
          Math.min(this.levelNumber + 1, Game.LAST_LEVEL),
        );
      });
      this.save.flush();
      this.completeScreen.show();
    }

    // A tap belongs to the frame it landed in. Without this it sits there
    // until something happens to ask, and the next thing that does gets a tap
    // from minutes ago — the maze's survey would skip itself the moment it
    // began, on the strength of a tap taken while she was still flying.
    this.pendingTap = null;
  }

  private setScreenFade(alpha: number): void {
    const a = THREE.MathUtils.clamp(alpha, 0, 1);
    this.fade.style.opacity = String(a);
  }

  private flashScreen(): void {
    this.flash.classList.remove("on");
    void this.flash.offsetWidth; // restart the animation
    this.flash.classList.add("on");
  }

  private render(alpha: number, frameDt: number): void {
    this.elapsed += frameDt;
    this.bee.render(alpha);
    if (this.wasp.visible) {
      this.wasp.render(alpha);
    }
    if (this.bear.visible) {
      this.bear.render(alpha);
    }
    if (this.meadowGroup.visible) {
      this.hive.updateGlow(this.elapsed);
    }
    // The door and the gate both live here, and the gate matters in every
    // outdoor level, not just level 4's.
    if (this.cottage.group.visible) {
      this.cottage.update(this.elapsed);
    }
    if (this.interior.group.visible) {
      this.queen.animate(this.elapsed, 0, 0);
    }

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

    // A card over the game dims everything the page shows — except the strip
    // iOS keeps for itself, which would sit there undimmed and obvious. One
    // query a frame, and it only repaints when the answer changes.
    this.stage.setPageDim(
      !!this.uiLayer.querySelector(".overlay:not(.hidden)"),
    );

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
