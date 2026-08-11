# Bee Game

This is a 3d game that simulates multiple aspects about bees. See the image in assets/planning/ui.png for the general look and feel.
The idea is to have an angled view of the bee as it flies in front of you. On the bottom left is control for moving the bee. That control
appears wherever the user places their finger. The bee stays at the same altitude by default.
Once you put in your code name you load into the game.

## Implementation

This is intended to run on an iPad and be touch-native. I don't have an opinion on the tech stack, but it should be highly responsive,
easy to implement and work very well full screen on the iPad.

### Decided

TypeScript + Three.js + Vite, run as a fullscreen web app added to the iPad home
screen. Chosen over Unity/Godot/RealityKit for iteration speed and because it
needs no Xcode, signing or App Store review. Capacitor can wrap it natively
later with no code changes. See [../README.md](../README.md).

## Assets

You should advise on how best to create 3D assets for this. Are you capable of doing this or will I need to do it separately myself?

### Decided

All assets are generated procedurally in code — merged Three.js primitives with
vertex colours and a 3-band toon ramp. No modelling tool, no .glb files, no
rigs: wing flap and body bank are transform maths, not baked animation. This
suits the chunky reference art and keeps everything parameter-tweakable. If a
bespoke hero model is ever wanted, that's the one thing that needs a human
artist.

## Levels

Start off as queen bee and you start the hive by collecting pollen from flowers . You have to collect certain flowers white rose, yellow flower and orange flower.

Once you finish making the beehive you become a worker bee and find pollen for the beehive. Inside the beehive is like a big round dome. You make yellow hexagons from the pollen you collected. It takes five pieces of pollen to make a yellow hexagon . Ones you have made the yellow hexagon you can add it to the hives walls where there are empty places for the hexagons.
Once you have made 20 yellow hexagons you move onto challenge two. (Reduced from 50 — at 5 pollen each that was 250 fetch trips.)

In challenge two you have to take care of a baby bee. Your baby bee needs different pollen every day after 5 days the baby bee is all grown up.

A day is 12 minutes

### Built as (revised in conversation)

Level 2 merges the dome and the baby-care ideas into one room: the queen is
stationary on a royal platform with a ring of six babies around her, and the
worker (the player) ferries food to them. Honeycomb lines the dome wall as
decor rather than something you place by hand.

Feeding is colour-matched — each hungry baby's floating bubble names the pollen
it wants, and there are three pollen stores against the wall. Three feeds grows
one baby up; six grown finishes the level. The 12-minute day is not used here;
babies get hungry on a short real-time cooldown instead, so the level plays in
one sitting. The day system is still open for a later level.

In challenge three a wasp comes to the hive. you are faster than the wasp. You have to fly in front of it and run away. After 30 seconds the wasp goes away and you can go back to your hive.

### Built as (level 3)

Built as written, with one rule added to make it a game rather than a wait: the
30 seconds only counts down **while the wasp is actually chasing you**. It locks
on when you cross its field of view — that's the "fly in front of it" — and
gives up if you get too far away, so you have to hold its attention without
letting it clip you. Getting clipped knocks you back and sends it home to the
hive; there's no losing, you just have to bait it again. The camera pulls back
to double distance during a chase so you can see it behind you.
