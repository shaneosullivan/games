import * as THREE from "three";
import {TAG} from "../config";

/**
 * A child's name, floating over their car.
 *
 * Only over somebody else's: you know which car is yours, and a label on it
 * would be one more thing between you and the road.
 *
 * Deliberately faint. In a race against another child the useful question is
 * "which of those two is Sam", asked once at the start and once when a car
 * comes past; the rest of the time a name over every car is clutter on top of
 * the one thing a driver is actually looking at. So it is small, half
 * transparent, and drawn in the plain hand the rest of the game uses — there
 * when looked for, and not shouting the rest of the time.
 *
 * A sprite rather than anything in the page, for two reasons: it turns to face
 * the camera on its own, and it lives in the scene, so it rides with the car
 * over a jump and goes behind a flyover with it instead of floating on the
 * glass in front of everything.
 */
export function nameTag(name: string): THREE.Sprite | null {
  if (!name) {
    return null;
  }
  const paper = document.createElement("canvas");
  paper.width = TAG.pixels;
  paper.height = TAG.pixels / TAG.aspect;
  const ink = paper.getContext("2d");
  if (!ink) {
    return null;
  }

  ink.clearRect(0, 0, paper.width, paper.height);
  ink.textAlign = "center";
  ink.textBaseline = "middle";
  ink.font = `700 ${Math.round(paper.height * TAG.text)}px ${TAG.font}`;
  // A dark edge under the letters rather than a box around them. A card behind
  // the name would be a solid shape on the road — the thing that makes a label
  // noticeable, which is what this is trying not to be — and without *some*
  // edge, pale letters vanish on concrete and dark ones vanish on tarmac.
  ink.lineWidth = Math.round(paper.height * TAG.edge);
  ink.lineJoin = "round";
  ink.strokeStyle = `rgba(0, 0, 0, ${TAG.shade})`;
  ink.strokeText(name, paper.width / 2, paper.height / 2);
  ink.fillStyle = "#ffffff";
  ink.fillText(name, paper.width / 2, paper.height / 2);

  const texture = new THREE.CanvasTexture(paper);
  texture.colorSpace = THREE.SRGBColorSpace;
  // The label is text, not a surface in the world: tone mapping would take the
  // white down to whatever the exposure says, which on the desert track is a
  // different grey than in the neon city.
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: TAG.opacity,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sprite.scale.set(TAG.wide, TAG.wide / TAG.aspect, 1);
  sprite.position.y = TAG.above;
  // Drawn after the cars, so a name is never half-hidden by the roof of the
  // car it belongs to.
  sprite.renderOrder = TAG.order;
  return sprite;
}
