import * as THREE from "three";
import {
  BUMP,
  CAMERA,
  ITEM,
  TRAIL,
  CAR,
  PLAYER,
  RIVALS,
  SCENERY,
  START,
  SKID,
  TRACK,
} from "./config";
import {TrackSpec} from "./track/spec";
import {Patches} from "./entities/patches";
import {Bridges} from "./entities/bridges";
import {Tyres} from "./entities/tyres";
import {Stands} from "./entities/stands";
import {beginWatching, sawFrame} from "./core/quality";
import {carColour, myDesign} from "./core/garage";
import {myStickers} from "./core/stickers";
import {LOADING, SIM} from "./config";
import {MiniMap} from "./ui/minimap";
import {NearFade} from "../../shared/fadeInFront";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Engine} from "./core/audio";
import {Stage} from "./render/stage";
import {signed, Track, wrap} from "./entities/track";
import {Car, Drive} from "./entities/car";
import {Rivals} from "./entities/rivals";
import {Skids} from "./entities/skids";
import {Scenery} from "./entities/scenery";
import {Hud, ordinal} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

/**
 * Vroom.
 *
 * A car, a circuit and one lap. The plan asks for the Amiga game by name and
 * points at pictures of it, so this is what those pictures are: straight down
 * from above, flat colour, cars as sprites, kerbs and trees and a crowd.
 *
 * The controls are the caterpillar's, which the plan asks for by name — one
 * floating thumbstick, planted wherever the finger lands. Here it is the tiller
 * and the throttle at once, and because the shot never turns, the way you push
 * it *is* the way on the screen you want to go. Nothing to learn.
 *
 * The Game owns the scene and everything in it. Fixed timestep at SIM.step
 * with the render interpolating between steps, the same as the other games.
 */
export class Game {
  stage!: Stage;
  private readonly spec: TrackSpec;
  private readonly host: HTMLElement;
  private readonly ui: HTMLElement;
  track!: Track;
  car!: Car;
  rivals!: Rivals;
  skids!: Skids;
  /** Oil and mud tracked out of a patch, in their own pool: they last ten
   *  seconds where rubber lasts seven, and they are not black. */
  trails!: Skids;
  patches!: Patches;
  bridges!: Bridges;
  tyres!: Tyres;
  stands!: Stands;
  private scenery!: Scenery;
  /** Everything that dissolves when it stands between the camera and the car. */
  private fades: Array<NearFade> = [];
  readonly engine: Engine;
  readonly hud: Hud;
  readonly stick: Joystick;
  loop!: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the race
   *  still while the circuit is already being drawn behind it. */
  running = false;

  /** How far the player has come, in laps, and where they were last step. */
  private progress = 0;
  /** The player's grid slot, as a signed distance from the start line. */
  private began = 0;
  private lastT = 0;
  /** Over the line. */
  private finished = false;
  /**
   * How far into the start sequence, or -1 once the flag has dropped.
   *
   * While this is running the race is held still — nobody moves, the stick
   * does nothing — and the camera is down in front of the grid.
   */
  private counting = -1;
  /**
   * Where the shot is between the two poses: 0 is the grid, 1 is racing.
   *
   * It starts at the grid, so the circuit is already being looked at head-on
   * behind the opening card.
   */
  private shot = 0;
  private readonly countdown = document.createElement("div");
  private map!: MiniMap;
  /** Reused every frame rather than rebuilt: the map wants four points and
   *  there are sixty frames a second of them. */
  private readonly onMap: Array<{x: number; z: number}> = [];
  private shownBeat = -1;
  /** How long since the flag, for the shot coming back down in front. */
  private finishing = -1;
  /** How many times round this race is. */
  private laps = 1;

  private readonly intro: Overlay;
  private readonly done: Overlay;

  /** Seconds since the flag dropped, and until the next mark is laid. */
  private time = 0;
  private skidIn = 0;
  private trailIn = 0;
  /** How long until another car-to-car bump is allowed to be heard. */
  private nudgeIn = 0;
  /** How many times the barriers have been hit, for the finish card. */
  private knocks = 0;

  private readonly want = new THREE.Vector2();
  /** The two controls, held rather than made every step. */
  private readonly aimDrive: Drive = {kind: "aim", aim: this.want};
  private readonly keyDrive = {kind: "wheel" as const, steer: 0, throttle: 0};
  private readonly wheels = [new THREE.Vector2(), new THREE.Vector2()];
  private readonly corners = [
    new THREE.Vector2(),
    new THREE.Vector2(),
    new THREE.Vector2(),
    new THREE.Vector2(),
  ];
  private readonly eye = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();

  constructor(
    host: HTMLElement,
    ui: HTMLElement,
    spec: TrackSpec,
    /** Back to the track list. The gallery's own home button is beside it and
     *  goes somewhere else entirely, so both are needed. */
    private readonly onExit: () => void,
    /** Another go on the same circuit. The shell throws this Game away and
     *  builds a fresh one, which is much less to get wrong than unwinding a
     *  finished race in place. */
    private readonly onAgain: () => void,
  ) {
    this.spec = spec;
    this.host = host;
    this.ui = ui;

    this.engine = new Engine();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;

    this.intro = new Overlay(
      ui,
      spec.name,
      "You are the red car, and you are starting at the back. Touch anywhere on the screen and the car drives to your finger — the further away you point, the faster it goes, and touching the car itself lets it coast. On a computer the arrow keys steer left and right, and up and down are the pedals. Take a corner too fast and the back end will step out and leave black marks all over the road — that is the whole fun of it, and it is quicker than it looks if you can catch it. The grass will slow you down and the wall at the edge will not let you past. One lap.",
      "Lights out",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "Chequered flag!", "", "Race again", () =>
      this.onAgain(),
    );
    this.done.hide();

    this.countdown.className = "countdown hidden";
    ui.appendChild(this.countdown);

    const corner = document.createElement("div");
    corner.className = "corner-buttons";
    const home = document.createElement("a");
    home.className = "icon-button ui-interactive";
    home.href = "../../";
    home.textContent = "🏠";
    home.title = "Chofter Games";
    home.setAttribute("aria-label", "Back to Chofter Games");
    corner.appendChild(home);
    const tracks = document.createElement("button");
    tracks.className = "icon-button ui-interactive";
    tracks.type = "button";
    tracks.textContent = "🏁";
    tracks.title = "Choose a track";
    tracks.setAttribute("aria-label", "Choose a track");
    tracks.addEventListener("click", () => this.onExit());
    corner.appendChild(tracks);
    const sound = new SoundButton({
      onToggle: muted => this.engine.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page left revving behind the one a
    // child has moved on to is a bug the caterpillar game had once already.
    window.addEventListener("pagehide", () => this.engine.stop());
  }

  /**
   * Builds the race, in steps, with the screen held while it happens.
   *
   * All of this used to be done in the constructor and the loop started on top
   * of it — so the opening seconds of a race were shaders compiling and
   * geometry going to the card while the countdown was already running. Doing
   * it here, behind the waiting card, is the whole difference between a race
   * that starts and one that stutters into life.
   *
   * The awaits are not decoration. Each hands the frame back to the browser so
   * the bar can actually paint; without them this would still be one long
   * block and the bar would jump from nothing to done.
   */
  async load(report: (done: number, what?: string) => void): Promise<void> {
    const spec = this.spec;
    // Seeded, so the trees and the crowd are in the same places every time. A
    // driver who learns a corner by the tree beside it should find that tree
    // there tomorrow.
    const rng = new Rng(SCENERY.seed);

    report(0.05, "Laying the road\u2026");
    await frame();
    this.laps = spec.laps;
    this.track = new Track(spec);
    const palette = this.track.palette;
    this.stage = new Stage(this.host, palette);

    report(0.25, "Rolling out the cars\u2026");
    await frame();
    this.car = new Car(carColour(spec.environment), myDesign(), myStickers());
    this.rivals = new Rivals(this.track);
    this.skids = new Skids(palette);
    this.trails = new Skids(palette, TRAIL.max);
    this.patches = new Patches(this.track, spec.items);
    this.bridges = new Bridges(this.track, palette);
    this.tyres = new Tyres(rng, this.track, palette);
    this.stands = new Stands(rng, this.track, palette, spec.environment);

    report(0.45, "Building the scenery\u2026");
    await frame();
    this.scenery = new Scenery(rng, this.track, palette);
    this.fades = [...this.track.fades, ...this.scenery.fades];

    report(0.65, "Putting it all together\u2026");
    await frame();
    this.stage.scene.add(this.track.group);
    this.stage.scene.add(this.scenery.group);
    this.stage.scene.add(this.tyres.group);
    this.stage.scene.add(this.stands.group);
    this.stage.scene.add(this.patches.group);
    this.stage.scene.add(this.skids.mesh);
    this.stage.scene.add(this.trails.mesh);
    this.stage.scene.add(this.rivals.group);
    this.stage.scene.add(this.car.group);
    // Last, and drawn over everything: where the circuit runs over itself, the
    // later part of the lap is on top of the earlier one.
    this.stage.scene.add(this.bridges.group);

    this.hud.setLaps(this.laps);
    this.map = new MiniMap(this.track, [
      carColour(spec.environment),
      ...this.rivals.colours,
    ]);
    this.map.mount(this.ui);
    this.gridUp();
    this.snapCamera();

    report(0.75, "Warming up the shaders\u2026");
    await frame();
    // The one that matters. Every material compiles the first time it is
    // drawn, and on a heavy level that is most of a second — which used to be
    // spent with the countdown already running.
    await this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera);

    report(0.9, "Nearly there\u2026");
    // And a few real frames, because compiling is not the whole of it:
    // geometry and textures go to the card the first time they are drawn, and
    // the bloom pass has shaders of its own that compileAsync never sees.
    for (let i = 0; i < LOADING.warmFrames; i++) {
      await frame();
      this.render(1, SIM.step);
    }

    report(1, "Ready");
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  /** Everybody on the grid: the rivals in front, the player at the back. */
  private gridUp(): void {
    const t = this.track.gridAt(RIVALS.count, PLAYER.offset, this.here);
    // Where the player's grid slot is, relative to the line. Kept because
    // placing is decided on how far past the line each car is, and the player
    // starts the furthest back of the four.
    this.began = signed(t - this.track.startAt);
    const d = this.track.tangentAt(t, this.eye);
    this.car.place(
      this.here.x,
      this.here.z,
      Math.atan2(d.x, d.z),
      Math.round(t * TRACK.segments),
      0,
    );
    this.lastT = t;
    this.progress = 0;
  }

  private begin(): void {
    this.intro.hide();
    // Not running yet: the lights have to go out first. The stick is dead and
    // so is everybody else on the grid until they do.
    this.counting = 0;
    this.shownBeat = -1;
    // From here on the game judges how well it is keeping up.
    beginWatching();
    this.countdown.classList.remove("hidden");
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.engine.start();
  }

  /**
   * Three, two, one, go.
   *
   * The camera leaves before "one" rather than on "go", because the pull-back
   * is the thing that tells a child the race is about to start — it has to be
   * over by the time it is.
   */
  private tickStart(dt: number): void {
    this.counting += dt;

    const beat = Math.floor(this.counting / START.beat);
    if (beat !== this.shownBeat) {
      this.shownBeat = beat;
      const word = beat >= 3 ? "Go!" : `${3 - beat}`;
      this.countdown.textContent = word;
      this.countdown.classList.toggle("go", beat >= 3);
      // Restarted rather than left running, so each number lands with its own
      // beat instead of the animation drifting away from the clock.
      this.countdown.style.animation = "none";
      void this.countdown.offsetWidth;
      this.countdown.style.animation = "";
    }

    const pulling = Math.max(0, this.counting - START.pullsAt);
    this.shot = Math.min(1, pulling / START.pullsFor);

    if (this.counting >= START.beat * 3) {
      this.running = true;
      this.stick.enabled = true;
    }
    if (this.counting >= START.beat * 3 + START.goFor) {
      this.counting = -1;
      this.countdown.classList.add("hidden");
    }
  }

  update = (dt: number): void => {
    if (this.counting >= 0) {
      this.tickStart(dt);
    }
    if (!this.running || this.finished) {
      return;
    }
    this.time += dt;

    this.car.update(dt, this.controls(), this.track, this.patches);
    this.rivals.update(dt, this.track, this.patches);

    // Cars off each other before cars off the wall: a shove is what can put
    // you into the barrier, and it should be corrected in the same step rather
    // than leaving the car a frame inside it.
    // Cars off each other and everybody off the tyre stacks. Same cooldown for
    // both: what a child hears is "I hit something", and hitting two things at
    // once is still one noise.
    let knocked = this.jostle();
    if (this.tyres.bounce(this.car)) {
      knocked = true;
    }
    for (const rival of this.rivals.cars) {
      this.tyres.bounce(rival);
    }
    this.nudgeIn -= dt;
    if (knocked && this.nudgeIn <= 0) {
      this.nudgeIn = BUMP.quiet;
      this.engine.bump();
    }
    if (this.car.keepIn(this.track)) {
      this.knocks++;
      this.engine.bump();
    }

    // Who is over a flyover and who is under one, before anything is drawn.
    this.car.setAbove(this.bridges.above(this.car.hint));
    this.rivals.setAbove(i => this.bridges.above(i));
    this.bridges.update(dt, this.car.hint);
    // The city's faulty signs, which stutter on their own clock.
    this.scenery.update(
      this.time,
      dt,
      this.car.position.x,
      this.car.position.z,
    );

    this.layRubber(dt);
    this.layTrails(dt);
    this.skids.update(dt);
    this.trails.update(dt);
    this.lapCount();
    this.engine.update(dt, this.car.speed, this.car.slip, CAR.top);
    this.hud.update(
      Math.max(0, Math.min(1, this.progress / this.laps)),
      this.place(),
    );
    this.drawMap();
  };

  /**
   * Whichever control is actually being used.
   *
   * The stick goes straight through, and this is the one game in the repo that
   * needs no camera-relative arithmetic to do it: the shot looks down and never
   * turns, so screen right is world +X and screen down is world +Z, full stop.
   *
   * A keyboard is a different control and not a squarer stick — left and right
   * of the car's own nose — so it is handed over as one. A finger on the glass
   * always wins.
   */
  private controls(): Drive {
    if (this.stick.onKeys) {
      this.keyDrive.steer = this.stick.steer;
      this.keyDrive.throttle = this.stick.throttle;
      return this.keyDrive;
    }
    this.want.set(this.stick.x, this.stick.y);
    return this.aimDrive;
  }

  /**
   * Where the player is in the race.
   *
   * Straight off how far everybody has come. There is no lap logic to it
   * because there is only one lap — the plan asks for one and one is plenty
   * when a child is learning to hold a car sideways.
   */
  private place(): number {
    // How far past the start line the player is — their own distance plus the
    // slot they started from, which is behind the line and behind all three
    // rivals. Comparing bare distances travelled had the player leading a race
    // with three cars in front of them, because everybody had gone equally far
    // from wherever they each happened to begin.
    const me = this.progress + this.began;
    let ahead = 0;
    for (let i = 0; i < RIVALS.count; i++) {
      if (this.rivals.progress(i) > me) {
        ahead++;
      }
    }
    return ahead + 1;
  }

  /**
   * Cars bouncing off each other.
   *
   * Equal discs, shoved apart and given back half of the speed they closed at.
   * That is the whole model, deliberately: this wants to be a nudge that
   * unsettles a car, not a crash that ends anybody's race. Some of the closing
   * speed is thrown away as well, so four cars arriving at a hairpin together
   * settle instead of pinging about.
   *
   * Returns whether the player was one of the two, which is what decides
   * whether a child hears anything.
   */
  private jostle(): boolean {
    const cars = [this.car, ...this.rivals.cars];
    let hitPlayer = false;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const d = Math.hypot(dx, dz);
        if (d >= BUMP.radius * 2 || d < 1e-4) {
          continue;
        }
        const nx = dx / d;
        const nz = dz / d;
        const overlap = BUMP.radius * 2 - d;
        // Half each. Neither car is more important than the other, and a car
        // that never gave ground would be a wall with wheels.
        a.position.x -= nx * overlap * 0.5;
        a.position.z -= nz * overlap * 0.5;
        b.position.x += nx * overlap * 0.5;
        b.position.z += nz * overlap * 0.5;

        const closing =
          (b.velocity.x - a.velocity.x) * nx +
          (b.velocity.y - a.velocity.y) * nz;
        if (closing < 0) {
          const kick = -closing * BUMP.bounce;
          a.velocity.x -= nx * kick;
          a.velocity.y -= nz * kick;
          b.velocity.x += nx * kick;
          b.velocity.y += nz * kick;
          a.velocity.multiplyScalar(BUMP.keep);
          b.velocity.multiplyScalar(BUMP.keep);
          if (i === 0) {
            hitPlayer = true;
          }
        }
      }
    }
    return hitPlayer;
  }

  /**
   * The marks.
   *
   * Only while the back end is actually out — CAR.skidAt — and rate-limited,
   * because at sixty steps a second a mark a step would empty the pool in half
   * a lap. The mark is laid along the way the *tyre* is travelling rather than
   * the way the car is pointing, which is the whole difference between a skid
   * mark and a stripe: a sliding car leaves rubber pointing where it is going,
   * not where it is aimed.
   */
  private layRubber(dt: number): void {
    this.skidIn -= dt;
    if (this.car.slip < CAR.skidAt || this.skidIn > 0) {
      return;
    }
    this.skidIn = SKID.every;
    const travel = Math.atan2(this.car.velocity.x, this.car.velocity.y);
    const length = Math.max(SKID.width, this.car.speed * SKID.every * 2.2);
    this.car.wheels(SKID.gauge, this.wheels);
    for (const w of this.wheels) {
      this.skids.lay(w.x, w.y, travel, length);
    }
  }

  /** The player first, then the rivals, which is the order their colours are
   *  in. */
  private drawMap(): void {
    const cars = [this.car, ...this.rivals.cars];
    for (let i = 0; i < cars.length; i++) {
      const at = this.onMap[i] ?? {x: 0, z: 0};
      at.x = cars[i].position.x;
      at.z = cars[i].position.z;
      this.onMap[i] = at;
    }
    this.map.update(this.onMap);
  }

  /**
   * The mess a car tracks out of a patch.
   *
   * Per wheel, which is the whole point of it: clip the edge of a slick and
   * one line of oil comes up the road, not two, and anybody behind can see
   * exactly which line to avoid. It fades over ten seconds, so a lap later the
   * road is clean again.
   *
   * Every car does this, not only the player's. A rival that spins through the
   * mud should leave the same evidence.
   */
  private layTrails(dt: number): void {
    this.trailIn -= dt;
    if (this.trailIn > 0) {
      return;
    }
    this.trailIn = TRAIL.every;
    for (const car of [this.car, ...this.rivals.cars]) {
      if (car.height > 0.2) {
        continue;
      }
      car.corners(this.corners);
      for (let i = 0; i < 4; i++) {
        const kind = car.carrying[i];
        if (!kind) {
          continue;
        }
        // Thinner as it runs out, the way a tyre stops carrying.
        const left = car.carriedFor[i] / TRAIL.carries;
        const w = this.corners[i];
        this.trails.lay(
          w.x,
          w.y,
          car.heading,
          Math.max(TRAIL.width, car.speed * TRAIL.every * 2.2),
          TRAIL.width * (0.4 + left * 0.6),
          ITEM[kind].colour,
          TRAIL.life,
        );
      }
    }
  }

  /**
   * How far round the lap, and whether that was the flag.
   *
   * The progress is accumulated rather than read off the curve, because the
   * curve's own parameter wraps at the start line and a car that has done
   * ninety-nine per cent of a lap would otherwise read as one per cent. The
   * finish is a real crossing of the line, guarded by having come most of the
   * way round — the grid is a few metres behind the line, so every race
   * crosses it in its first second and that must not count.
   */
  private lapCount(): void {
    const found = this.track.nearest(
      this.car.position.x,
      this.car.position.z,
      this.car.hint,
    );
    let step = found.t - this.lastT;
    if (step > 0.5) {
      step -= 1;
    } else if (step < -0.5) {
      step += 1;
    }
    this.progress += step;

    const crossed =
      step > 0 &&
      wrap(this.lastT - this.track.startAt) > 0.5 &&
      wrap(found.t - this.track.startAt) < 0.5;
    this.lastT = found.t;

    // Past the line with most of a lap behind you. The half-lap guard is what
    // stops the grid — which sits a few metres behind the line — from counting
    // as a crossing in the first second of every race.
    if (crossed && this.progress > this.laps - 0.5) {
      this.flag();
    }
  }

  private flag(): void {
    this.finished = true;
    this.running = false;
    this.stick.enabled = false;
    this.stick.release();
    this.hud.setVisible(false);
    this.map.setVisible(false);
    this.engine.flag();
    this.engine.setMuted(true);
    // The shot comes back down in front of the car, the way it left at the
    // start. The card waits for it — see `endFilm`.
    this.finishing = 0;

    const place = this.place();
    const clean = this.knocks === 0;
    // Everybody up — unless the player came last, in which case they stay
    // sitting down. Being cheered for finishing fourth of four is how a game
    // starts feeling like it is humouring you, and a child can tell.
    if (place < RIVALS.count + 1) {
      this.stands.cheer(this.car.position, this.track.palette);
    }

    const round = this.laps === 1 ? "" : ` over ${this.laps} laps`;
    this.done.setTitle(place === 1 ? "You won!" : "Chequered flag!");
    this.done.setBody(
      `${ordinal(place)} of ${RIVALS.count + 1}${round}, in ${this.time.toFixed(1)} seconds.` +
        (clean
          ? " And you never once touched the wall."
          : ` You hit the wall ${this.knocks === 1 ? "once" : `${this.knocks} times`} — the long way round the outside is usually the quick way.`),
    );
  }

  /**
   * The shot after the flag: the start, run backwards.
   *
   * It comes back down in front of the car and looks at it, and the card is
   * held until it has arrived — otherwise the confetti goes off behind a
   * full-screen panel and the moment the whole race was building towards is
   * spent looking at a button.
   */
  private endFilm(dt: number): void {
    if (this.finishing < 0) {
      return;
    }
    this.finishing += dt;
    this.shot = Math.max(0, 1 - this.finishing / START.endsFor);
    if (this.finishing >= START.cardAfter) {
      this.finishing = -1;
      this.done.show();
    }
  }

  render = (alpha: number, dt: number): void => {
    this.endFilm(dt);
    // Every frame is evidence about the machine. Only while actually racing:
    // a card on the screen or a countdown is not what the race will feel like.
    if (this.running) {
      sawFrame(dt);
    }
    // Here rather than in update, because the crowd's whole job happens after
    // the flag — and update stops the moment the race is over.
    this.stands.update(dt);
    this.car.render(alpha);
    this.rivals.render(alpha);
    this.followCamera(dt);
    this.stage.render();
  };

  /**
   * The shot: a fixed diagonal, never turning, leading the car a little.
   *
   * The lead is along the car's own heading and not its velocity. Leading on
   * the velocity sounds more correct and is much worse — this is a game about
   * going sideways, and it would swing the entire picture every time the back
   * end stepped out, at exactly the moment a child needs to see where they are
   * going.
   *
   * What the camera watches is eased; where it *sits* is a fixed offset from
   * that. The offset never changes and the camera never turns, which is what
   * keeps "push the way you want to go" true from one end of a race to the
   * other.
   */
  private followCamera(dt: number): void {
    const p = this.car.group.position;
    const lead = CAMERA.lead * Math.min(1, this.car.speed / CAR.top);
    this.wantEye.set(
      p.x + Math.sin(this.car.group.rotation.y) * lead,
      0,
      p.z + Math.cos(this.car.group.rotation.y) * lead,
    );
    const ease = 1 - Math.exp(-CAMERA.ease * dt);
    this.eye.lerp(this.wantEye, ease);

    if (this.shot >= 1) {
      this.stage.watch(this.eye.x, this.eye.z);
    } else {
      this.gridShot(p);
    }

    // Anything standing between the camera and the car gets out of the way.
    // From a diagonal there is always something that can: a tree on the inside
    // of a corner, a tyre stack on the outside of one.
    for (const fade of this.fades) {
      fade.setFocus(this.stage.camera.position, p, CAMERA.clear);
    }
  }

  /**
   * Everything off, for a screen that is going away.
   *
   * Written as though half of it might not exist yet, because it might: a race
   * is built in awaited steps behind the loading card, and anything that takes
   * the player away before the last of them — tapping Home while it loads, or
   * starting a second race on top of the first — disposes a game that has no
   * loop and no stage. That threw, and a throw in here left the whole screen
   * stuck behind a card that never came down.
   */
  dispose(): void {
    this.running = false;
    this.loop?.stop();
    this.engine.stop();
    this.stick.enabled = false;
    this.stage?.dispose();
  }

  /**
   * The shot during the countdown, and the move out of it.
   *
   * Down at grid height, ahead of the whole grid, looking back along it — the
   * player is at the back, so the camera has to stand in front of the leaders
   * to have all four cars between itself and what it is aiming at.
   *
   * Then it is simply mixed with the racing pose. Both are a point and a
   * target, so moving between them is two lerps and needs no path: the camera
   * rises, swings behind and pulls back all at once, which is one movement to
   * watch rather than three.
   */
  private gridShot(p: THREE.Vector3): void {
    const facing = this.car.group.rotation.y;
    const ahead = Math.sin(facing);
    const side = Math.cos(facing);

    // Where it stands and what it aims at, on the grid.
    const gridEyeX = p.x + ahead * START.ahead;
    const gridEyeZ = p.z + side * START.ahead;
    const gridAtX = p.x + ahead * START.aim;
    const gridAtZ = p.z + side * START.aim;

    // And the racing pose, in the same terms.
    const raceEyeX = this.eye.x;
    const raceEyeZ = this.eye.z + CAMERA.back;

    // Eased rather than linear, so it leaves gently and arrives gently.
    const k = this.shot * this.shot * (3 - 2 * this.shot);
    this.stage.place(
      gridEyeX + (raceEyeX - gridEyeX) * k,
      START.height + (CAMERA.up - START.height) * k,
      gridEyeZ + (raceEyeZ - gridEyeZ) * k,
      gridAtX + (this.eye.x - gridAtX) * k,
      0,
      gridAtZ + (this.eye.z - gridAtZ) * k,
    );
  }

  /** Puts the camera over the car straight away, so the first frame is not a
   *  swoop in from the origin. */
  private snapCamera(): void {
    this.car.render(1);
    this.rivals.render(1);
    const p = this.car.group.position;
    this.eye.set(p.x, 0, p.z);
    this.gridShot(p);
    this.hud.update(0, RIVALS.count + 1);
    // Drawn once before anybody moves, so the corner is a map from the first
    // frame rather than an empty white box until the flag drops.
    this.drawMap();
  }
}

/** Hands the frame back to the browser, so the waiting card can paint. */
function frame(): Promise<void> {
  return new Promise(done => requestAnimationFrame(() => done()));
}
