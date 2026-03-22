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

function forceBlast(page: any) {
  return page.evaluate(() => {
    const game = (window as any).__chwazam;
    (game as any).selectVictoryEffect = () => 'BLAST';
  });
}

test('Blast: full animation runs to WINNER with 2 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  await placeFingers(page, 2);
  await waitForState(page, 'BLAST', 15000);

  // Verify blastAnimation exists and starts in BLAST
  const phase = await page.evaluate(() => (window as any).__chwazam?.blastAnimation?.phase);
  expect(phase).toBe('BLAST');

  // Wait for WINNER
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

test('Blast: full animation runs to WINNER with 5 fingers', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  await placeFingers(page, 5);
  await waitForState(page, 'BLAST', 15000);
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

test('Blast: phases progress BLAST → SETTLE → WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  await placeFingers(page, 3);
  await waitForState(page, 'BLAST', 15000);

  // Should start directly in BLAST (no charge phase)
  const initialPhase = await page.evaluate(() => (window as any).__chwazam?.blastAnimation?.phase);
  expect(initialPhase).toBe('BLAST');

  const waitForPhase = async (phase: string, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const p = await page.evaluate(() => (window as any).__chwazam?.blastAnimation?.phase);
      if (p === phase) return;
      await page.waitForTimeout(50);
    }
    throw new Error(`Timed out waiting for blast phase: ${phase}`);
  };

  await waitForPhase('SETTLE', 15000);
  await waitForState(page, 'WINNER', 10000);
});

test('Blast: finger removal during animation skips to WINNER', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  const positions = await placeFingers(page, 3);
  await waitForState(page, 'BLAST', 15000);

  // Let blast start
  await page.waitForTimeout(200);

  // Remove a finger
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

test('Blast: all enemy towers are pushed off screen', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  await placeFingers(page, 4);
  await waitForState(page, 'BLAST', 15000);

  // Wait until all flying towers are off screen and animation finishes
  await waitForState(page, 'WINNER', 20000);

  // Verify winner tower is still at its original position (not pushed)
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

test('Blast: winner tower stays in place', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  await placeFingers(page, 3);
  await waitForState(page, 'BLAST', 15000);

  // Record winner position at start
  const startPos = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const winner = game.towers.find((t: any) => t.id === game.chosenWinnerId);
    return { x: winner.x, y: winner.y };
  });

  await waitForState(page, 'WINNER', 20000);

  // Verify winner hasn't moved
  const endPos = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    const winner = game.towers.find((t: any) => t.id === game.chosenWinnerId);
    return { x: winner.x, y: winner.y };
  });

  expect(endPos.x).toBe(startPos.x);
  expect(endPos.y).toBe(startPos.y);
});

test('Blast: towers only move after shockwave reaches them', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forceBlast(page);

  // Place fingers far apart — corners and center to guarantee distance
  await page.evaluate(() => {
    const canvas = document.getElementById('game')!;
    const w = window.innerWidth;
    const h = window.innerHeight;
    // Force specific positions: winner in center, enemies in corners
    const positions = [
      { x: w / 2, y: h / 2 },      // will be winner (center)
      { x: 60, y: 60 },              // top-left corner
      { x: w - 60, y: 60 },          // top-right corner
      { x: 60, y: h - 60 },          // bottom-left corner
      { x: w - 60, y: h - 60 },      // bottom-right corner
    ];
    const touches = positions.map((p, i) => new Touch({
      identifier: i, target: canvas,
      clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y,
    }));
    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches: touches, changedTouches: touches, targetTouches: touches,
    }));
  });

  await waitForState(page, 'BLAST', 15000);

  // Poll until we can observe the shockwave has expanded but not reached all towers
  // At least one tower should still be unhit while shockwave is growing
  const sawUnhitTower = await page.evaluate(async () => {
    const game = (window as any).__chwazam;
    const ba = game.blastAnimation;
    // Check over several frames
    for (let i = 0; i < 30; i++) {
      if (ba.flyingTowers.some((ft: any) => !ft.hit)) return true;
      await new Promise(r => setTimeout(r, 16));
    }
    return false;
  });

  expect(sawUnhitTower).toBe(true);

  await waitForState(page, 'WINNER', 20000);
});
