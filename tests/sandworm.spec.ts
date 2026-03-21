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

async function removeFinger(page: any, fingerIdx: number, totalFingers: number, positions: { x: number; y: number }[]) {
  await page.evaluate(({ idx, total, pos }: { idx: number; total: number; pos: { x: number; y: number }[] }) => {
    const canvas = document.getElementById('game')!;

    const remaining: Touch[] = [];
    for (let i = 0; i < total; i++) {
      if (i === idx) continue;
      remaining.push(new Touch({
        identifier: i,
        target: canvas,
        clientX: pos[i].x,
        clientY: pos[i].y,
        pageX: pos[i].x,
        pageY: pos[i].y,
      }));
    }

    const removedTouch = new Touch({
      identifier: idx,
      target: canvas,
      clientX: pos[idx].x,
      clientY: pos[idx].y,
      pageX: pos[idx].x,
      pageY: pos[idx].y,
    });

    canvas.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: remaining,
      changedTouches: [removedTouch],
      targetTouches: remaining,
    }));
  }, { idx: fingerIdx, total: totalFingers, pos: positions });
}

async function waitForState(page: any, targetState: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === targetState) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`Timed out waiting for state: ${targetState}`);
}

function forceSandworm(page: any) {
  return page.evaluate(() => {
    const game = (window as any).__chwazam;
    (game as any).selectVictoryEffect = () => 'SANDWORM';
  });
}

test('Sandworm: full animation runs to WINNER with 2 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  await placeFingers(page, 2);
  await waitForState(page, 'SANDWORM', 15000);

  const phase = await page.evaluate(() => (window as any).__chwazam?.sandwormAnimation?.phase);
  expect(phase).toBe('SAND_IN');

  await waitForState(page, 'WINNER', 20000);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const alive = game.towers.filter((t: any) => t.alive);
    return {
      state: game.state,
      chosenWinnerId: game.chosenWinnerId,
      actualWinnerId: alive.length === 1 ? alive[0].id : -1,
      aliveTowers: alive.length,
    };
  });

  expect(result.state).toBe('WINNER');
  expect(result.aliveTowers).toBe(1);
  expect(result.actualWinnerId).toBe(result.chosenWinnerId);
});

test('Sandworm: full animation runs to WINNER with 5 fingers', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  await placeFingers(page, 5);
  await waitForState(page, 'SANDWORM', 15000);
  await waitForState(page, 'WINNER', 30000);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const alive = game.towers.filter((t: any) => t.alive);
    return {
      aliveTowers: alive.length,
      actualWinnerId: alive.length === 1 ? alive[0].id : -1,
      chosenWinnerId: game.chosenWinnerId,
    };
  });

  expect(result.aliveTowers).toBe(1);
  expect(result.actualWinnerId).toBe(result.chosenWinnerId);
});

test('Sandworm: phases progress SAND_IN → SWALLOWING → SAND_OUT → WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  await placeFingers(page, 3);
  await waitForState(page, 'SANDWORM', 15000);

  const initialPhase = await page.evaluate(() => (window as any).__chwazam?.sandwormAnimation?.phase);
  expect(initialPhase).toBe('SAND_IN');

  const waitForPhase = async (phase: string, timeoutMs = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = await page.evaluate(() => (window as any).__chwazam?.sandwormAnimation?.phase);
      if (p === phase) return;
      await page.waitForTimeout(50);
    }
    throw new Error(`Timed out waiting for sandworm phase: ${phase}`);
  };

  await waitForPhase('SWALLOWING', 5000);
  await waitForPhase('SAND_OUT', 10000);
  await waitForState(page, 'WINNER', 10000);
});

test('Sandworm: finger removal swallows all instantly then fades sand', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  const positions = await placeFingers(page, 4);
  await waitForState(page, 'SANDWORM', 15000);

  // Wait for SWALLOWING to start
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const p = await page.evaluate(() => (window as any).__chwazam?.sandwormAnimation?.phase);
    if (p === 'SWALLOWING') break;
    await page.waitForTimeout(50);
  }

  // Remove finger — should swallow all instantly, go to SAND_OUT
  await removeFinger(page, 1, 4, positions);
  await page.waitForTimeout(100);

  const afterRemoval = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const ba = game.sandwormAnimation;
    const alive = game.towers.filter((t: any) => t.alive);
    return {
      state: game.state,
      phase: ba?.phase,
      aliveTowers: alive.length,
    };
  });

  // Should still be in SANDWORM state (SAND_OUT phase), not WINNER yet
  expect(afterRemoval.state).toBe('SANDWORM');
  expect(afterRemoval.phase).toBe('SAND_OUT');
  // Only winner alive
  expect(afterRemoval.aliveTowers).toBe(1);

  // Wait for sand to fade and reach WINNER
  await waitForState(page, 'WINNER', 10000);
});

test('Sandworm: enemies swallowed one at a time', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  await placeFingers(page, 3);
  await waitForState(page, 'SANDWORM', 15000);

  // Wait for SWALLOWING phase
  const start = Date.now();
  while (Date.now() - start < 5000) {
    const p = await page.evaluate(() => (window as any).__chwazam?.sandwormAnimation?.phase);
    if (p === 'SWALLOWING') break;
    await page.waitForTimeout(50);
  }

  // Track alive count over time — should decrease one by one
  const aliveCounts: number[] = [];
  const trackStart = Date.now();
  while (Date.now() - trackStart < 5000) {
    const count = await page.evaluate(() => {
      const game = (window as any).__chwazam;
      return game.towers.filter((t: any) => t.alive).length;
    });
    if (aliveCounts.length === 0 || aliveCounts[aliveCounts.length - 1] !== count) {
      aliveCounts.push(count);
    }
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === 'WINNER') break;
    await page.waitForTimeout(100);
  }

  // Should have seen decreasing alive counts (e.g., [3, 2, 1])
  expect(aliveCounts.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < aliveCounts.length; i++) {
    expect(aliveCounts[i]).toBeLessThan(aliveCounts[i - 1]);
  }
});

test('Sandworm: winner tower stays alive throughout', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceSandworm(page);

  await placeFingers(page, 3);
  await waitForState(page, 'SANDWORM', 15000);

  const winnerId = await page.evaluate(() => (window as any).__chwazam?.chosenWinnerId);

  await waitForState(page, 'WINNER', 20000);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const winner = game.towers.find((t: any) => t.id === game.chosenWinnerId);
    return {
      winnerAlive: winner?.alive,
      winnerInvincible: winner?.invincible,
    };
  });

  expect(result.winnerAlive).toBe(true);
  expect(result.winnerInvincible).toBe(true);
});
