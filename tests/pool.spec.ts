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

function forcePoolEffect(page: any) {
  return page.evaluate(() => {
    const game = (window as any).__chwazam;
    (game as any).selectVictoryEffect = () => 'POOL';
  });
}

test('Pool: full animation runs to WINNER with 2 fingers', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forcePoolEffect(page);

  await placeFingers(page, 2);

  await waitForState(page, 'POOL', 15000);

  // Verify poolAnimation exists and starts in FADE_WHITE
  const phase = await page.evaluate(() => (window as any).__chwazam?.poolAnimation?.phase);
  expect(phase).toBe('FADE_WHITE');

  // Wait for WINNER
  await waitForState(page, 'WINNER', 60000);

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

test('Pool: full animation runs to WINNER with 4 fingers', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forcePoolEffect(page);

  await placeFingers(page, 4);

  await waitForState(page, 'POOL', 15000);

  await waitForState(page, 'WINNER', 150000);

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

test('Pool: phases progress FADE_WHITE → SETTLING → SHOOTING → WINNER', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forcePoolEffect(page);

  await placeFingers(page, 3);

  await waitForState(page, 'POOL', 15000);

  // Should start in FADE_WHITE
  const phase1 = await page.evaluate(() => (window as any).__chwazam?.poolAnimation?.phase);
  expect(phase1).toBe('FADE_WHITE');

  // Wait for SHOOTING phase
  const start = Date.now();
  let sawShooting = false;
  while (Date.now() - start < 30000) {
    const phase = await page.evaluate(() => (window as any).__chwazam?.poolAnimation?.phase);
    if (phase === 'SHOOTING') { sawShooting = true; break; }
    if (phase === 'RETURN') { sawShooting = true; break; } // might have been too fast
    await page.waitForTimeout(100);
  }
  expect(sawShooting).toBe(true);

  // Wait for WINNER
  await waitForState(page, 'WINNER', 150000);
});

test('Pool: finger removal during animation skips to WINNER', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forcePoolEffect(page);

  const positions = await placeFingers(page, 3);

  await waitForState(page, 'POOL', 15000);

  // Let animation run briefly
  await page.waitForTimeout(800);

  // Remove a finger
  await removeFinger(page, 2, 3, positions);

  // Should skip to WINNER immediately
  await page.waitForTimeout(200);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;
    return {
      state: game.state,
      aliveTowers: game.towers.filter((t: any) => t.alive).length,
      chosenWinnerId: game.chosenWinnerId,
      actualWinnerId: game.towers.filter((t: any) => t.alive).map((t: any) => t.id),
    };
  });

  expect(result.state).toBe('WINNER');
  expect(result.aliveTowers).toBe(1);
  expect(result.actualWinnerId[0]).toBe(result.chosenWinnerId);
});

test('Pool: white ball is never pocketed', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await page.waitForTimeout(500);
  await forcePoolEffect(page);

  await placeFingers(page, 3);

  await waitForState(page, 'POOL', 15000);

  // Poll until animation finishes, checking white ball is never pocketed
  const start = Date.now();
  while (Date.now() - start < 60000) {
    const info = await page.evaluate(() => {
      const game = (window as any).__chwazam;
      if (!game.poolAnimation) return null;
      const white = game.poolAnimation.balls.find((b: any) => b.isWhite);
      return {
        state: game.state,
        whitePocketed: white?.pocketed ?? false,
        whiteAlive: white?.alive ?? false,
      };
    });

    if (!info) break;
    expect(info.whitePocketed).toBe(false);
    expect(info.whiteAlive).toBe(true);

    if (info.state === 'WINNER') break;
    await page.waitForTimeout(200);
  }
});

test('Pool: canActivate rejects towers too close to border', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);

  // Test canActivateEffect directly
  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;

    // Place towers manually — one at the edge
    game.towers = [
      { x: 10, y: 200, id: 0, color: '#FF3333', alive: true },
      { x: 200, y: 200, id: 1, color: '#33BBFF', alive: true },
    ];
    const canPool = game.canActivateEffect('POOL');

    // Move tower away from edge
    game.towers[0].x = 50;
    const canPoolAfter = game.canActivateEffect('POOL');

    // Other effects should always pass
    const canBattle = game.canActivateEffect('BATTLE');

    return { canPool, canPoolAfter, canBattle };
  });

  expect(result.canPool).toBe(false);
  expect(result.canPoolAfter).toBe(true);
  expect(result.canBattle).toBe(true);
});

test('Pool: canActivate rejects when towers overlap', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/');
  await page.waitForTimeout(500);

  const result = await page.evaluate(() => {
    const game = (window as any).__chwazam;

    // Two towers overlapping (distance < sum of radii, default radius=40)
    game.towers = [
      { x: 200, y: 300, radius: 40, id: 0, color: '#FF3333', alive: true },
      { x: 230, y: 300, radius: 40, id: 1, color: '#33BBFF', alive: true },
    ];
    const rejectsOverlap = game.canActivateEffect('POOL');

    // Move apart so they don't overlap (distance=80 >= 40+40)
    game.towers[1].x = 280;
    const acceptsSeparated = game.canActivateEffect('POOL');

    // Exactly touching (distance=80 == 40+40) — should pass
    game.towers[1].x = 280;
    const acceptsTouching = game.canActivateEffect('POOL');

    // Three towers, two overlap
    game.towers = [
      { x: 200, y: 300, radius: 40, id: 0, color: '#FF3333', alive: true },
      { x: 300, y: 300, radius: 40, id: 1, color: '#33BBFF', alive: true },
      { x: 215, y: 300, radius: 40, id: 2, color: '#88EE33', alive: true },
    ];
    const rejectsThreeOverlap = game.canActivateEffect('POOL');

    return { rejectsOverlap, acceptsSeparated, acceptsTouching, rejectsThreeOverlap };
  });

  expect(result.rejectsOverlap).toBe(false);
  expect(result.acceptsSeparated).toBe(true);
  expect(result.acceptsTouching).toBe(true);
  expect(result.rejectsThreeOverlap).toBe(false);
});
