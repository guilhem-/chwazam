import { test, expect } from '@playwright/test';

async function placeFingers(page: any, count: number): Promise<{ x: number; y: number }[]> {
  return await page.evaluate((n: number) => {
    const canvas = document.getElementById('game')!;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const margin = 80;

    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      positions.push({
        x: margin + Math.random() * (w - margin * 2),
        y: margin + 100 + Math.random() * (h - margin * 2 - 100),
      });
    }

    const allTouches: Touch[] = [];
    for (let i = 0; i < n; i++) {
      allTouches.push(new Touch({
        identifier: i,
        target: canvas,
        clientX: positions[i].x,
        clientY: positions[i].y,
        pageX: positions[i].x,
        pageY: positions[i].y,
      }));
    }

    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: allTouches,
      changedTouches: allTouches,
      targetTouches: allTouches,
    }));

    return positions;
  }, count);
}

async function waitForState(page: any, targetState: string, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === targetState) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for state: ${targetState}`);
}

async function resetGame(page: any) {
  await page.evaluate(() => {
    const game = (window as any).__chwazam;
    game.reset();
  });
}

test('20 real browser battles: W-marked tower always wins', async ({ page }) => {
  test.setTimeout(600_000); // 10 minutes for 20 battles
  await page.goto('/');
  await page.waitForTimeout(500);

  let wWins = 0;
  let total = 0;
  const failures: string[] = [];

  for (let run = 0; run < 20; run++) {
    // Reset between rounds
    if (run > 0) {
      await resetGame(page);
      await page.waitForTimeout(300);
    }

    // Vary player count: 2, 3, 4, cycling
    const fingerCount = 2 + (run % 3);

    await placeFingers(page, fingerCount);

    // Wait for countdown → battle
    await waitForState(page, 'BATTLE', 15000);

    // Wait for winner (real battle with rendering)
    await waitForState(page, 'WINNER', 60000);

    const result = await page.evaluate(() => {
      const game = (window as any).__chwazam;
      const alive = game.towers.filter((t: any) => t.alive);
      return {
        chosenWinnerId: game.chosenWinnerId,
        actualWinnerId: alive.length === 1 ? alive[0].id : -1,
        winningSeed: game.winningSeed,
      };
    });

    total++;
    if (result.actualWinnerId === result.chosenWinnerId) {
      wWins++;
      console.log(`  Run ${run} (${fingerCount}p): OK  [${wWins}/${total}]`);
    } else {
      failures.push(
        `Run ${run} (${fingerCount}p): chosen=${result.chosenWinnerId}, actual=${result.actualWinnerId}, seed=${result.winningSeed}`
      );
      console.log(`  Run ${run} (${fingerCount}p): FAIL chosen=${result.chosenWinnerId} actual=${result.actualWinnerId} seed=${result.winningSeed}  [${wWins}/${total}]`);
      break;
    }
  }

  console.log(`\nFinal: W wins ${wWins}/${total}`);
  if (failures.length > 0) {
    console.log('Failures:\n' + failures.join('\n'));
  }

  expect(wWins).toBe(total);
});
