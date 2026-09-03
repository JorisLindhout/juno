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

The volume is a box: shapes bounce off all six sides. There is no drawn floor or outline. Depth shows up as size, fog, light falloff, and slightly dimmer, more transparent shapes further back. Shapes ease in and out when they appear or vanish.

Each shape has its own gravity scale (heavy vs helium), bounce, density, and action weights. At rest, gravity points into the box (away from you). Inverted, it points at the screen.

Fresh shapes are brighter, quicker, and more likely to merge. Each merge ages the lineage: older shapes go darker and slower, and lean toward bounce. That is the same split the hit palettes use (rim/hat/bell → wood/tom → thud/kick).

The field starts at eight shapes and then wanders. Merges and tetra deaths thin it; it only refills automatically if the count would drop below four. Each shape also has a spawn weight (`wSpawn`, 0–1, independent of the collision roll). On a bounce or wall hit, the most fertile shape in that contact may ease in a new one nearby, at most once every half-second, up to twelve on phones and twenty on desktop. Merges average parent `wSpawn`, so a fertile mix tends to fill the box and a barren mix stays sparse.

Collisions roll one action from averaged per-shape weights: bounce, merge, or vertex-loss. Spheres skip vertex-loss; a tetra that loses a vertex vanishes. Pile-ups play a single hit from the most dominant shape (oldest, plus merge generation).

## Sound

Web Audio one-shot hits, retuned per shape. Merge generation picks the palette: fresh shapes (rim, hat, bell), first-generation merges (wood, tom, cowbell), older lineage (thud, kick, darker tom). Size, color, and speed still retune pitch, brightness, and loudness inside that family. Deeper hits are quieter and pick up a short slap-echo. Voices are capped (6 on mobile, 8 on desktop) so pile-ups stay cheap.

## Stack

Vite, TypeScript, vanilla Three.js, Rapier 3D (`@dimforge/rapier3d-compat`).
