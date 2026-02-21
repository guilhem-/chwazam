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

test('Nuke trigger: findWinningScenario returns -1 → NUKE state → all phases → WINNER', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.waitForTimeout(500);

  // Monkey-patch findWinningScenario to always return -1
  await page.evaluate(() => {
    const game = (window as any).__chwazam;
    (game as any).findWinningScenario = () => -1;
  });

  await placeFingers(page, 2);

  // Wait for NUKE state (countdown 3s → startBattle → NUKE)
  await waitForState(page, 'NUKE', 15000);

  // Verify nukeAnimation exists and starts in LAUNCH
  const nukePhase = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    return game.nukeAnimation?.phase;
  });
  expect(nukePhase).toBe('LAUNCH');

  // Wait for DESCENT
  const waitForPhase = async (phase: string, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = await page.evaluate(() => (window as any).__chwazam?.nukeAnimation?.phase);
      if (p === phase) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`Timed out waiting for nuke phase: ${phase}`);
  };

  await waitForPhase('DESCENT', 5000);
  await waitForPhase('IMPACT', 5000);
  await waitForPhase('AFTERMATH', 5000);

  // Wait for WINNER state
  await waitForState(page, 'WINNER', 10000);

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

test('Finger removal during battle: resets to COUNTDOWN, 2 towers remain with full HP', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.waitForTimeout(500);

  const positions = await placeFingers(page, 3);

  // Wait for BATTLE
  await waitForState(page, 'BATTLE', 15000);

  // Let battle run briefly
  await page.waitForTimeout(500);

  // Remove finger 2 (the last one)
  await removeFinger(page, 2, 3, positions);

  // Should be in COUNTDOWN now
  await page.waitForTimeout(100);

  const afterRemoval = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    return {
      state: game.state,
      towerCount: game.towers.length,
      towers: game.towers.map((t: any) => ({
        hp: t.hp,
        maxHp: t.maxHp,
        alive: t.alive,
        cannonCount: t.cannons.length,
      })),
    };
  });

  expect(afterRemoval.state).toBe('COUNTDOWN');
  expect(afterRemoval.towerCount).toBe(2);
  for (const t of afterRemoval.towers) {
    expect(t.hp).toBe(t.maxHp);
    expect(t.alive).toBe(true);
    expect(t.cannonCount).toBe(0);
  }

  // Wait for re-battle after 2s countdown, then WINNER
  await waitForState(page, 'WINNER', 45000);

  const finalResult = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    return {
      state: game.state,
      totalTowers: game.towers.length,
      aliveTowers: game.towers.filter((t: any) => t.alive).length,
    };
  });

  expect(finalResult.state).toBe('WINNER');
  expect(finalResult.totalTowers).toBe(2);
  expect(finalResult.aliveTowers).toBe(1);
});
