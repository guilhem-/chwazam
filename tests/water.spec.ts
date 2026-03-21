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

function forceWater(page: any) {
  return page.evaluate(() => {
    const game = (window as any).__chwazam;
    (game as any).selectVictoryEffect = () => 'WATER';
  });
}

test('Water: full animation runs to WINNER with 2 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  await placeFingers(page, 2);
  await waitForState(page, 'WATER', 15000);

  const phase = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.phase);
  expect(phase).toBe('RISING');

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

test('Water: full animation runs to WINNER with 5 fingers', async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  await placeFingers(page, 5);
  await waitForState(page, 'WATER', 15000);
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

test('Water: phases progress RISING → SETTLE → WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  await placeFingers(page, 3);
  await waitForState(page, 'WATER', 15000);

  const initialPhase = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.phase);
  expect(initialPhase).toBe('RISING');

  const start = Date.now();
  while (Date.now() - start < 15000) {
    const p = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.phase);
    if (p === 'SETTLE') break;
    await page.waitForTimeout(100);
  }

  const settlePhase = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.phase);
  expect(settlePhase).toBe('SETTLE');

  await waitForState(page, 'WINNER', 10000);
});

test('Water: finger removal during animation skips to WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  const positions = await placeFingers(page, 3);
  await waitForState(page, 'WATER', 15000);

  await page.waitForTimeout(500);

  await removeFinger(page, 1, 3, positions);
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const alive = game.towers.filter((t: any) => t.alive);
    return {
      state: game.state,
      aliveTowers: alive.length,
      chosenWinnerId: game.chosenWinnerId,
      actualWinnerId: alive.length === 1 ? alive[0].id : -1,
    };
  });

  expect(result.state).toBe('WINNER');
  expect(result.aliveTowers).toBe(1);
  expect(result.actualWinnerId).toBe(result.chosenWinnerId);
});

test('Water: flood closes in over time', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  await placeFingers(page, 2);
  await waitForState(page, 'WATER', 15000);

  const radius1 = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.dryRadius);

  await page.waitForTimeout(1500);

  const radius2 = await page.evaluate(() => (window as any).__chwazam?.waterAnimation?.dryRadius);

  // Dry radius should shrink as water floods inward
  expect(radius2).toBeLessThan(radius1);

  await waitForState(page, 'WINNER', 20000);
});

test('Water: winner tower stays alive throughout', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceWater(page);

  await placeFingers(page, 3);
  await waitForState(page, 'WATER', 15000);

  await waitForState(page, 'WINNER', 20000);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const winner = game.towers.find((t: any) => t.id === game.chosenWinnerId);
    const enemies = game.towers.filter((t: any) => t.id !== game.chosenWinnerId);
    return {
      winnerAlive: winner?.alive,
      enemiesAlive: enemies.filter((t: any) => t.alive).length,
    };
  });

  expect(result.winnerAlive).toBe(true);
  expect(result.enemiesAlive).toBe(0);
});
