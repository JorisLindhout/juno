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
- **Gyro:** while the phone is still — in your hand or lying on a table — the field is the same as desktop: shapes drift on their own. A real tilt pours them; a hard shake shoves every piece the same way; flip upside down and the glass becomes the floor. iOS asks for motion and orientation on the first tap. The canvas always fills the window; rotating the phone refits the box and keeps shapes inside. Without a gyro, the camera still peeks with the pointer (and a slow idle) so depth reads.

## World

The volume is a box: shapes bounce off all six sides. Held upright, gravity points into the box (away from you); inverted, the screen is the floor. Shapes ease in and out when they appear or vanish.

The field starts at eight shapes and then wanders. Merges and tetra deaths thin it; it only refills automatically if the count would drop below four. Each shape also has a spawn weight (`wSpawn`, 0–1, independent of the collision roll). On a bounce or wall hit, the most fertile shape in that contact may ease in a new one nearby, at most once every half-second, up to twelve on phones and twenty on desktop. Merges average parent `wSpawn`, so a fertile mix tends to fill the box and a barren mix stays sparse.

Collisions roll one action from averaged per-shape weights: bounce, merge, or vertex-loss. Pile-ups play a single hit from the most dominant shape (oldest, plus merge generation).

Depth is visible as size, fog, light falloff, and slightly dimmer/more transparent shapes further back. There is no drawn floor or box outline.

## Sound

Web Audio one-shot hits, retuned per shape. Merge generation picks the palette: fresh shapes (rim, hat, bell), first-generation merges (wood, tom, cowbell), older lineage (thud, kick, darker tom). Deeper hits are quieter and pick up a short slap-echo. Voices are capped (6 on mobile, 8 on desktop) so pile-ups stay cheap.

## Stack

Vite, TypeScript, vanilla Three.js, Rapier 3D (`@dimforge/rapier3d-compat`).

## TODO

- **Generation look.** Lineage already feeds audio dominance and hit palettes. Later it can also make older shapes look heavier or duller.
- Optional geometric hint: if a contact point sits near a vertex, nudge `wVertexLoss` before the collision roll (v1 uses averaged probabilities only).
