import * as THREE from "three";
import {
  CAMERA,
  CONTROL,
  DRAFT,
  FEEL,
  GATES,
  GLIDE,
  LANDING,
  NET,
  NUTS,
  SIM,
  WORLD,
} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {Rng} from "./core/rng";
import {Stage} from "./render/stage";
import {Terrain} from "./entities/terrain";
import {Squirrel} from "./entities/squirrel";
import {Gates} from "./entities/gates";
import {Nuts} from "./entities/nuts";
import {Streaks} from "./entities/streaks";
import {Drafts} from "./entities/drafts";
import {Net} from "./entities/net";
import {
  createFireworks,
  FIREWORK_PALETTE,
  ParticleBurst,
} from "../../shared/particles";
import {Wind} from "./core/audio";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

/**
 * Squirrel Glider.
 *
 * You start on a cliff and you glide. There is no engine: the whole flight is
 * spending the height the cliff gave you, and the only question is how far
 * down the valley you can make it go and how many arches you can thread on the
 * way. Landing ends it, gently — see `land`.
 *
 * The Game owns the scene, the squirrel, the valley and the arches. Fixed
 * timestep at SIM.step with the render interpolating between steps, the same
 * as the other two games here.
 */
export class Game {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly squirrel: Squirrel;
  readonly gates: Gates;
  readonly nuts: Nuts;
  readonly drafts: Drafts;
  readonly net: Net;
  readonly sparks: ParticleBurst;
  readonly streaks: Streaks;
  readonly wind: Wind;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so the intro can hold the game
   *  still while the scene is already being drawn behind it. */
  running = false;

  private readonly intro: Overlay;
  private readonly done: Overlay;
  /** Seconds since it touched down, or null while it is still flying. */
  private runOut: number | null = null;
  /** The 'tap to jump' line, up while it is still on the ledge. */
  private readonly prompt: HTMLDivElement;

  private readonly dir = new THREE.Vector3();
  private readonly wantEye = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly smoothedLook = new THREE.Vector3();
  private readonly from = new THREE.Vector3();
  private shakeClock = 0;
  /** How hard the air is lifting the squirrel right now, and the lagged copy
   *  the camera uses so the shot swings under it rather than snapping. */
  private lift = 0;
  private dipped = 0;
  /** Seconds since the net caught it, or null if it never did. */
  private netting: number | null = null;
  /** How fast it is dropping into the cloth. See the netting branch. */
  private netFall = 0;
  /** How far the shot has swung round to look at the net. See followCamera. */
  private finishing = 0;
  /** Whether the flight ended in the net rather than on the ground. */
  private caught = false;
  /** The heading and climb the *camera* is using, which lag the squirrel's.
   *  See followCamera. */
  private camHeading = Math.PI;
  private camGamma = 0;

  constructor(host: HTMLElement, ui: HTMLElement) {
    const rng = new Rng(20260823);

    this.stage = new Stage(host);
    this.terrain = new Terrain(rng);
    this.drafts = new Drafts(
      rng,
      (z, y, side) => this.terrain.wallAt(z, y, side),
      z => this.terrain.glidePathAt(z),
      this.terrain.reach,
    );
    // Now the valley knows where its rising air is, fly it again. Everything
    // below is hung on the result — see Terrain.refly, and the note there for
    // what happens if a draft in the middle lifts the flight off its own
    // acorns.
    // Three times, not once. The lift a draft gives depends on how high the
    // glide was going to be anyway — the ceiling is measured from the path —
    // so re-flying changes the path, which changes the drafts, which changes
    // the path. One pass left the reference flight 400 units short of what the
    // game actually does, and everything hung on it was in the wrong place.
    // It settles after two or three.
    for (let pass = 0; pass < 3; pass++) {
      this.terrain.refly((x, y, z) => this.drafts.liftAt(x, y, z));
    }

    // The net stands where the glide has come down to the height of its own
    // legs, so the legs reach the ground and a flight arrives at the rim
    // rather than over the top of it or under it.
    let netZ = -(this.terrain.reach - NET.before);
    for (let z = -200; z > -this.terrain.reach; z -= 10) {
      if (this.terrain.glidePathAt(z) <= NET.legHeight) {
        netZ = z;
        break;
      }
    }
    this.net = new Net(
      new THREE.Vector3(
        this.terrain.ribbonAt(netZ),
        WORLD.floorY + NET.legHeight,
        netZ,
      ),
    );
    this.sparks = createFireworks();

    // Nothing is placed inside the net or in the last stretch before it: an
    // acorn hanging in the cloth is absurd and an arch there is unflyable.
    const clearOfNet = -netZ - NET.size / 2 - 25;

    // After the drafts, because some arches are hung up in the rising air and
    // need to know where it is.
    this.gates = new Gates(
      rng,
      z => this.terrain.rampAt(z),
      z => this.terrain.wallAt(z),
      z => this.terrain.ribbonAt(z),
      Math.min(this.terrain.reach * GATES.until, clearOfNet),
      z => {
        const band = this.drafts.bandAt(z);
        return band
          ? {side: band.side, top: this.terrain.glidePathAt(z) + DRAFT.ceiling}
          : null;
      },
    );
    this.nuts = new Nuts(
      rng,
      // The real flown line, not the arches' tidy diagonal. An arch is 18 units
      // tall and can swallow the difference; an acorn is a bead you have to
      // actually touch, so it belongs exactly where the squirrel will be.
      z => this.terrain.glidePathAt(z),
      z => this.terrain.wallAt(z),
      z => this.terrain.ribbonAt(z),
      Math.min(this.terrain.reach * NUTS.until, clearOfNet),
    );

    this.squirrel = new Squirrel();
    this.streaks = new Streaks(rng);
    this.wind = new Wind();

    this.stage.scene.add(this.terrain.group);
    this.stage.scene.add(this.gates.group);
    this.stage.scene.add(this.nuts.group);
    this.stage.scene.add(this.drafts.group);
    this.stage.scene.add(this.net.group);
    this.stage.scene.add(this.sparks.mesh);
    this.stage.scene.add(this.squirrel.group);
    this.stage.scene.add(this.streaks.group);

    // On the lip of the cliff, facing down the valley.
    this.squirrel.place(new THREE.Vector3(0, WORLD.cliffHeight + 2.5, -2));

    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;

    this.intro = new Overlay(
      ui,
      "Squirrel Glider",
      "You are a flying squirrel on the edge of a huge cliff. Tap to jump off, then drag to fly. Pull back and you rear up into the wind and slow right down. Push forward and you tip your nose down and dive, fast. Drag left or right to lean into a turn. Follow the floating acorns, look for the white lines of rising air — fly into those and they will carry you up — and land in the big red net at the end of the valley.",
      "Ready",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "You landed!", "", "Go again", () =>
      window.location.reload(),
    );
    this.done.hide();

    const corner = document.createElement("div");
    corner.className = "corner-buttons";
    const home = document.createElement("a");
    home.className = "icon-button ui-interactive";
    home.href = "../../";
    home.textContent = "🏠";
    home.title = "Chofter Games";
    home.setAttribute("aria-label", "Back to Chofter Games");
    corner.appendChild(home);
    const sound = new SoundButton({
      onToggle: muted => this.wind.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Standing on the ledge with one thing to do. Its own line rather than
    // words on the card, because it has to still be there once the card has
    // gone — the whole point is that the squirrel is stood on the edge waiting
    // for the player to decide to jump.
    this.prompt = document.createElement("div");
    this.prompt.className = "prompt hidden";
    this.prompt.textContent = "Tap to jump!";
    ui.appendChild(this.prompt);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps howling behind the
    // one a child has moved on to is a bug the caterpillar game had once
    // already, and it is worth not having twice.
    window.addEventListener("pagehide", () => this.wind.stop());

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.running = true;

    // The leap. The plan asks for a tap or the space bar, and this is the one
    // moment in the game where any touch at all counts: a child on the ledge
    // has one thing to do, and hunting for a button to do it with would be a
    // strange way to start a game about jumping off a cliff.
    this.prompt.classList.remove("hidden");
    const leap = (): void => {
      if (this.squirrel.perched) {
        this.squirrel.jump();
        this.prompt.classList.add("hidden");
        // Here and not in the constructor: a browser will not start an audio
        // context outside a real gesture, and this is the gesture.
        this.wind.start();
      }
    };
    window.addEventListener("pointerdown", leap);
    window.addEventListener("keydown", event => {
      if (event.key === " ") {
        leap();
      }
    });
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }

    // Lying in the net: the cloth has it, and it sinks in and settles while
    // the sheet throws its wave out to the corners and back.
    if (this.netting !== null) {
      this.netting += dt;
      this.net.update(dt);
      this.sparks.update(dt);
      const s = this.squirrel;

      // It falls, and the cloth stops it. That way round, and only that way
      // round: see NET.press for the version where the cloth chased the
      // squirrel down and the squirrel chased the cloth, and both went
      // through the floor.
      this.netFall -= GLIDE.gravity * dt;
      s.position.y += this.netFall * dt;

      const surface = this.net.heightAt(s.position.x, s.position.z) + NET.ride;
      if (s.position.y <= surface) {
        // Everything it is still carrying downward goes into the sheet, plus
        // its weight, which is what keeps a hollow under it while it lies
        // there.
        const hit = Math.max(0, -this.netFall);
        this.net.press(s.position, (hit * NET.press + NET.weight) * dt);
        s.position.y = surface;
        // A bounce while there is anything left to bounce with, and then it
        // simply lies in it.
        this.netFall =
          hit > NET.settle ? Math.min(hit * NET.bounce, NET.maxBounce) : 0;
      }

      s.speed *= Math.pow(NET.grab, dt);
      s.position.x += Math.sin(s.heading) * s.speed * dt;
      s.position.z += Math.cos(s.heading) * s.speed * dt;
      // ...and down into the hollow, the way anything on a sagging sheet ends
      // up at the bottom of the sag. See NET.slide.
      const sink = Math.min(1, NET.slide * dt);
      s.position.x += (this.net.at.x - s.position.x) * sink;
      s.position.z += (this.net.at.z - s.position.z) * sink;
      s.prevPosition.copy(s.position);
      if (this.netting > LANDING.runOut + 1.1) {
        this.netting = null;
        this.showCard();
      }
      return;
    }

    // The run-out after touchdown: the squirrel is down and sliding, and the
    // card waits until it has stopped. Landing is the end of the flight, not
    // the end of the moment.
    if (this.runOut !== null) {
      this.runOut += dt;
      if (this.runOut > LANDING.runOut) {
        this.runOut = null;
        this.showCard();
      }
      return;
    }

    // The stick, straight through: x banks, y works the membrane. No camera
    // projection — unlike the crawling game the shot is always behind the
    // animal, so screen-right and its own right are the same thing.
    //
    // Not negated, and it is worth being exact about why, because this has
    // been the wrong way round twice.
    //
    // Joystick.y is positive *downward* in screen axes, so a thumb pulled back
    // toward the player — down the screen — arrives here positive. Positive is
    // what the squirrel reads as nose-up. So pulling back rears it up into the
    // wind and slows it, and pushing forward tips its nose down and dives it,
    // which is how a stick has worked since there were sticks.
    this.dir.set(
      expo(this.stick.x, CONTROL.bankExpo),
      expo(this.stick.y, CONTROL.pitchExpo),
      0,
    );

    this.from.copy(this.squirrel.position);
    // The air the squirrel is flying through, which near a wall may be going
    // up. It is handed to the glider as wind rather than as a force: see
    // Drafts, and Squirrel.update, which adds it to the height and otherwise
    // carries on gliding down exactly as it would have.
    const p = this.squirrel.position;
    this.lift = this.drafts.liftAt(p.x, p.y, p.z);
    this.squirrel.update(dt, this.dir, this.lift);
    this.gates.check(this.from, this.squirrel.position);
    this.nuts.check(this.from, this.squirrel.position);
    this.nuts.update(dt);
    this.drafts.update(dt);
    this.net.update(dt);
    this.sparks.update(dt);

    // Nothing to land on until it has left the ledge.
    if (this.squirrel.perched) {
      return;
    }

    // Into the net, which is the ending the game is for.
    //
    // Caught by touching the *cloth*, not by happening to be level with the
    // rim. The rim test was three units wide, so a squirrel arriving any
    // higher than that sailed straight over the top of the net and carried on
    // to the ground — which from the player's seat looks exactly like falling
    // through it. Coming down onto the sheet from any height now lands in it.
    const p2 = this.squirrel.position;
    if (
      !this.squirrel.landed &&
      this.net.covers(p2.x, p2.z) &&
      p2.y <= this.net.heightAt(p2.x, p2.z) + NET.ride
    ) {
      this.catchInNet();
      return;
    }

    this.hitWall(dt);

    const floor = this.terrain.groundAt();
    if (this.squirrel.position.y <= floor + LANDING.height) {
      this.land(floor);
    }
  };

  /**
   * Into the side of the valley.
   *
   * The squirrel is held off the rock and scuffs some speed off, and that is
   * all that happens. It is not turned, not bounced and not stopped.
   *
   * It used to be turned, by a fixed amount every frame, which came to about
   * three radians a second — lean on a wall for half a second and you were
   * pointed back up the valley with no idea why. That was survivable while the
   * walls were only scenery to be avoided. It stopped being survivable the
   * moment the drafts went in, because a draft is the game telling a player to
   * go and fly along a wall and stay there.
   *
   * The scuff is per second rather than per frame for the same reason: at the
   * old rate a second of contact left two per cent of your speed.
   *
   * The wall is where Terrain says it is, so the thing being drawn and the
   * thing being hit cannot drift apart.
   */
  private hitWall(dt: number): void {
    const s = this.squirrel;
    // At the squirrel's own height and on its own side, because the wall
    // leans: stopping it at the foot of the slope would put an invisible
    // barrier a hundred units out from the rock it can plainly see.
    const side = Math.sign(s.position.x) || 1;
    const wall =
      this.terrain.wallAt(s.position.z, s.position.y, side) -
      WORLD.wallClearance;
    if (Math.abs(s.position.x) < wall) {
      return;
    }
    s.position.x = side * wall;
    s.speed *= Math.pow(WORLD.wallScrub, dt);
  }

  /**
   * Caught.
   *
   * The ending the game is actually for. A glide that runs out and puts you
   * down in the trees ends by stopping; the net ends it by arriving. Fireworks
   * because the bee game has them, and a child who has flown the whole valley
   * has earned the same noise.
   */
  private catchInNet(): void {
    const s = this.squirrel;
    this.caught = true;
    s.landed = true;
    this.stick.enabled = false;
    this.stick.release();
    this.wind.hush();
    this.netting = 0;
    // It arrives carrying whatever it was descending at, and the sheet gets
    // all of it.
    this.netFall = -Math.max(0, -s.speed * Math.sin(s.gamma));
    this.sparks.burst(s.position, {
      color: FIREWORK_PALETTE,
      count: 90,
      speed: 13,
      lift: 7,
      gravity: 9,
      ttl: 1.5,
      size: 1.5,
      spherical: 1,
    });
  }

  /**
   * Down.
   *
   * Gently either way: a fast arrival is a tumble and a slow one is a slide,
   * and neither is a failure. There is nothing to lose in this game — the only
   * score is how far you got and how many arches you took, both of which are
   * already yours by the time you touch the ground.
   */
  private land(floor: number): void {
    this.squirrel.position.y = floor + LANDING.height;
    this.squirrel.landed = true;
    this.stick.enabled = false;
    this.stick.release();
    this.runOut = 0;
    // The wind goes with the flight. A landed squirrel is never updated again,
    // so without this its speed stays frozen at whatever it arrived at and the
    // wind keeps howling at that pitch under the card.
    this.wind.hush();
  }

  /**
   * What you did, in a sentence a child can read.
   *
   * The distance is given as a fraction of the valley rather than as a number
   * of units, because "1393" means nothing to anybody: what a player wants to
   * know is whether they got to the end, and the end is Terrain.reach — as far
   * as this squirrel can fly.
   */
  private showCard(): void {
    this.hud.setVisible(false);
    const along = this.terrain.progressAt(this.squirrel.position.z);
    const arches = this.gates.passed;
    const nuts = this.nuts.eaten;
    const everything = arches === this.gates.total && nuts === this.nuts.total;
    this.done.setTitle(
      this.caught ? "You landed right in the net!" : "You landed!",
    );
    const landing = this.caught
      ? "You flew the whole valley and dropped straight into the net."
      : along > 0.97
        ? "You flew the whole valley, right to the end of it — but you came down beside the net rather than in it."
        : along > 0.7
          ? "You got most of the way down the valley. The big red net is right at the end of it."
          : "You came down early — there is a lot more valley out there, and a net at the end to land in.";

    this.done.setBody(
      everything
        ? `Every single arch — all ${this.gates.total} of them — and every last acorn. ${landing} There is nothing left out there to catch.`
        : `${landing} You flew through ${arches} of the ${this.gates.total} arches and caught ${nuts} of the ${this.nuts.total} acorns. Follow the acorns and they will take you to most of them. Pull back to slow yourself and line up a tricky arch; push forward to dive and go fast. The white lines by the walls are rising air — fly into one and it will carry you back up. Let go of everything and you will glide the furthest of all.`,
    );
    this.done.show();
  }

  render = (alpha: number): void => {
    this.squirrel.render(alpha);
    this.followCamera(SIM.step);
    const s = this.squirrel;
    this.streaks.update(s.group.position, s.heading, s.gamma, s.speed);
    this.wind.update(SIM.step, this.run());
    this.hud.update(
      this.terrain.progressAt(this.squirrel.position.z),
      this.nuts.eaten,
      this.gates.passed,
      this.squirrel.speed,
      this.squirrel.position.y - this.terrain.groundAt(),
    );
    this.stage.render();
  };

  /**
   * Behind and a little above, looking down the valley ahead of the squirrel.
   *
   * Deliberately loose. A camera pinned to the animal turns when it turns and
   * the world swings instead, which reads as the wood spinning rather than the
   * squirrel banking — letting it lag means a hard turn throws the squirrel
   * across the frame first and the shot follows it round, which is most of
   * what makes a glide feel quick.
   */
  private followCamera(dt: number): void {
    const s = this.squirrel;

    // Caught: leave the chase behind and go and look at it. See
    // CAMERA.finishBack for why the ordinary shot will not do here.
    if (this.netting !== null) {
      this.finishing +=
        (1 - this.finishing) * (1 - Math.exp(-CAMERA.finishRate * dt));
      const back = this.net.at.z + CAMERA.finishBack;
      this.wantEye.set(
        this.net.at.x + CAMERA.finishBack * 0.5,
        this.net.at.y + CAMERA.finishUp,
        back,
      );
      const camera = this.stage.camera;
      camera.position.lerp(this.wantEye, this.finishing);
      this.smoothedLook.lerp(
        s.group.position,
        1 - Math.exp(-CAMERA.finishRate * dt),
      );
      camera.lookAt(this.smoothedLook);
      camera.fov += (CAMERA.fovSlow - camera.fov) * (1 - Math.exp(-2 * dt));
      camera.updateProjectionMatrix();
      return;
    }
    const fast = this.run();
    const distance = CAMERA.distance + fast * CAMERA.speedPullback;

    // The looseness is in which way the camera is pointing, not in how far
    // back it is.
    //
    // It used to be both — the eye chased a wanted point with a soft lerp —
    // and at these speeds that does not work: a camera that closes five per
    // cent of the gap each frame while the squirrel covers most of a unit sits
    // permanently behind, and it was measured at a hundred units back on a
    // shot asked to be eleven. Everything the game had just been given to make
    // it feel fast was being watched through the wrong end of a telescope.
    //
    // So the eye is placed exactly, off a heading that lags. A turn still
    // throws the squirrel across the frame before the shot comes round after
    // it, which is the part that was worth having, and the distance is now the
    // distance.
    let swing = s.heading - this.camHeading;
    swing = Math.atan2(Math.sin(swing), Math.cos(swing));
    this.camHeading += swing * (1 - Math.exp(-CAMERA.lerp * dt));
    this.camGamma +=
      (s.gamma - this.camGamma) * (1 - Math.exp(-CAMERA.lerp * dt));

    // Behind along the path rather than behind along the ground: in a dive the
    // shot belongs above and behind, looking down the way the squirrel is
    // going, not level with it.
    const climb = Math.sin(this.camGamma) * CAMERA.pathFollow;
    const flat = Math.cos(Math.asin(climb));
    // Under the squirrel while the air is carrying it. See CAMERA.draftDip:
    // a climb seen from above and behind barely reads as a climb at all.
    const want = s.landed
      ? 0
      : Math.min(1, this.lift / (DRAFT.strength * CAMERA.draftFull));
    this.dipped +=
      (want - this.dipped) * (1 - Math.exp(-CAMERA.draftRate * dt));
    const dip = this.dipped * CAMERA.draftDip * distance;

    const backX = -Math.sin(this.camHeading) * flat;
    const backZ = -Math.cos(this.camHeading) * flat;
    this.wantEye.set(
      s.position.x + backX * distance,
      s.position.y + CAMERA.height - climb * distance - dip,
      s.position.z + backZ * distance,
    );
    // Keep the shot out of the scenery. The valley leans out over its own
    // floor, so an eye placed below and behind a squirrel flying near a wall
    // is very often inside the mountain — see CAMERA.clearance.
    const eyeSide = Math.sign(this.wantEye.x) || 1;
    const rock =
      this.terrain.wallAt(this.wantEye.z, this.wantEye.y, eyeSide) -
      CAMERA.clearance;
    if (Math.abs(this.wantEye.x) > rock) {
      this.wantEye.x = eyeSide * rock;
    }
    this.wantEye.y = Math.max(
      this.terrain.groundAt() + CAMERA.clearance,
      this.wantEye.y,
    );
    this.stage.camera.position.copy(this.wantEye);

    // Aimed ahead of it rather than at it, so the shot is mostly the valley
    // it is flying into instead of the ground it is falling toward — and aimed
    // along the *path*, not at a fixed slope. Looking ten degrees down out of
    // a fifty-degree dive put the ground rushing up below the bottom of the
    // screen, which is the one shot the whole game is for.
    // Forward is (sin, cos) of the heading — the same pair the squirrel moves
    // along, and worth writing that way rather than as the negation of the
    // vector that points backwards. Written as the negation it was wrong, and
    // the camera spent an afternoon aimed up the valley at the cliff.
    this.lookAt.set(
      s.position.x + Math.sin(s.heading) * CAMERA.lookAhead * flat,
      // Aimed a little above the squirrel while it is being lifted, so the
      // shot looks up the way it is going.
      s.position.y + CAMERA.lookAhead * climb + dip * CAMERA.draftAim,
      s.position.z + Math.cos(s.heading) * CAMERA.lookAhead * flat,
    );
    this.smoothedLook.lerp(this.lookAt, 1 - Math.exp(-CAMERA.lookLerp * dt));

    // Whatever all of that added up to, the squirrel stays on the screen.
    // See CAMERA.frameLimit: the aim is pulled back here until it is inside
    // the window, so every offset above can be chosen for how it feels.
    const shot = this.stage.camera;
    const flat2 = Math.hypot(
      s.group.position.x - shot.position.x,
      s.group.position.z - shot.position.z,
    );
    if (flat2 > 0.5) {
      const half = (shot.fov * Math.PI) / 360;
      const limit = half * CAMERA.frameLimit;
      const toSquirrel = Math.atan2(
        s.group.position.y - shot.position.y,
        flat2,
      );
      const lookFlat = Math.hypot(
        this.smoothedLook.x - shot.position.x,
        this.smoothedLook.z - shot.position.z,
      );
      const toLook = Math.atan2(
        this.smoothedLook.y - shot.position.y,
        Math.max(0.5, lookFlat),
      );
      const off = toSquirrel - toLook;
      if (Math.abs(off) > limit) {
        const want = toSquirrel - Math.sign(off) * limit;
        this.smoothedLook.y =
          shot.position.y + Math.tan(want) * Math.max(0.5, lookFlat);
      }
    }
    shot.lookAt(this.smoothedLook);

    // The lens opens as it runs. See CAMERA.fovFast: this is most of what
    // makes ninety units a second feel like ninety units a second, because the
    // widening is felt at the edges of the frame where the rock is.
    const open = CAMERA.fovSlow + fast * (CAMERA.fovFast - CAMERA.fovSlow);
    const camera = this.stage.camera;
    camera.fov += (open - camera.fov) * (1 - Math.exp(-CAMERA.fovRate * dt));
    camera.updateProjectionMatrix();

    // A trembling lens, and it is worth the two lines. Flying low feels fast
    // and flying high feels slow — the eye reads speed in eye-heights a second
    // rather than in units — so the shake carries a term for how close the
    // ground is as well as one for how fast the squirrel is going. Squared, so
    // gentle flying is perfectly steady and only a real dive is felt.
    // ...and the ground-proximity term least of all once it is *on* the
    // ground, where it would otherwise sit at full strength for ever.
    const low = s.landed
      ? 0
      : 1 -
        Math.min(
          1,
          (s.position.y - this.terrain.groundAt()) / CAMERA.shakeFrom,
        );
    const trauma = Math.min(1, fast + low * CAMERA.shakeLow);
    const shake = trauma * trauma * CAMERA.shake;
    if (shake > 0.0001) {
      this.shakeClock += dt;
      camera.position.x += Math.sin(this.shakeClock * 37.1) * shake;
      camera.position.y += Math.sin(this.shakeClock * 51.7) * shake;
    }
  }

  /**
   * How hard it is running, 0 at an easy glide and 1 flat out. See FEEL: the
   * one number every cue in the game takes its reading from.
   */
  private run(): number {
    // Nothing is running once it is down. A landed squirrel is never updated
    // again, so its speed stays frozen at whatever it arrived at — without
    // this the lens stayed wide, the streaks kept tearing past and the wind
    // kept howling, all at touchdown speed, for as long as the card was up.
    if (this.squirrel.landed) {
      return 0;
    }
    return Math.min(
      1,
      Math.max(0, (this.squirrel.speed - FEEL.slow) / (FEEL.fast - FEEL.slow)),
    );
  }

  /** Puts the camera where it belongs before the first frame is drawn. */
  private snapCamera(): void {
    for (let i = 0; i < 60; i++) {
      this.followCamera(SIM.step);
    }
  }
}

/**
 * The expo curve: gentle in the middle of the stick, full at the ends. See
 * CONTROL, which is where the reasoning lives.
 */
function expo(v: number, power: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), power);
}
