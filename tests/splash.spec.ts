import { test, expect } from '@playwright/test';

test('Splash screen shows on launch with Chwazam text and arrows', async ({ page }) => {
  await page.goto('/');

  // Should start in SPLASH state
  await page.waitForTimeout(200);
  const initialState = await page.evaluate(() => (window as any).__chwazam?.state);
  expect(initialState).toBe('SPLASH');

  // Verify splash arrows are populated
  const arrowCount = await page.evaluate(() => (window as any).__chwazam?.splashArrows?.length);
  expect(arrowCount).toBeGreaterThan(50);

  // Wait for auto-transition to WAITING (splash duration = 2s)
  await page.waitForTimeout(2500);
  const afterState = await page.evaluate(() => (window as any).__chwazam?.state);
  expect(afterState).toBe('WAITING');
});

test('Splash screen can be skipped by touch', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(200);

  const state1 = await page.evaluate(() => (window as any).__chwazam?.state);
  expect(state1).toBe('SPLASH');

  // Touch to skip
  await page.evaluate(() => {
    const canvas = document.getElementById('game')!;
    const touch = new Touch({
      identifier: 0,
      target: canvas,
      clientX: 200,
      clientY: 200,
      pageX: 200,
      pageY: 200,
    });
    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      cancelable: true,
      touches: [touch],
      changedTouches: [touch],
      targetTouches: [touch],
    }));
  });

  await page.waitForTimeout(100);
  const state2 = await page.evaluate(() => (window as any).__chwazam?.state);
  // Should have moved past SPLASH (to PLACING since a finger was placed)
  expect(state2).not.toBe('SPLASH');
});
