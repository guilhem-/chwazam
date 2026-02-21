import { test, expect } from '@playwright/test';

test('100 battles: W-marked tower always wins', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(500);

  const results = await page.evaluate(async () => {
    const game = (window as any).__chwazam;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 80;

    let wWins = 0;
    let wLosses = 0;
    let seedNotFound = 0;
    let diverged = 0;
    const details: string[] = [];

    for (let run = 0; run < 100; run++) {
      game.reset();
      game.elapsed = 0;

      const positions: { x: number; y: number }[] = [];
      for (let i = 0; i < 3; i++) {
        positions.push({
          x: margin + Math.random() * (w - margin * 2),
          y: margin + 100 + Math.random() * (h - margin * 2 - 100),
        });
      }

      for (let i = 0; i < 3; i++) {
        const fakeId = 90000 + run * 10 + i;
        game.addTower(fakeId, positions[i].x, positions[i].y);
      }

      game.state = 'PLACING';
      game.countdownStart = game.elapsed;
      game.startBattle();

      const chosenId = game.chosenWinnerId;
      const seed = game.winningSeed;

      const dt = 1 / 60;
      let ticks = 0;
      const maxTicks = 5400;

      while (game.state === 'BATTLE' && ticks < maxTicks) {
        game.update(dt);
        ticks++;
      }

      if (game.state === 'WINNER') {
        const alive = game.towers.filter((t: any) => t.alive);
        if (alive.length === 1 && alive[0].id === chosenId) {
          wWins++;
        } else {
          wLosses++;
          if (seed === -1) {
            seedNotFound++;
            details.push(`Run ${run}: SEED NOT FOUND, chosen=${chosenId}, actual=${alive[0]?.id}`);
          } else {
            diverged++;
            details.push(`Run ${run}: DIVERGED seed=${seed}, chosen=${chosenId}, actual=${alive[0]?.id}`);
          }
        }
      } else {
        wLosses++;
        details.push(`Run ${run}: never reached WINNER (state=${game.state}), seed=${seed}`);
      }
    }

    return { wWins, wLosses, seedNotFound, diverged, details };
  });

  console.log(`W wins: ${results.wWins}/100, losses: ${results.wLosses} (seedNotFound=${results.seedNotFound}, diverged=${results.diverged})`);
  if (results.details.length > 0) {
    console.log('Failures:\n' + results.details.join('\n'));
  }

  expect(results.wWins).toBe(100);
});
