import calmTrack from "../assets/mossy_trail.mp3";
import rainbowTrack from "../assets/rainbow_time.mp3";
import grassBite from "../assets/grass.m4a";
import leafBite from "../assets/leaf.m4a";
import blueberryBite from "../assets/blueberry.m4a";
import appleBite from "../assets/apple.m4a";
import strawberryBite from "../assets/strawberry.m4a";
import blackberryBite from "../assets/blackberry.m4a";
import orangeBite from "../assets/orange.m4a";
import wingsTrack from "../assets/wings.m4a";
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
   * The eating, which lives here with the music because the sound switch has
   * to silence everything and this is what owns being muted.
   *
   * One little pool of voices per food, because the four fruits do not sound
   * alike — an apple is a crunch and a blackberry is not — and several voices
   * each because a caterpillar in the meadow bites faster than a clip lasts,
   * where one element would cut itself off mid-chew on every mouthful.
   */
  private readonly bites = new Map<
    string,
    {voices: Array<HTMLAudioElement>; next: number}
  >();
  private sinceBite = 0;
  /** How long since anything at all was eaten; see munch. */
  private sinceSomething = 0;
  /** The crow's wings, looping while it is in the air. */
  private readonly wingBeat: HTMLAudioElement;

  constructor() {
    for (const [name, url] of Object.entries(BITE_SOUNDS)) {
      const voices: Array<HTMLAudioElement> = [];
      for (let i = 0; i < MUSIC.chompVoices; i++) {
        const voice = new Audio(url);
        voice.volume = MUSIC.chompVolume;
        voice.preload = "auto";
        voices.push(voice);
      }
      this.bites.set(name, {voices, next: 0});
    }

    this.wingBeat = new Audio(wingsTrack);
    this.wingBeat.loop = true;
    this.wingBeat.volume = MUSIC.wingsVolume;
    this.wingBeat.preload = "auto";

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
   * A mouthful of something. `sound` is the variety's own noise, or null if it
   * has none — flowers and mushrooms are eaten in silence.
   *
   * Called on every bite and decides for itself whether this one is heard.
   * `dt` rather than a clock of its own, so it keeps to the game's time and a
   * paused game does not come back owing itself a run of chews.
   *
   * The gap between chews is one gap across all foods rather than one each:
   * you only ever eat one thing at a time, and a per-food gap would let a
   * mouthful of grass and a mouthful of leaf fire together and clatter.
   */
  munch(dt: number, sound: string | null | undefined): void {
    this.sinceBite += dt;
    if (sound) {
      this.sinceSomething = 0;
    } else {
      this.sinceSomething += dt;
      // Stopped eating: stop the noise of eating. Several of these clips run
      // past three seconds, so left to finish they would still be chewing
      // long after the caterpillar had wandered off.
      if (this.sinceSomething > MUSIC.chompHold) {
        this.stopEating();
      }
    }
    if (!sound || this.muted || this.sinceBite < MUSIC.chompGap) {
      return;
    }
    const pool = this.bites.get(sound);
    if (!pool) {
      return;
    }
    this.sinceBite = 0;
    const voice = pool.voices[pool.next % pool.voices.length];
    pool.next++;
    voice.currentTime = 0;
    voice.playbackRate =
      MUSIC.chompPitchMin +
      Math.random() * (MUSIC.chompPitchMax - MUSIC.chompPitchMin);
    void voice.play().catch(() => {});
  }

  /** Cuts any chewing short, wherever it had got to. */
  stopEating(): void {
    for (const pool of this.bites.values()) {
      for (const voice of pool.voices) {
        if (!voice.paused) {
          voice.pause();
          voice.currentTime = 0;
        }
      }
    }
  }

  /** The crow's wings, on while it is in the air and off when it has gone. */
  setWings(beating: boolean): void {
    if (!beating || this.muted) {
      this.wingBeat.pause();
      return;
    }
    void this.wingBeat.play().catch(() => {});
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
      this.wingBeat.pause();
      for (const pool of this.bites.values()) {
        for (const voice of pool.voices) {
          voice.pause();
        }
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

/**
 * Which recording each variety of food asks for by name; see FoodField.
 *
 * The peach takes the orange, being the orange one of the four fruits. There
 * is no flower and no mushroom here — nothing was recorded for them, and
 * silence beats the wrong noise.
 */
const BITE_SOUNDS: Record<string, string> = {
  grass: grassBite,
  leaf: leafBite,
  blueberry: blueberryBite,
  apple: appleBite,
  strawberry: strawberryBite,
  blackberry: blackberryBite,
  orange: orangeBite,
};

function makeTrack(src: string, volume: number): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = volume;
  audio.preload = "auto";
  return audio;
}
