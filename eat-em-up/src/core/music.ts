import calmTrack from "../assets/mossy_trail.mp3";
import rainbowTrack from "../assets/rainbow_time.mp3";
import {MUSIC} from "../config";

/**
 * The music: the wood's own track, and the one that takes over during a fit.
 *
 * `Audio` elements rather than the WebAudio graph. Nothing here has to be
 * mixed, positioned or timed against anything else — one track plays and the
 * other doesn't — and an element loops and streams on its own, where WebAudio
 * would mean decoding whole files up front to gain nothing.
 *
 * Neither can be started until the player has touched the screen: a browser
 * will refuse to play audio that no one asked for, and on iPad that refusal is
 * the default. So `start` is called from the button on the intro panel, which
 * is the first thing anyone touches, and a refusal is swallowed rather than
 * thrown — music that will not play is not a reason for the game not to run.
 */
export class Music {
  private readonly calm: HTMLAudioElement;
  private readonly rainbow: HTMLAudioElement;
  /** Whichever of the two the game currently wants playing. */
  private current: HTMLAudioElement;
  private muted = false;
  /** Whether the game has asked for music at all yet. */
  private started = false;

  constructor() {
    this.calm = makeTrack(calmTrack, MUSIC.volume);
    this.rainbow = makeTrack(rainbowTrack, MUSIC.rainbowVolume);
    this.current = this.calm;

    // A tablet game left on the table is a tab nobody is looking at, and music
    // coming out of one is just a noise in the room.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.calm.pause();
        this.rainbow.pause();
      } else {
        this.resume();
      }
    });
  }

  /** Called from the first touch: see the note about autoplay above. */
  start(): void {
    this.started = true;
    this.resume();
  }

  /**
   * A rainbow mushroom has hold of the caterpillar: hand over to the other
   * track.
   *
   * Rewound rather than resumed, so a second mushroom eaten during a fit
   * starts the tune again from the top, the way the fit itself restarts.
   */
  beginRainbow(): void {
    this.calm.pause();
    this.rainbow.currentTime = 0;
    this.current = this.rainbow;
    this.resume();
  }

  /** The fit has worn off: back to the wood's own music, from where it was. */
  endRainbow(): void {
    this.rainbow.pause();
    this.current = this.calm;
    this.resume();
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** The shared sound button owns the state and tells us what it is. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.calm.pause();
      this.rainbow.pause();
      return;
    }
    this.resume();
  }

  /** Plays whichever track is wanted, if it is allowed to play anything. */
  private resume(): void {
    if (!this.started || this.muted || document.hidden) {
      return;
    }
    void this.current.play().catch(() => {});
  }
}

function makeTrack(src: string, volume: number): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = volume;
  audio.preload = "auto";
  return audio;
}
