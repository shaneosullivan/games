import {EDGE, JUNGLE, LAKE, MONKEY, PARTY, SIM, WORLD} from "./config";
import {Input} from "./core/input";
import {Sound} from "./core/sound";
import {Monkey} from "./entities/monkey";
import {paint} from "./render/draw";
import {Party} from "./render/particles";
import {Screen} from "./render/screen";
import {Hud} from "./ui/hud";
import {Jungle} from "./world/jungle";

/**
 * The game: a jungle, a monkey, and the clock that drives them.
 *
 * Fixed step with an interpolated picture, the same as the other games here.
 * A pendulum worked out at whatever rate the device feels like would swing
 * differently on a fast phone and a slow one, and a swing that depends on the
 * hardware is not a swing anybody can learn.
 */
export class Game {
  readonly screen: Screen;
  readonly input: Input;
  jungle = new Jungle();
  monkey = new Monkey();
  camera = 0;
  readonly party = new Party();
  readonly sound = new Sound();
  readonly hud: Hud;
  /** How many bananas have been taken, and whether home has been reached. */
  bananas = 0;
  finished = false;
  /** While this is counting down the monkey is in the water and the game is
   *  letting the player see it before putting them back. */
  private sinking = 0;
  private partyIn = 0;
  private time = 0;
  private behind = 0;
  private last = 0;
  private stopped = false;

  constructor(into: HTMLElement) {
    this.screen = new Screen(into);
    this.input = new Input(this.screen.canvas);
    this.hud = new Hud(
      into,
      () => this.restart(),
      muted => this.sound.setMuted(muted),
    );
    // A browser will not make a noise until the page has been touched, so
    // the audio is built on the first touch and not on load.
    const wake = (): void => this.sound.wake();
    window.addEventListener("pointerdown", wake, {once: true});
    window.addEventListener("keydown", wake, {once: true});
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    if (this.stopped) {
      return;
    }
    const dt = Math.min(SIM.most, (now - this.last) / 1000);
    this.last = now;
    this.behind += dt;
    let tapped = this.input.took();
    while (this.behind >= SIM.step) {
      this.behind -= SIM.step;
      this.step(SIM.step, tapped);
      // A tap belongs to one step, not to every step in a slow frame.
      tapped = false;
    }
    this.draw(this.behind / SIM.step);
    requestAnimationFrame(this.frame);
  };

  private step(dt: number, tapped: boolean): void {
    this.time += dt;
    this.party.update(dt);

    if (this.finished) {
      // Home. The jungle carries on breathing and the party keeps going up
      // over the hut until somebody presses the button.
      this.jungle.update(dt, this.time, null);
      this.partyIn -= dt;
      if (this.partyIn <= 0) {
        this.partyIn = PARTY.every;
        this.party.burst(
          this.jungle.homeX + (Math.random() - 0.5) * 70,
          WORLD.floor - 30 - Math.random() * 20,
        );
      }
      return;
    }

    if (this.sinking > 0) {
      // In the water: the monkey sinks where it fell while the player takes
      // in what happened, and then it is put back on the near bank.
      this.sinking -= dt;
      this.monkey.wasY = this.monkey.y;
      this.monkey.y += 26 * dt;
      this.jungle.update(dt, this.time, null);
      if (this.sinking <= 0) {
        this.toTheBank();
      }
      return;
    }

    this.monkey.step(
      dt,
      this.input.push,
      this.input.climb,
      tapped,
      this.jungle,
    );
    this.jungle.update(dt, this.time, this.monkey.vine, this.monkey.x);
    this.snapping();
    this.takeBananas();
    this.checkTheWater();

    // The camera sits the monkey a third of the way across, so there is
    // twice as much jungle ahead as behind — which is where the next vine
    // is, and the only thing worth looking at.
    const want = this.monkey.x - this.screen.wide / 3;
    const ease = 1 - Math.exp(-6 * dt);
    this.camera += (want - this.camera) * ease;
    this.camera = Math.max(
      0,
      Math.min(WORLD.far - this.screen.wide + 40, this.camera),
    );
    this.keepInView();

    if (this.monkey.arrived && !this.finished) {
      this.finished = true;
      this.partyIn = 0;
      this.hud.setFinished(true, this.bananas, this.jungle.bananas.length);
    }
  }

  /** The crocodiles, when their jaws come together. Only the ones on screen
   *  — a chomp from a crocodile a child cannot see is a mystery noise. */
  private snapping(): void {
    for (const croc of this.jungle.crocs) {
      const at = croc.x - this.camera;
      const onScreen = at > -20 && at < this.screen.wide + 20;
      if (croc.bit && onScreen) {
        this.sound.chomp();
      }
      // Water thrown about as the head comes through the surface.
      if (croc.rose && onScreen) {
        this.party.burst(
          croc.x,
          WORLD.floor + LAKE.deep - 6,
          10,
          PARTY.splashColours,
          true,
        );
      }
    }
  }

  /**
   * Swinging through a banana takes it.
   *
   * Measured from the monkey's middle rather than its hands, because a
   * banana is taken by passing through it and the whole monkey passes
   * through it.
   */
  private takeBananas(): void {
    const mx = this.monkey.x;
    const my = this.monkey.y - MONKEY.tall / 2;
    for (const banana of this.jungle.bananas) {
      if (banana.taken || Math.abs(banana.x - mx) > JUNGLE.bananaReach) {
        continue;
      }
      if (Math.hypot(banana.x - mx, banana.y - my) > JUNGLE.bananaReach) {
        continue;
      }
      banana.taken = true;
      this.bananas += 1;
      this.sound.banana();
      this.hud.setScore(this.bananas);
      this.party.burst(banana.x, banana.y, 8, PARTY.colours, true);
    }
  }

  /**
   * Falling in the lake.
   *
   * The water is the one place a mistake costs anything, and it costs the
   * crossing rather than the jungle: back to the near bank, which is where
   * the attempt started. Letting go over water and missing is a thing a
   * child will do twenty times, and twenty times back to the beginning is
   * how a game gets put down.
   */
  private checkTheWater(): void {
    if (this.monkey.doing === "swing" || this.monkey.doing === "climb") {
      return;
    }
    if (!this.jungle.overWater(this.monkey.x)) {
      return;
    }
    if (this.monkey.y < WORLD.floor) {
      return;
    }
    this.sinking = LAKE.watchFor;
    this.sound.splash();
    this.monkey.vx = 0;
    this.monkey.vy = 0;
    this.party.burst(
      this.monkey.x,
      WORLD.floor + 2,
      PARTY.splashBits,
      PARTY.splashColours,
      true,
    );
  }

  /** Back to the bank, facing the water, to go again. */
  private toTheBank(): void {
    const monkey = this.monkey;
    monkey.vine = null;
    monkey.tree = null;
    monkey.doing = "ground";
    monkey.x = this.jungle.lakeFrom - LAKE.backBy;
    monkey.y = WORLD.floor;
    monkey.wasX = monkey.x;
    monkey.wasY = monkey.y;
    monkey.vx = 0;
    monkey.vy = 0;
    monkey.facingLeft = false;
    // The camera goes with it. Without this the monkey is put on the bank
    // and then dragged straight back off it by the rule that keeps it on
    // screen, because the view is still out over the water.
    this.camera = monkey.x - this.screen.wide / 3;
  }

  /**
   * Keeps the monkey inside the picture.
   *
   * The camera follows it everywhere except at the two ends of the jungle,
   * where it has run out of world to show; there, and only there, the monkey
   * can out-walk the view. It is also possible to fly off the top of the
   * screen from a good swing. Both are the same fault — a monkey you cannot
   * see — so both are held here, against the view rather than against the
   * world, which is the thing a child actually looks at.
   *
   * A swing is left alone: the monkey is on the end of a rope and moving it
   * would take it off the rope. The vines all hang well inside the jungle,
   * so there is nothing to hold it away from.
   */
  private keepInView(): void {
    const left = this.camera + EDGE.margin;
    const right = this.camera + this.screen.wide - EDGE.margin;
    const top = MONKEY.tall + EDGE.margin;
    if (this.monkey.doing !== "swing") {
      if (this.monkey.x < left) {
        this.monkey.x = left;
        this.monkey.vx = Math.max(0, this.monkey.vx);
      } else if (this.monkey.x > right) {
        this.monkey.x = right;
        this.monkey.vx = Math.min(0, this.monkey.vx);
      }
    }
    if (this.monkey.y < top) {
      this.monkey.y = top;
      this.monkey.vy = Math.max(0, this.monkey.vy);
    }
  }

  /** Everything back to the beginning, from the button at the end. */
  private restart(): void {
    this.jungle = new Jungle();
    this.monkey = new Monkey();
    this.camera = 0;
    this.bananas = 0;
    this.finished = false;
    this.sinking = 0;
    this.party.clear();
    this.hud.setFinished(false);
    this.hud.setScore(0);
    this.hud.setProgress(0);
  }

  private draw(alpha: number): void {
    this.hud.setProgress(this.monkey.x / this.jungle.homeX);
    paint(
      this.screen,
      this.jungle,
      this.monkey,
      Math.round(this.camera),
      this.time,
      alpha,
      this.party,
    );
  }

  stop(): void {
    this.stopped = true;
  }
}
