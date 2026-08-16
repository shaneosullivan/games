/**
 * The world map.
 *
 * Positions are fractions of the map image (assets/planning/levelmap.png,
 * 920x790), so the markers stay put however the image is scaled.
 *
 * A land with no levels yet is shown locked with a "coming soon" note; a land
 * whose levels you haven't reached is locked with a padlock.
 */
export interface Land {
  id: string;
  name: string;
  /** 0..1 across and down the map image. */
  x: number;
  y: number;
  /** Levels playable here, in order. Empty means nothing built yet. */
  levels: ReadonlyArray<number>;
}

/**
 * Pins sit on each land's *terrain*, not its hand-lettered banner — a pin on
 * the banner hides the name the map already draws.
 */
export const LANDS: ReadonlyArray<Land> = [
  {id: "bears", name: "The Bear's Lair", x: 0.163, y: 0.196, levels: [6]},
  {id: "mountain", name: "The Mouldy Mountain", x: 0.717, y: 0.215, levels: []},
  {id: "cottage", name: "Caramel Cottage", x: 0.491, y: 0.355, levels: [4]},
  {id: "woods", name: "The Windy Woods", x: 0.826, y: 0.304, levels: [5]},
  // The Bee Tree is a landmark within the meadow, not somewhere you travel to,
  // so it gets no pin.
  {
    id: "meadow",
    name: "The Mellow Meadow",
    x: 0.435,
    y: 0.544,
    levels: [1, 2, 3],
  },
  {id: "islands", name: "Silent Islands", x: 0.826, y: 0.703, levels: [7]},
];

/** Which land a level belongs to. */
export function landForLevel(level: number): Land | undefined {
  return LANDS.find(l => l.levels.includes(level));
}
