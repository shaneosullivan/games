import * as THREE from "three";
import {
  ABYSS,
  BREACH,
  BREATH,
  CAMERA,
  DEPTH,
  FINISH,
  IDLE,
  REEF,
  SIM,
  SONAR,
  SWIM,
} from "./config";
import {GameLoop} from "./core/loop";
import {Joystick} from "./core/input";
import {DepthStick} from "./core/depthStick";
import {Rng} from "./core/rng";
import {Ocean} from "./core/audio";
import {Stage} from "./render/stage";
import {Reef} from "./entities/reef";
import {Whale} from "./entities/whale";
import {Fish} from "./entities/fish";
import {Plastic} from "./entities/plastic";
import {Sky} from "./entities/sky";
import {Squid} from "./entities/squid";
import {Sonar} from "./entities/sonar";
import {selfLit, sonarise} from "./render/sonar";
import {
  createFireworks,
  FIREWORK_PALETTE,
  ParticleBurst,
} from "../../shared/particles";
import {Hud} from "./ui/hud";
import {Overlay} from "./ui/overlays";
import {SoundButton} from "../../shared/soundButton";

const TAU = Math.PI * 2;

/**
 * Whale.
 *
 * You are a beluga on a coral reef. Swim to the far end of it, eat the fish on
 * the way, and don't eat the plastic. The thumbstick moves you and the slider
 * down the right sets how deep you are, which is the bee game's pair of
 * controls — the plan asks for those by name.
 *
 * The Game owns the scene, the whale, the reef and everything in it. Fixed
 * timestep at SIM.step with the render interpolating between steps, the same
 * as the other games here.
 */
export class Game {
  readonly stage: Stage;
  readonly reef: Reef;
  readonly whale: Whale;
  readonly fish: Fish;
  readonly plastic: Plastic;
  readonly sky: Sky;
  readonly squid: Squid;
  readonly sonar: Sonar;
  readonly bubbles: ParticleBurst;
  readonly sparks: ParticleBurst;
  readonly ocean: Ocean;
  readonly hud: Hud;
  readonly stick: Joystick;
  readonly depth: DepthStick;
  readonly loop: GameLoop;

  /** update() does nothing unless this is set, so a card can hold the game
   *  still while the reef is already being drawn behind it. */
  running = false;

  private readonly intro: Overlay;
  private readonly done: Overlay;
  private readonly oops: Overlay;

  /** Seconds since the swim began. The reef's waves and dapple run off this
   *  rather than off a clock, so a game behind a card has a still sea. */
  private time = 0;
  /** Over, one way or the other. */
  private finished = false;

  /** How many fish have gone down in a row, and how long is left of the run —
   *  the gulp rises in pitch through a mouthful, and this is the mouthful. */
  private streak = 0;
  private streakLeft = 0;
  /** Seconds until it will blow again. See breathe(). */
  private breathLeft = 0;
  /** How wound up the climb is, 0..1. See climbRate(). */
  private urge = 0;
  /** Vertical speed while the whale is out of the water, or null while it is
   *  in it. See breach(). */
  private flight: number | null = null;
  /** How far the shot is out of the water, 0..1. Drives the sky. */
  private air = 0;
  /** How dark it is down here, 0..1. Drives the sonar. */
  private dark = 0;
  /** The deepest the whale may go anywhere on this map. See the constructor. */
  private readonly deepest: number;
  /** Seconds until the next click. */
  private clickIn = 0;
  /** Seconds of fireworks left before the finish card, or null. */
  private cheering: number | null = null;
  private burstIn = 0;
  /** Seconds the whale has been holding still. See loiter(). */
  private still = 0;
  /** Seconds until the next idle bubble. */
  private bubbleIn = 0;
  /** Whether fish are at the whale now, and how long until any will come
   *  again. See loiter(). */
  private nibbled = false;
  private nibbleRest = 0;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly want = new THREE.Vector3();
  private readonly mouth = new THREE.Vector3();
  private readonly hole = new THREE.Vector3();
  private readonly perch = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  /** The heading the *camera* is using, which lags the whale's. See
   *  followCamera. */
  private camHeading = Math.PI;
  private camPitch = 0;

  constructor(host: HTMLElement, ui: HTMLElement) {
    // Seeded, so the reef is the same reef every time. Eating plastic starts
    // the swim again, and a reef that reshuffled itself would turn a second go
    // into a different game rather than another try at this one.
    const rng = new Rng(20260830);

    this.stage = new Stage(host);
    this.reef = new Reef(rng);
    this.whale = new Whale();
    this.fish = new Fish(
      rng,
      (x, z) => this.reef.floorAt(x, z),
      this.reef.finishZ,
    );
    this.plastic = new Plastic(
      rng,
      (x, z) => this.reef.floorAt(x, z),
      this.reef.finishZ,
    );

    this.sky = new Sky(rng);
    this.squid = new Squid(rng, this.reef.abyssCentre, (x, z) =>
      this.reef.floorAt(x, z),
    );
    this.sonar = new Sonar();

    // Bubbles rise, so their gravity is negative — the shared burst subtracts
    // it from the upward velocity every step, and a negative one adds.
    this.bubbles = new ParticleBurst(300, 0.11, false);
    this.sparks = createFireworks();

    this.stage.scene.add(this.reef.group);
    this.stage.scene.add(this.whale.group);
    this.stage.scene.add(this.fish.mesh);
    this.stage.scene.add(this.plastic.group);
    this.stage.scene.add(this.sky.group);
    this.stage.scene.add(this.squid.mesh);
    this.stage.scene.add(this.sonar.group);
    this.stage.scene.add(this.bubbles.mesh);
    this.stage.scene.add(this.sparks.mesh);

    this.whale.place(new THREE.Vector3(0, -DEPTH.start, 40), Math.PI);

    this.ocean = new Ocean();
    this.hud = new Hud();
    this.hud.mount(ui);
    this.stick = new Joystick(ui);
    this.stick.enabled = false;
    // The bottom of the slider is the sea bed, wherever you are. Taken from
    // the map rather than from a constant: the reef reaches 334 down where the
    // abyss and a trench overlap, and a fixed cap at 240 left places you could
    // see the bottom of and never touch.
    this.deepest = Math.max(
      DEPTH.maxDepth,
      this.reef.deepestFloor - DEPTH.floorClear,
    );
    this.depth = new DepthStick(ui, DEPTH.start, this.deepest);
    this.depth.setVisible(false);

    this.intro = new Overlay(
      ui,
      "Whale",
      "You are a beluga whale on a coral reef. Drag anywhere to swim, and slide the bar on the right to go deeper or up to the top. A whale breathes air, so take the slider right to the sun now and then and pop your head out for a puff. Eat the fish that swim into your mouth — some of them are shy and will dart away. Don't eat the plastic bottles and bags: swim right round those. The reef ends at a great arch of rock with coral all over it, and that is where you are going.",
      "Dive in",
      () => this.begin(),
    );
    this.done = new Overlay(ui, "You made it!", "", "Swim again", () =>
      window.location.reload(),
    );
    this.done.hide();
    this.oops = new Overlay(
      ui,
      "Yuck — that was plastic!",
      "Plastic is not food, and a whale cannot tell until it is too late. Have another go, and swim round the bottles and bags this time.",
      "Try again",
      () => window.location.reload(),
    );
    this.oops.hide();

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
      onToggle: muted => this.ocean.setMuted(muted),
      className: "ui-interactive",
    });
    corner.appendChild(sound.root);
    ui.appendChild(corner);

    // Everything off on the way out. The gallery is one tap away and these
    // games are pages rather than tabs: a page that keeps rumbling behind the
    // one a child has moved on to is a bug the caterpillar game had once
    // already, and it is worth not having twice.
    window.addEventListener("pagehide", () => this.ocean.stop());

    // The whale is the one thing that stays visible in the dark, so it is
    // flagged before the patch goes on — see selfLit.
    selfLit(this.whale.group);
    // Every material in the game learns to answer a sonar ping. Done here, in
    // one pass over the finished scene, rather than at each of the twenty-odd
    // places a material is made — nothing creates one after this point.
    sonarise(this.stage.scene);

    this.snapCamera();
    this.loop = new GameLoop(this.update, this.render);
    this.loop.start();
  }

  private begin(): void {
    this.intro.hide();
    this.stick.enabled = true;
    this.depth.setVisible(true);
    this.running = true;
    // Here and not in the constructor: a browser will not start an audio
    // context outside a real gesture, and the button that got us here is one.
    this.ocean.start();
  }

  update = (dt: number): void => {
    if (!this.running) {
      return;
    }
    // Through the arch and still going: the run is over but the fireworks are
    // not, and the card waits until they are.
    if (this.cheering !== null) {
      this.celebrate(dt);
      return;
    }
    if (this.finished) {
      return;
    }
    this.time += dt;

    // What the sticks are asking for. The thumbstick is read in camera space —
    // push the stick the way you want to go on screen and that is the way the
    // whale goes, which is the bee's arrangement and the only one that needs
    // no explaining.
    this.forward.set(Math.sin(this.camHeading), 0, Math.cos(this.camHeading));
    this.right.set(-Math.cos(this.camHeading), 0, Math.sin(this.camHeading));
    this.want
      .copy(this.forward)
      .multiplyScalar(-this.stick.y)
      .addScaledVector(this.right, this.stick.x)
      .multiplyScalar(SWIM.maxSpeed);

    this.whale.update(
      dt,
      this.want,
      this.flight === null ? this.climbRate(dt) : this.flight,
      this.stick.magnitude > 0,
    );
    this.breach(dt);
    this.keepInReef(dt);

    this.whale.mouth(this.mouth);
    this.eat(dt);
    this.breathe(dt);

    if (this.plastic.update(dt, this.mouth)) {
      this.spoil();
      return;
    }

    this.loiter(dt);
    this.listen(dt);
    this.reef.update(this.time, this.whale.position);
    // The abyss has its own thing to catch. A squid taken by sonar alone is
    // the reward for going down there, so it makes a bigger noise about it
    // than a fish does.
    const squid = this.squid.update(this.time, this.mouth);
    if (squid > 0) {
      this.whale.gulp();
      this.ocean.gulp(6);
      this.sparks.burst(this.mouth, {
        color: [0xbfeaff, 0xffffff, 0x9fd8ff],
        count: 46,
        speed: 12,
        lift: 4,
        gravity: -6,
        ttl: 1.6,
        size: 8,
        spherical: 1,
      });
    }
    this.sky.update(dt, this.time, this.whale.position, (x, z) =>
      this.reef.waveAt(x, z, this.time),
    );
    this.bubbles.update(dt);
    this.sparks.update(dt);
    this.ocean.update(dt, this.whale.speed / SWIM.maxSpeed);

    if (this.whale.position.z <= this.reef.finishZ) {
      this.win();
    }
  };

  /**
   * How fast to rise or sink, from the slider — and from the sea floor, which
   * has the last word.
   *
   * Over a sandbank the floor is nearer than the slider's deepest setting, so
   * the whale is held off it at DEPTH.floorClear and the slider's knob and the
   * marker beside it come apart. That gap is the game telling you the water is
   * shallow here, which is the plan's "some bits are deeper than others" made
   * into something you can feel rather than only see.
   */
  private climbRate(dt: number): number {
    const p = this.whale.position;
    const floorDepth = -this.reef.floorAt(p.x, p.z);
    const deepest = Math.min(
      this.deepest,
      Math.max(DEPTH.minDepth, floorDepth - DEPTH.floorClear),
    );
    const wantDepth = Math.min(this.depth.desiredDepth, deepest);
    // The wind-up. It builds only while the whale is a good way below what
    // was asked for, so a slider parked at the top does not keep a surfaced
    // whale wound tight — see SWIM.urgeGap.
    const gap = -p.y - wantDepth;
    const climbing = gap > SWIM.urgeGap;
    this.urge = Math.max(
      0,
      Math.min(1, this.urge + (climbing ? SWIM.urgeRate : -SWIM.urgeFall) * dt),
    );

    // Eased rather than jumped: a whale that snapped to the depth you asked
    // for would have no weight to it at all. A rate per *second*, not a share
    // of the gap per frame — see DEPTH.followRate.
    const eased = (-wantDepth - p.y) * DEPTH.followRate;
    const top = SWIM.climbSpeed * (1 + this.urge * (SWIM.urgeMax - 1));
    if (eased <= 0) {
      return Math.max(-SWIM.climbSpeed, eased);
    }
    // The wind-up is a *floor* on the rise, not a ceiling on it. Left as a
    // plain cap, the eased term still braked the whale to a crawl over the
    // last few units — which is exactly the water it needs to be quickest in
    // if it is ever going to leave it.
    return Math.min(top, Math.max(eased, this.urge * top));
  }

  /**
   * Out of the water and back into it.
   *
   * Hit the surface fast enough and the whale keeps going: the depth slider is
   * out of it from that moment, and what happens next is a thrown object. It
   * comes down where the arc puts it, and the sea gets the lot.
   */
  private breach(dt: number): void {
    const p = this.whale.position;

    if (this.flight === null) {
      const rising = this.whale.velocity.y;
      if (p.y >= -DEPTH.minDepth && rising >= BREACH.speed) {
        this.flight = rising * BREACH.launch;
        this.urge = 0;
        this.ocean.breath();
      }
      return;
    }

    // Gravity only. The *move* has already happened: the whale was updated
    // this step with `flight` as its climb rate, which is what put it where it
    // is. Adding the same distance again here had it rising at twice the speed
    // it was thrown at, and reaching an apex of fifty units off a launch that
    // could only account for thirty-four.
    this.flight -= BREACH.gravity * dt;

    // Spray off the whale on the way up, thinning as it clears the water.
    if (this.flight > 0 && p.y < 12) {
      this.whale.blowhole(this.hole);
      this.bubbles.burst(this.hole, {
        color: [0xffffff, 0xeafaff],
        count: 3,
        speed: 6,
        lift: 4,
        gravity: 26,
        ttl: 0.8,
        size: 6,
        spherical: 0.6,
      });
    }

    if (this.flight < 0 && p.y <= -DEPTH.minDepth + BREACH.land) {
      this.splash();
    }
  }

  /** Back in. Everything the whale was carrying goes into the water. */
  private splash(): void {
    const p = this.whale.position;
    const down = this.flight ?? 0;
    this.flight = null;
    this.urge = 0;
    this.ocean.splash();
    // At the waterline rather than at the whale, so the ring of white comes
    // off the surface and not out of the middle of the animal.
    this.hole.set(p.x, -DEPTH.minDepth, p.z);
    this.bubbles.burst(this.hole, {
      color: [0xffffff, 0xeafaff, 0xd2f2ff],
      // Scaled to how hard it came down — a big one throws more water.
      count: Math.round(40 + Math.min(60, -down * 1.6)),
      speed: 24,
      lift: 13,
      gravity: 26,
      ttl: 1.5,
      size: 9,
      spherical: 0.3,
    });
  }

  /**
   * The sides of the lane and the sea floor.
   *
   * A push and then a clamp, the same soft boundary the bee has: a push alone
   * balances the stick wherever the two happen to be equal, which can be a
   * long way out, and a clamp alone feels like a wall.
   */
  private keepInReef(dt: number): void {
    const p = this.whale.position;
    const over = Math.abs(p.x) - REEF.halfWidth;
    if (over > 0) {
      const side = Math.sign(p.x);
      const push = Math.min(1, over / REEF.give) * REEF.push;
      const limit = REEF.halfWidth + REEF.give;
      p.x = side * Math.min(Math.abs(p.x) - push * dt, limit);
      this.whale.velocity.x *= 1 - Math.min(0.9, over / 4) * dt * 4;
    }
    // Nothing behind the start but open water, and nothing in it.
    if (p.z > 90) {
      p.z = 90;
      this.whale.velocity.z = Math.min(0, this.whale.velocity.z);
    }
    // The floor and the surface, hard. climbRate aims to keep clear of both;
    // this is what happens when the floor rises faster than the whale can.
    const floor = this.reef.floorAt(p.x, p.z) + DEPTH.floorClear;
    if (p.y < floor) {
      p.y = floor;
    }
    // The surface is a lid, except while the whale is over it: a breach is the
    // one time in the game the whale is allowed out of the water.
    if (this.flight === null && p.y > -DEPTH.minDepth) {
      p.y = -DEPTH.minDepth;
    }
  }

  /**
   * A mouthful.
   *
   * Only what touches the mouth counts — the sphere is out in front of the
   * melon, not around the whole animal. The plan is specific about that, and
   * it is what makes lining a school up worth doing.
   */
  private eat(dt: number): void {
    this.streakLeft = Math.max(0, this.streakLeft - dt);
    if (this.streakLeft === 0) {
      this.streak = 0;
    }

    const taken = this.fish.update(dt, this.mouth);
    if (taken === 0) {
      return;
    }

    this.whale.gulp();
    for (let i = 0; i < taken; i++) {
      this.ocean.gulp(this.streak);
      this.streak++;
    }
    this.streakLeft = 1.2;
    this.bubbles.burst(this.mouth, {
      color: [0xdffcff, 0xbdf0ff, 0xffffff],
      count: 6 + taken * 3,
      speed: 7,
      lift: 4,
      // Negative, so they rise. Bubbles are the one thing in this game that
      // falls upward.
      gravity: -9,
      ttl: 1.5,
      size: 8,
      spherical: 1,
    });
  }

  /**
   * Up for air.
   *
   * A beluga is an air-breathing animal, so the surface is somewhere it has to
   * be able to get to — and this is what happens when it does. There is no
   * timer and nothing to fail: you cannot drown in this game, and a child who
   * wants to spend the whole swim along the top of the water is welcome to.
   * The spout is the reward for going up, not the penalty for staying down.
   */
  private breathe(dt: number): void {
    this.breathLeft = Math.max(0, this.breathLeft - dt);
    if (-this.whale.position.y > BREATH.depth || this.breathLeft > 0) {
      return;
    }
    this.breathLeft = BREATH.cooldown;
    this.whale.blowhole(this.hole);
    this.ocean.breath();
    // Straight up and heavy: spray thrown into the air comes back down, which
    // is the one thing in this game that behaves like it is not under water.
    this.bubbles.burst(this.hole, {
      color: [0xffffff, 0xeafaff, 0xd2f2ff],
      count: 26,
      speed: 5,
      lift: 17,
      gravity: 22,
      ttl: 1.1,
      size: 7,
      spherical: 0.35,
    });
  }

  /**
   * Holding still, and what comes of it.
   *
   * Nothing here changes the game — there is nothing to gain by stopping and
   * nothing lost by never stopping. It is here because a reef that carries on
   * without you is scenery, and one that notices you have stopped is a place.
   *
   * On the surface, a gull comes down and stands on the whale's back. Under
   * it, the nearest school comes over for a look and the whale blows the odd
   * bubble. Move the stick and all of it goes back to what it was doing.
   */
  private loiter(dt: number): void {
    const moving = this.stick.magnitude > IDLE.stick || this.flight !== null;
    this.still = moving ? 0 : this.still + dt;
    this.nibbleRest = Math.max(0, this.nibbleRest - dt);

    const depth = -this.whale.position.y;
    const up = depth <= BREATH.depth;

    // A gull, if the whale is up and has been up a while.
    if (!moving && up && this.still > IDLE.gull) {
      this.whale.back(this.perch);
      this.sky.perchOn(this.perch, this.whale.heading);
    } else {
      this.sky.perchOn(null, 0);
    }

    // Fish, if it is down and has been down a while. They are handed the
    // whale's own middle and heading and work out where to hang from that —
    // off its flank, behind the mouth and outside its body.
    if (
      !moving &&
      !up &&
      depth > IDLE.minDepth &&
      this.still > IDLE.fish &&
      (this.nibbled || this.nibbleRest === 0)
    ) {
      this.nibbled = true;
      this.fish.nibble(this.whale.position, this.whale.heading);

      this.bubbleIn -= dt;
      if (this.bubbleIn <= 0) {
        this.bubbleIn = IDLE.bubbleEvery;
        this.whale.blowhole(this.hole);
        this.bubbles.burst(this.hole, {
          color: [0xdffcff, 0xffffff],
          count: 4,
          speed: 2,
          lift: 3,
          // Negative, so they rise. Slowly — this is a whale sighing, not a
          // whale breathing out.
          gravity: -5,
          ttl: 2.4,
          size: 5,
          spherical: 0.7,
        });
      }
    } else {
      // They only start resting once they have actually been. Otherwise every
      // second of ordinary swimming would set the timer and they would never
      // come at all.
      if (this.nibbled) {
        this.nibbled = false;
        this.nibbleRest = IDLE.nibbleRest;
      }
      this.fish.nibble(null, 0);
      this.bubbleIn = 0;
    }
  }

  /**
   * Beluga vision.
   *
   * How dark it is depends on depth alone, not on being over the hole: you can
   * be above the abyss in bright water, and the light goes as you descend into
   * it. It is eased rather than switched, so swimming down into the dark is
   * something you watch happen.
   *
   * The clicks only start once it is properly dark. A whale that can see does
   * not need to echolocate, and a pulse washing over a sunlit reef would be a
   * special effect rather than a sense.
   */
  private listen(dt: number): void {
    const depth = -this.whale.position.y;
    const want = Math.min(
      1,
      Math.max(0, (depth - ABYSS.darkFrom) / (ABYSS.darkTo - ABYSS.darkFrom)),
    );
    this.dark += (want - this.dark) * (1 - Math.exp(-1.6 * dt));

    this.sonar.update(dt, this.dark, this.stage.camera);
    if (this.dark < 0.25) {
      this.clickIn = 0;
      return;
    }

    this.clickIn -= dt;
    if (this.clickIn <= 0) {
      this.clickIn = SONAR.every;
      this.whale.melon(this.hole);
      this.sonar.click(this.hole);
    }
  }

  /** Ate a bag. Gentle about it — the card does the talking. */
  private spoil(): void {
    this.finished = true;
    this.stick.enabled = false;
    this.depth.setVisible(false);
    this.hud.setVisible(false);
    this.ocean.oops();
    this.bubbles.burst(this.mouth, {
      color: [0xdffcff, 0xffffff],
      count: 26,
      speed: 10,
      lift: 5,
      gravity: -9,
      ttl: 1.8,
      size: 9,
      spherical: 1,
    });
    this.oops.show();
  }

  /**
   * Through the arch.
   *
   * The controls go, the whale coasts on through, and the sky over the arch
   * goes up in colour for a couple of seconds before anybody is told anything.
   */
  private win(): void {
    this.finished = true;
    this.stick.enabled = false;
    this.depth.setVisible(false);
    this.hud.setVisible(false);
    this.cheering = FINISH.cheer;
    this.burstIn = 0;
    this.bang();
    // How many, not how many out of how many. There are a couple of hundred
    // fish on this reef and nobody is going to eat them all — a score printed
    // as a fraction of that would turn a good swim into a bad mark.
    const all = this.fish.eaten === this.fish.total;
    const n = this.fish.eaten;
    const squid = this.squid.eaten;
    // The squid only get a mention if any were caught. Nobody who never found
    // the abyss should be told what they missed on the card that congratulates
    // them.
    const alsoSquid =
      squid === 0
        ? ""
        : squid === 1
          ? " You even caught a squid down in the dark."
          : ` You even caught ${squid} squid down in the dark.`;
    this.done.setTitle(all ? "Every last fish!" : "You made it!");
    this.done.setBody(
      (all
        ? "You swam the whole reef and there is not one fish left on it."
        : `You swam the whole reef, ate ${n} fish and never once ate the plastic.`) +
        alsoSquid,
    );
  }

  /** One firework, somewhere around the whale. */
  private bang(): void {
    this.hole
      .set(
        (Math.random() - 0.5) * FINISH.spread,
        (Math.random() - 0.5) * FINISH.spread * 0.7,
        (Math.random() - 0.5) * FINISH.spread,
      )
      .add(this.whale.position);
    this.sparks.burst(this.hole, {
      color: FIREWORK_PALETTE,
      count: 70,
      speed: 17,
      lift: 5,
      // Barely falling: this is under water, and sparks that dropped like
      // sparks would give away that they are the caterpillar game's fireworks
      // with the gravity turned down.
      gravity: -2,
      ttl: 2.2,
      size: 9,
      spherical: 1,
    });
  }

  /**
   * The seconds between crossing the line and being told you have.
   *
   * The whale keeps its way on and the fireworks keep coming; nothing else in
   * the game is ticked, because nothing else matters any more.
   */
  private celebrate(dt: number): void {
    this.whale.update(dt, this.want.set(0, 0, 0), 0, false);
    this.sparks.update(dt);
    this.bubbles.update(dt);

    this.burstIn -= dt;
    if (this.burstIn <= 0) {
      this.burstIn = FINISH.every;
      this.bang();
    }

    this.cheering = (this.cheering ?? 0) - dt;
    if (this.cheering <= 0) {
      this.cheering = null;
      this.done.show();
    }
  }

  render = (alpha: number): void => {
    this.whale.render(alpha);
    this.followCamera(SIM.step);
    this.stage.setView(-this.whale.position.y, this.air, this.dark);
    this.reef.setAir(this.air);
    this.sky.setAir(this.air);
    this.depth.setActualDepth(-this.whale.position.y);
    this.hud.update(
      this.reef.progressAt(this.whale.position.z),
      this.fish.eaten,
      this.squid.eaten,
    );
    this.stage.render();
  };

  /**
   * Behind and a little above, looking where the whale is going.
   *
   * The looseness is in the *heading*, not in the position: at these speeds a
   * camera closing a fixed share of the gap every frame sits permanently
   * behind the thing it is following. The heading lags, and the eye is then
   * placed exactly off it. That one is written up in the squirrel game's
   * notes, where it cost an afternoon.
   */
  private followCamera(dt: number): void {
    let delta = this.whale.heading - this.camHeading;
    while (delta > Math.PI) {
      delta -= TAU;
    }
    while (delta < -Math.PI) {
      delta += TAU;
    }
    this.camHeading += delta * (1 - Math.exp(-CAMERA.headingLag * dt));

    // Clamped, and it has to be. This is a ratio against the *base* climb
    // rate, and a breach leaves the water at nearly four times that — which
    // put the eye sixty-eight units under the whale and aimed it at the sky.
    const climb = Math.max(
      -1,
      Math.min(1, this.whale.velocity.y / SWIM.climbSpeed),
    );
    this.camPitch +=
      (climb - this.camPitch) * (1 - Math.exp(-CAMERA.pitchLag * dt));

    const p = this.whale.group.position;
    const fx = Math.sin(this.camHeading);
    const fz = Math.cos(this.camHeading);
    // Pulling back in the dark. There is nothing to look at close to down
    // there and a great deal happening at range — see CAMERA.darkDistance.
    const back =
      CAMERA.distance + (CAMERA.darkDistance - CAMERA.distance) * this.dark;
    const lift =
      CAMERA.height + (CAMERA.darkHeight - CAMERA.height) * this.dark;
    this.eye.set(
      p.x - fx * back,
      p.y + lift - this.camPitch * back * 0.35,
      p.z - fz * back,
    );

    // Never through the sand: a screen full of grit is not the game.
    const floor = this.reef.floorAt(this.eye.x, this.eye.z) + CAMERA.floorClear;
    if (this.eye.y < floor) {
      this.eye.y = floor;
    }

    // The surface, from both sides. Deep down the shot is held under the
    // water; as the whale comes up for air the shot rises with it and finishes
    // in the open air above the waves. The two are one interpolation rather
    // than a switch, because a camera that jumped through the surface would
    // cut from sea to sky in a single frame.
    const depth = -this.whale.position.y;
    const up = Math.min(1, Math.max(0, 1 - depth / CAMERA.breachDepth));
    const line =
      -CAMERA.surfaceClear + up * (CAMERA.airClear + CAMERA.surfaceClear);
    this.eye.y =
      up > 0 ? Math.max(this.eye.y, line) : Math.min(this.eye.y, line);
    this.stage.camera.position.copy(this.eye);
    // How much sky to show. Off the eye's own height, not off the whale's, so
    // the world turns back into water at the moment the lens goes under.
    this.air = Math.min(1, Math.max(0, this.eye.y / CAMERA.airClear));

    this.look.set(
      p.x + fx * CAMERA.lookAhead,
      p.y + this.camPitch * CAMERA.lookAhead * 0.5,
      p.z + fz * CAMERA.lookAhead,
    );
    this.stage.camera.lookAt(this.look);
  }

  /** Straight to where the camera belongs, for the first frame. */
  private snapCamera(): void {
    this.camHeading = this.whale.heading;
    this.followCamera(1);
  }
}
