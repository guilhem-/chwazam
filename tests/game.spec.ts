import { test, expect } from '@playwright/test';

/**
 * Simulates placing N fingers on screen by dispatching TouchEvents.
 * Returns the positions used for later finger removal.
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

    const existingTouches: Touch[] = [];

    for (let i = 0; i < n; i++) {
      const touch = new Touch({
        identifier: i,
        target: canvas,
        clientX: positions[i].x,
        clientY: positions[i].y,
        pageX: positions[i].x,
        pageY: positions[i].y,
      });
      existingTouches.push(touch);

      const event = new TouchEvent('touchstart', {
        bubbles: true,
        cancelable: true,
        touches: [...existingTouches],
        changedTouches: [touch],
        targetTouches: [...existingTouches],
      });
      canvas.dispatchEvent(event);
    }

    return positions;
  }, count);
}

/**
 * Simulates removing the last finger (highest identifier).
 * This leaves N-1 fingers on screen.
 */
async function removeLastFinger(page: any, fingerCount: number, positions: { x: number; y: number }[]) {
  await page.evaluate(({ count, pos }: { count: number; pos: { x: number; y: number }[] }) => {
    const canvas = document.getElementById('game')!;
    const lastIdx = count - 1;

    // Build remaining touches (all except last)
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

    const event = new TouchEvent('touchend', {
      bubbles: true,
      cancelable: true,
      touches: remaining,
      changedTouches: [removedTouch],
      targetTouches: remaining,
    });
    canvas.dispatchEvent(event);
  }, { count: fingerCount, pos: positions });
}

/**
 * Waits for the game to reach a specific state, polling periodically.
 */
async function waitForState(page: any, targetState: string, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => (window as any).__chwazam?.state);
    if (state === targetState) return;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for state: ${targetState}`);
}

// Test each finger count scenario 5 times
for (const fingerCount of [2, 3, 4, 5]) {
  for (let run = 1; run <= 5; run++) {
    test(`${fingerCount} fingers - run ${run}: battle produces a winner`, async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(500);

      // Place fingers
      const positions = await placeFingers(page, fingerCount);

      // Simulate last player removing finger after 2 + random(2) seconds
      const removeDelay = 2000 + Math.random() * 2000;
      setTimeout(async () => {
        try {
          await removeLastFinger(page, fingerCount, positions);
        } catch {
          // page may have navigated
        }
      }, removeDelay);

      // Wait for BATTLE to start (3s countdown + buffer)
      await waitForState(page, 'BATTLE', 10000);

      // Wait for a WINNER
      await waitForState(page, 'WINNER', 45000);

      // Verify game state
      const result = await page.evaluate(() => {
        const game = (window as any).__chwazam;
        return {
          state: game.state,
          totalTowers: game.towers.length,
          aliveTowers: game.towers.filter((t: any) => t.alive).length,
        };
      });

      expect(result.state).toBe('WINNER');
      expect(result.totalTowers).toBe(fingerCount);
      expect(result.aliveTowers).toBeLessThanOrEqual(1);
    });
  }
}
