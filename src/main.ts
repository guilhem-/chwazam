import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);

// Expose game state for Playwright tests
(window as any).__chwazam = game;

let lastTime = 0;

function loop(time: number) {
  const dt = Math.min(0.05, (time - lastTime) / 1000); // cap at 50ms to avoid spiral
  lastTime = time;

  game.update(dt);
  game.draw();

  requestAnimationFrame(loop);
}

requestAnimationFrame((time) => {
  lastTime = time;
  requestAnimationFrame(loop);
});
