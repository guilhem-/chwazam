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
    const touches = positions.map((p, i) => new Touch({
      identifier: i, target: canvas,
      clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y,
    }));
    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches, changedTouches: touches, targetTouches: touches,
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
        identifier: i, target: canvas,
        clientX: pos[i].x, clientY: pos[i].y, pageX: pos[i].x, pageY: pos[i].y,
      }));
    }
    const removedTouch = new Touch({
      identifier: idx, target: canvas,
      clientX: pos[idx].x, clientY: pos[idx].y, pageX: pos[idx].x, pageY: pos[idx].y,
    });
    canvas.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true,
      touches: remaining, changedTouches: [removedTouch], targetTouches: remaining,
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

function forceLightning(page: any) {
  return page.evaluate(() => {
    (window as any).__chwazam.selectVictoryEffect = () => 'LIGHTNING';
  });
}

test('Lightning: full animation runs to WINNER with 2 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  await placeFingers(page, 2);
  await waitForState(page, 'LIGHTNING', 15000);

  const phase = await page.evaluate(() => (window as any).__chwazam?.lightningAnimation?.phase);
  expect(phase).toBe('STORM');

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

test('Lightning: full animation runs to WINNER with 5 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  await placeFingers(page, 5);
  await waitForState(page, 'LIGHTNING', 15000);
  await waitForState(page, 'WINNER', 20000);

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

test('Lightning: phases progress STORM → SETTLE → WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  await placeFingers(page, 2);
  await waitForState(page, 'LIGHTNING', 15000);

  const initialPhase = await page.evaluate(() => (window as any).__chwazam?.lightningAnimation?.phase);
  expect(initialPhase).toBe('STORM');

  const start = Date.now();
  while (Date.now() - start < 10000) {
    const p = await page.evaluate(() => (window as any).__chwazam?.lightningAnimation?.phase);
    if (p === 'SETTLE') break;
    await page.waitForTimeout(100);
  }
  const settlePhase = await page.evaluate(() => (window as any).__chwazam?.lightningAnimation?.phase);
  expect(settlePhase).toBe('SETTLE');

  await waitForState(page, 'WINNER', 10000);
});

test('Lightning: finger removal skips to WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  const positions = await placeFingers(page, 3);
  await waitForState(page, 'LIGHTNING', 15000);
  await page.waitForTimeout(300);

  await removeFinger(page, 1, 3, positions);
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const alive = game.towers.filter((t: any) => t.alive);
    return {
      state: game.state,
      aliveTowers: alive.length,
      actualWinnerId: alive.length === 1 ? alive[0].id : -1,
      chosenWinnerId: game.chosenWinnerId,
    };
  });

  expect(result.state).toBe('WINNER');
  expect(result.aliveTowers).toBe(1);
  expect(result.actualWinnerId).toBe(result.chosenWinnerId);
});

test('Lightning: enemies struck one per second', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  await placeFingers(page, 3);
  await waitForState(page, 'LIGHTNING', 15000);

  // Track alive count — should decrease one at a time
  const aliveCounts: number[] = [];
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const count = await page.evaluate(() => (window as any).__chwazam.towers.filter((t: any) => t.alive).length);
    if (aliveCounts.length === 0 || aliveCounts[aliveCounts.length - 1] !== count) {
      aliveCounts.push(count);
    }
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === 'WINNER') break;
    await page.waitForTimeout(200);
  }

  expect(aliveCounts.length).toBeGreaterThanOrEqual(2);
  for (let i = 1; i < aliveCounts.length; i++) {
    expect(aliveCounts[i]).toBeLessThan(aliveCounts[i - 1]);
  }
});

test('Lightning: winner stays alive throughout', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceLightning(page);

  await placeFingers(page, 3);
  await waitForState(page, 'LIGHTNING', 15000);
  await waitForState(page, 'WINNER', 20000);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const winner = game.towers.find((t: any) => t.id === game.chosenWinnerId);
    return { winnerAlive: winner?.alive, winnerInvincible: winner?.invincible };
  });

  expect(result.winnerAlive).toBe(true);
  expect(result.winnerInvincible).toBe(true);
});
