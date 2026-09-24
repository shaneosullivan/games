import type {Environment} from "../config";
import desertUrl from "../assets/music/race-desert.m4a";
import hillsUrl from "../assets/music/race-hills.m4a";
import neonUrl from "../assets/music/race-neon.m4a";

/**
 * The music for a race, one piece per place.
 *
 * Only one is ever fetched: these are the biggest things the game downloads
 * after the animals, and a child racing in the hills has no use for the
 * desert's. Fetched as bytes here and handed to the engine to decode, because
 * the fetch can happen while the circuit is still being built — behind the
 * loading card, where there is already a bar going round — and decoding needs
 * an audio context, which a browser will not start until somebody has touched
 * the screen.
 *
 * Everything here fails quietly. A race with no music is a race; a race that
 * will not start because a file did not arrive is not.
 */
const TUNES: Record<Environment, string> = {
  hills: hillsUrl,
  desert: desertUrl,
  neon: neonUrl,
};

export async function fetchMusic(
  environment: Environment,
): Promise<ArrayBuffer | null> {
  try {
    const answer = await fetch(TUNES[environment]);
    if (!answer.ok) {
      return null;
    }
    return await answer.arrayBuffer();
  } catch {
    // No network, or a file that is not there. The race is the point.
    return null;
  }
}
