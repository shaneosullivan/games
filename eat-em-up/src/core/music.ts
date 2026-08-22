import calmTrack from "../assets/mossy_trail.mp3";
import rainbowTrack from "../assets/rainbow_time.mp3";
import chompTrack from "../assets/grass.m4a";
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

  /**
   * The munching, which lives here with the music because the sound switch has
   * to silence everything and this is what owns being muted.
   *
   * Several voices rather than one: a caterpillar in the meadow bites faster
   * than the clip lasts, and a single element would cut itself off mid-chew on
   * every mouthful.
   */
  private readonly chomps: Array<HTMLAudioElement> = [];
  private nextChomp = 0;
  private sinceChomp = 0;

  constructor() {
    for (let i = 0; i < MUSIC.chompVoices; i++) {
      const chomp = new Audio(chompTrack);
      chomp.volume = MUSIC.chompVolume;
      chomp.preload = "auto";
      this.chomps.push(chomp);
    }
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

  /**
   * A mouthful of grass. Called on every tuft; it decides for itself whether
   * this one is heard.
   *
   * `dt` rather than a clock of its own, so it keeps to the game's time and a
   * paused game does not come back owing itself a run of chews.
   */
  munch(dt: number, eating: boolean): void {
    this.sinceChomp += dt;
    if (!eating || this.muted || this.sinceChomp < MUSIC.chompGap) {
      return;
    }
    this.sinceChomp = 0;
    const voice = this.chomps[this.nextChomp % this.chomps.length];
    this.nextChomp++;
    voice.currentTime = 0;
    voice.playbackRate =
      MUSIC.chompPitchMin +
      Math.random() * (MUSIC.chompPitchMax - MUSIC.chompPitchMin);
    void voice.play().catch(() => {});
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
      for (const chomp of this.chomps) {
        chomp.pause();
      }
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
