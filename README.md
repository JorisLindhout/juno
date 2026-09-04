# Juno

Non-terminating particle field. Convex polytopes, generational merge, vertex ablation, spawn-weighted replenishment. Audio palette indexed by generation. Visual and auditory state keep changing.

## Run

```bash
npm install
npm run dev
```

Then open [http://localhost:5175/](http://localhost:5175/) on desktop, or the Network URL on your phone (same Wi-Fi). The port is pinned to **5175**. Tap the title once to unlock audio and gyroscope.

On a phone, Add to Home Screen runs it fullscreen (web app manifest + icons).

```bash
npm run build
npm run preview
```

## Controls

- **Mouse:** a small marble follows the cursor while it is over the canvas. A ray from the camera picks the front-most shape under the pointer; if nothing is there, the marble sits at the front of the box.
- **Touch:** the marble exists only while a finger is down (up to two fingers), with the same depth follow.
- **Gyro:** a phone at rest — held still or lying flat — matches desktop: shapes keep drifting, heavy ones recede into the box, light ones float toward you. A real tilt pours the field; a hard shake shoves every piece the same way. Hold it inverted (screen toward the ground) and the screen is the floor. iOS asks for motion and orientation on the first tap.
- **Camera:** always fills the window. It peeks with the pointer and a slow idle so depth reads without a gyro; a pour also leans the view. Rotating the phone refits the box and keeps shapes inside.

## World

The volume is a box: shapes bounce off all six sides. There is no drawn floor or outline. Depth shows up as size, fog, light falloff, and slightly dimmer, more transparent shapes further back. New shapes ease in when they appear. A merge keeps the dominant parent; the others slide into it and vanish. A tetra that would lose a vertex collapses inward instead of fading.

Each shape has its own gravity scale (heavy vs helium), bounce, density, and action weights. At rest, gravity points into the box (away from you). Inverted, it points at the screen.

The field starts at eight shapes and then wanders. Merges and tetra deaths thin it; it only refills automatically if the count would drop below four. Each shape also has a spawn weight (`wSpawn`, 0–1, independent of the collision roll). On a bounce or wall hit, the most fertile shape in that contact may ease in a new one nearby, at most once every half-second, up to twelve on phones and twenty on desktop. Merges average parent `wSpawn`, so a fertile mix tends to fill the box and a barren mix stays sparse.

Collisions roll one action from averaged per-shape weights: bounce, merge, or vertex-loss. Generation can veto merge (see below). Spheres skip vertex-loss; a tetra that loses a vertex collapses. Pile-ups play a single hit from the most dominant shape (age in seconds, plus a boost for generation 1 or 2).

## Generation

Generation is one of three states. Spawns start at **0**. A merge’s child is one step older than the oldest parent, and never past 2. It keeps the oldest parent’s birth time.

- **0 — fresh.** Bright, quick, a short glow on appear. Likely to merge. Hits: rim, hat, bell.
- **1 — first merge.** Mid brightness and speed, a faint appear glow. Hits: wood, tom, cowbell.
- **2 — elder.** Darker, more matte, slower. No appear glow. Hits: thud, kick, darker tom. Merge weight leans toward bounce.

Two elders never merge with each other: if every shape in a contact is generation 2, a merge roll becomes a bounce. An elder can still merge with a generation 0 or 1 shape, so the box keeps dark pieces and bright sparks instead of blending into one age. A young shape in a pile-up can still fold elders together; the child stays generation 2. The surviving body is the most dominant parent: hull, color, and size ease toward the mix while the others slide in.

After every spawn and merge, color, damping, speed, and merge-vs-bounce are restyled to that state. Long-lived elders are old in time, not gen 14.

## Sound

Web Audio one-shot hits, retuned per shape. Generation band picks the palette (see above). Size, color, and speed still retune pitch, brightness, and loudness inside that family. Deeper hits are quieter and pick up a short slap-echo. Bounce uses the current hit; merge is lower and longer; vertex-loss is a short dry click. Marble contacts are close and dry, walls a bit more boxed. Voices are capped (6 on mobile, 8 on desktop) so pile-ups stay cheap.

## Stack

Vite, TypeScript, vanilla Three.js, Rapier 3D (`@dimforge/rapier3d-compat`).
