import './style.css';
import { Game } from './game/Game';

const canvas = document.querySelector('#view');
const gate = document.querySelector('#gate');
if (!(canvas instanceof HTMLCanvasElement) || !(gate instanceof HTMLElement)) {
  throw new Error('Juno: missing canvas or gate');
}

const game = await Game.create(canvas);
game.startLoop();

const begin = (e: Event) => {
  e.preventDefault();
  gate.setAttribute('hidden', '');
  gate.removeEventListener('pointerdown', begin);
  gate.removeEventListener('touchstart', begin);
  gate.removeEventListener('click', begin);
  void game.unlock();
};
gate.addEventListener('pointerdown', begin);
gate.addEventListener('touchstart', begin, { passive: false });
gate.addEventListener('click', begin);
