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
    for (const [name, bite] of Object.entries(BITE_SOUNDS)) {
      const voices: Array<HTMLAudioElement> = [];
      for (let i = 0; i < MUSIC.chompVoices; i++) {
        const voice = new Audio(bite.url);
        voice.volume = bite.volume ?? MUSIC.chompVolume;
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

    // Try it straight away, and again on the first touch of anything.
    //
    // A browser will refuse to play audio nobody asked for, and on an iPad
    // that refusal is the default — but not everywhere, and where it is
    // allowed the wood should have its music from the moment it is on screen
    // rather than from whenever the intro card is dismissed. Where it is
    // refused, the first touch anywhere starts it: a child who taps the screen
    // before finding the button has asked for the game to begin as surely as
    // one who presses it.
    this.started = true;
    this.resume();
    const wake = (): void => {
      this.resume();
      for (const type of WAKE_EVENTS) {
        window.removeEventListener(type, wake);
      }
    };
    for (const type of WAKE_EVENTS) {
      window.addEventListener(type, wake, {passive: true});
    }

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

  /**
   * The game has begun. Harmless if the music is already going, which it will
   * be if the browser allowed it or the player touched anything on the way to
   * the button.
   */
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
    this.rainbow.currentTime = 0;
    this.current = this.rainbow;
    this.resume();
  }

  /** The fit has worn off: back to the wood's own music, from where it was. */
  endRainbow(): void {
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

  /**
   * Plays whichever track is wanted and silences the other, if it is allowed
   * to play anything at all.
   *
   * Silencing the other one here, every time, rather than trusting each caller
   * to have done it: there is one piece of music playing in this game at any
   * moment, and the way to be sure of that is to have one place that can start
   * anything and to have it stop everything else on the way past. Two tracks
   * running over each other is the kind of fault nobody hears in a quiet
   * office and everybody hears on an iPad.
   */
  private resume(): void {
    for (const track of [this.calm, this.rainbow]) {
      if (track !== this.current && !track.paused) {
        track.pause();
      }
    }
    if (!this.started || this.muted || document.hidden) {
      return;
    }
    void this.current.play().catch(() => {});
  }

  /** For tests and for peace of mind: how many tracks are sounding. */
  get tracksPlaying(): number {
    return [this.calm, this.rainbow].filter(t => !t.paused).length;
  }
}

/**
 * Which recording each variety of food asks for by name; see FoodField.
 *
 * The peach takes the orange, being the orange one of the four fruits. There
 * is no flower and no mushroom here — nothing was recorded for them, and
 * silence beats the wrong noise.
 */
/** The first of these to happen is treated as the player arriving. */
const WAKE_EVENTS = ["pointerdown", "touchstart", "keydown"] as const;

const BITE_SOUNDS: Record<string, {url: string; volume?: number}> = {
  grass: {url: grassBite},
  leaf: {url: leafBite},
  blueberry: {url: blueberryBite},
  apple: {url: appleBite},
  strawberry: {url: strawberryBite},
  blackberry: {url: blackberryBite},
  orange: {url: orangeBite},
  // Flowers borrow the leaf, which is the same soft green thing to bite
  // through. Mushrooms borrow the apple's crunch, turned down: a mushroom
  // gives way where an apple resists.
  mushroom: {url: appleBite, volume: MUSIC.chompVolume * MUSIC.mushroomHush},
};

function makeTrack(src: string, volume: number): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = volume;
  audio.preload = "auto";
  return audio;
}
