import { Game } from './game/Game';

const canvas = document.querySelector('#view');
const gate = document.querySelector('#gate');
if (!(canvas instanceof HTMLCanvasElement) || !(gate instanceof HTMLElement)) {
  throw new Error('Juno: missing canvas or gate');
}

const game = await Game.create(canvas);
game.startLoop();

// iOS DeviceOrientationEvent.requestPermission() only presents a dialog
// from a click (Autobahn does the same). preventDefault on touchstart
// would cancel that click and silently skip the prompt.
gate.addEventListener(
  'click',
  () => {
    gate.setAttribute('hidden', '');
    void game.unlock();
  },
  { once: true },
);
