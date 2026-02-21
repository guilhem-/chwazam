import { Game } from './game';
import { initI18n } from './i18n';

initI18n();

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Expose game state for Playwright tests
(window as any).__chwazam = game;

let lastTime = 0;
let accumulator = 0;
const FIXED_DT = 1 / 60;

function loop(time: number) {
  const frameDt = Math.min(0.05, (time - lastTime) / 1000);
  lastTime = time;
  accumulator += frameDt;

  while (accumulator >= FIXED_DT) {
    game.update(FIXED_DT);
    accumulator -= FIXED_DT;
  }

  game.draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame((time) => {
  lastTime = time;
  requestAnimationFrame(loop);
});
