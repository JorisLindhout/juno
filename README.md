# Juno

Fullscreen ambient ASMR toy: convex shapes in a 3D pool. Poke them (mouse or finger), tilt the device, listen to synthesized hits. No score.

## Run

```bash
npm install
npm run dev
```

Then open the local URL on your phone (same Wi-Fi) or desktop. Tap once to unlock audio and gyroscope.

```bash
npm run build
npm run preview
```

## Controls

- **Mouse:** a small marble follows the cursor while it is over the canvas. It sits on the front-most shape under the pointer, or on the pool surface if the water is empty.
- **Touch:** the marble exists only while a finger is down (up to two fingers), with the same depth follow.
- **Gyro:** gravity follows the device. At rest, heavy shapes sink into the pool and light ones float toward you. Tilt pours them that way. iOS asks for permission on the first tap.

## Stack

Vite, TypeScript, vanilla Three.js, Rapier 3D (`@dimforge/rapier3d-compat`), Web Audio one-shot hits (kick / tom / rim / cowbell / hat / bell, retuned per shape). Pile-ups play the most dominant shape (oldest, plus merge generation).

## TODO

- **Generation look.** Lineage already feeds audio dominance. Later it can also make older shapes look heavier or duller.
- Optional geometric hint: if a contact point sits near a vertex, nudge `wVertexLoss` before the collision roll (v1 uses averaged probabilities only).
