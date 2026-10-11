import {EDGE, MONKEY, SIM, WORLD} from "./config";
import {Input} from "./core/input";
import {Monkey} from "./entities/monkey";
import {paint} from "./render/draw";
import {Screen} from "./render/screen";
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
  private time = 0;
  private behind = 0;
  private last = 0;
  private stopped = false;

  constructor(into: HTMLElement) {
    this.screen = new Screen(into);
    this.input = new Input(this.screen.canvas);
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
    this.monkey.step(
      dt,
      this.input.push,
      this.input.climb,
      tapped,
      this.jungle,
    );
    this.jungle.update(dt, this.time, this.monkey.vine);

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

    if (this.monkey.arrived) {
      this.restart();
    }
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

  /** Home, and round again. Nothing here can be failed — falling off costs
   *  you the swing you were on and nothing else — so arriving is the only
   *  ending there is, and it starts the jungle over. */
  private restart(): void {
    this.jungle = new Jungle();
    this.monkey = new Monkey();
    this.camera = 0;
  }

  private draw(alpha: number): void {
    paint(
      this.screen,
      this.jungle,
      this.monkey,
      Math.round(this.camera),
      this.time,
      alpha,
    );
  }

  stop(): void {
    this.stopped = true;
  }
}
