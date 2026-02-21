import { test, expect } from '@playwright/test';

/**
 * Places N fingers simultaneously with a single touchstart event.
 */
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

/**
 * Removes the last finger.
 */
async function removeLastFinger(page: any, fingerCount: number, positions: { x: number; y: number }[]) {
  await page.evaluate(({ count, pos }: { count: number; pos: { x: number; y: number }[] }) => {
    const canvas = document.getElementById('game')!;
    const lastIdx = count - 1;

    const remaining: Touch[] = [];
    for (let i = 0; i < lastIdx; i++) {
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
      identifier: lastIdx,
      target: canvas,
      clientX: pos[lastIdx].x,
      clientY: pos[lastIdx].y,
      pageX: pos[lastIdx].x,
      pageY: pos[lastIdx].y,
    });

    canvas.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: remaining,
      changedTouches: [removedTouch],
      targetTouches: remaining,
    }));
  }, { count: fingerCount, pos: positions });
}

async function waitForState(page: any, targetState: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === targetState) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for state: ${targetState}`);
}

for (const fingerCount of [2, 3, 4, 5]) {
  for (let run = 1; run <= 3; run++) {
    test(`${fingerCount} fingers - run ${run}: battle produces a winner`, async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(500);

      const positions = await placeFingers(page, fingerCount);

      // Wait for BATTLE
      await waitForState(page, 'BATTLE', 10000);

      // Only remove a finger when 3+ players (removing with 2 leaves 1 → PLACING, no winner)
      const willRemove = fingerCount >= 3;
      if (willRemove) {
        const removeDelay = 2000 + Math.random() * 2000;
        await page.waitForTimeout(removeDelay);
        await removeLastFinger(page, fingerCount, positions);
      }

      // Wait for WINNER (no draw)
      await waitForState(page, 'WINNER', 45000);

      const expectedTowers = willRemove ? fingerCount - 1 : fingerCount;

      const result = await page.evaluate(() => {
        const game = (window as any).__chwazam;
        return {
          state: game.state,
          totalTowers: game.towers.length,
          aliveTowers: game.towers.filter((t: any) => t.alive).length,
        };
      });

      expect(result.state).toBe('WINNER');
      expect(result.totalTowers).toBe(expectedTowers);
      expect(result.aliveTowers).toBe(1);
    });
  }
}
