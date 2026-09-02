import './style.css';
import { Game } from './game/Game';

const canvas = document.querySelector('#view');
const gate = document.querySelector('#gate');
if (!(canvas instanceof HTMLCanvasElement) || !(gate instanceof HTMLElement)) {
  throw new Error('Juno: missing canvas or gate');
}

const game = await Game.create(canvas);
game.startLoop();

gate.addEventListener(
  'pointerdown',
  (e) => {
    e.preventDefault();
    gate.setAttribute('hidden', '');
    void game.unlock();
  },
  { once: true },
);
