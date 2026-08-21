import track from "../assets/mossy_trail.mp3";
import {MUSIC} from "../config";

/**
 * The background music: one track, looping, with a way to turn it off.
 *
 * An `Audio` element rather than the WebAudio graph. There is one sound in
 * this game and nothing has to be mixed, positioned or timed against anything
 * else, and an element loops and streams on its own — WebAudio would mean
 * decoding the whole file up front to gain nothing.
 *
 * It cannot be started until the player has touched the screen: a browser will
 * refuse to play audio that no one asked for, and on iPad that refusal is the
 * default. So `start` is called from the button on the intro panel, which is
 * the first thing anyone touches, and a refusal is swallowed rather than
 * thrown — music that will not play is not a reason for the game not to run.
 */
export class Music {
  private readonly audio: HTMLAudioElement;
  private muted = false;
  /** Whether the game has asked for music at all yet. */
  private started = false;

  constructor() {
    this.audio = new Audio(track);
    this.audio.loop = true;
    this.audio.volume = MUSIC.volume;
    this.audio.preload = "auto";

    // A tablet game left on the table is a tab nobody is looking at, and music
    // coming out of one is just a noise in the room.
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.audio.pause();
      } else if (this.started && !this.muted) {
        void this.audio.play().catch(() => {});
      }
    });
  }

  /** Called from the first touch: see the note about autoplay above. */
  start(): void {
    this.started = true;
    if (this.muted) {
      return;
    }
    void this.audio.play().catch(() => {});
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** The shared sound button owns the state and tells us what it is. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.audio.pause();
    } else if (this.started) {
      void this.audio.play().catch(() => {});
    }
  }
}
