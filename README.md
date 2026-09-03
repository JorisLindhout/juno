# Juno

Fullscreen ambient ASMR toy: convex shapes in a shallow 3D space. Poke them (mouse or finger), tilt the device, listen to synthesized hits. No score.

## Run

```bash
npm install
npm run dev
```

Then open [http://localhost:5175/](http://localhost:5175/) on desktop, or the Network URL on your phone (same Wi-Fi). The port is pinned to **5175**. Tap once to unlock audio and gyroscope.

```bash
npm run build
npm run preview
```

## Controls

- **Mouse:** a small marble follows the cursor while it is over the canvas. A ray from the camera picks the front-most shape under the pointer; if nothing is there, the marble sits at the front of the box.
- **Touch:** the marble exists only while a finger is down (up to two fingers), with the same depth follow.
- **Gyro:** gravity is the phone’s real down vector. Held normally, heavy shapes recede into the box; flip the phone upside down and they fall onto the screen. Shake shoves the whole field. iOS asks for permission on the first tap. Without a gyro, the camera still peeks with the pointer (and a slow idle) so depth reads.

## World

The volume is a box: shapes bounce off all six sides. Held upright, gravity points into the box (away from you); inverted, the screen is the floor. Shapes ease in and out when they appear or vanish. After a merge or a death the population refills to eight.

Collisions roll one action from averaged per-shape weights: bounce, merge, or vertex-loss. Pile-ups play a single hit from the most dominant shape (oldest, plus merge generation).

Depth is visible as size, fog, light falloff, and slightly dimmer/more transparent shapes further back. There is no drawn floor or box outline.

## Sound

Web Audio one-shot hits, retuned per shape. Merge generation picks the palette: fresh shapes (rim, hat, bell), first-generation merges (wood, tom, cowbell), older lineage (thud, kick, darker tom). Deeper hits are quieter and pick up a short slap-echo. Voices are capped (6 on mobile, 8 on desktop) so pile-ups stay cheap.

## Stack

Vite, TypeScript, vanilla Three.js, Rapier 3D (`@dimforge/rapier3d-compat`).

## TODO

- **Generation look.** Lineage already feeds audio dominance and hit palettes. Later it can also make older shapes look heavier or duller.
- Optional geometric hint: if a contact point sits near a vertex, nudge `wVertexLoss` before the collision roll (v1 uses averaged probabilities only).
