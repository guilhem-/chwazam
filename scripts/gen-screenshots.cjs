const { chromium } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;
const STORE_DIR = path.join(__dirname, '..', 'store');

// Device form factors
const DEVICES = [
  { name: 'phone',    width: 1080, height: 1920 },
  { name: 'tablet-7', width: 1200, height: 1920 },
  { name: 'tablet-10', width: 1600, height: 2560 },
];

// Scenes to capture per device
const SCENES = [
  { id: 'splash',     effect: null,         label: 'splash screen' },
  { id: 'placing',    effect: null,         label: '4 fingers placing' },
  { id: 'battle',     effect: 'BATTLE',     label: 'tower battle' },
  { id: 'nuke',       effect: 'NUKE',       label: 'nuke explosion' },
  { id: 'blackhole',  effect: 'BLACK_HOLE', label: 'black hole' },
  { id: 'laser',      effect: 'LASER',      label: 'laser beam' },
  { id: 'winner',     effect: null,         label: 'winner celebration' },
];

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        http.get(url, res => { res.resume(); resolve(true); }).on('error', reject);
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

async function waitForState(page, targetState, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => window.__chwazam?.state);
    if (state === targetState) return state;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for state: ${targetState}`);
}

async function waitForAnyState(page, states, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await page.evaluate(() => window.__chwazam?.state);
    if (states.includes(state)) return state;
    await page.waitForTimeout(200);
  }
  throw new Error(`Timed out waiting for states: ${states.join(', ')}`);
}

const ANIM_STATES = ['BATTLE', 'NUKE', 'BLACK_HOLE', 'LASER', 'GROWING'];

// --- Helpers ---

async function dismissSplash(page) {
  await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const t = new Touch({ identifier: 99, target: canvas, clientX: 100, clientY: 100, pageX: 100, pageY: 100 });
    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true, touches: [t], changedTouches: [t], targetTouches: [t],
    }));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const t = new Touch({ identifier: 99, target: canvas, clientX: 100, clientY: 100, pageX: 100, pageY: 100 });
    canvas.dispatchEvent(new TouchEvent('touchend', {
      bubbles: true, cancelable: true, touches: [], changedTouches: [t], targetTouches: [],
    }));
  });
  await page.waitForTimeout(300);
  await waitForState(page, 'WAITING', 5000).catch(() => {});
}

async function placeFingers(page, positions) {
  await page.evaluate((pos) => {
    const canvas = document.getElementById('game');
    const touches = pos.map((p, i) =>
      new Touch({ identifier: i, target: canvas, clientX: p.x, clientY: p.y, pageX: p.x, pageY: p.y })
    );
    canvas.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true, cancelable: true,
      touches: touches, changedTouches: touches, targetTouches: touches,
    }));
  }, positions);
}

function fingerGrid(w, h, count) {
  // Aesthetic finger positions scaled to viewport
  const all = [
    { x: w * 0.25, y: h * 0.28 },
    { x: w * 0.75, y: h * 0.33 },
    { x: w * 0.30, y: h * 0.58 },
    { x: w * 0.70, y: h * 0.63 },
    { x: w * 0.50, y: h * 0.45 },
  ];
  return all.slice(0, count);
}

// --- Scene capture functions ---

async function captureSplash(context, w, h, outPath) {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath });
  await page.close();
}

async function capturePlacing(context, w, h, outPath) {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(500);
  await dismissSplash(page);
  await placeFingers(page, fingerGrid(w, h, 4));
  await page.waitForTimeout(800);
  await page.screenshot({ path: outPath });
  await page.close();
}

async function captureEffect(context, w, h, effect, delayMs, outPath) {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(500);
  await page.evaluate((eff) => {
    window.__chwazam.selectVictoryEffect = () => eff;
  }, effect);
  await dismissSplash(page);
  await placeFingers(page, fingerGrid(w, h, 4));
  await waitForAnyState(page, ANIM_STATES, 15000);
  await page.waitForTimeout(delayMs);
  await page.screenshot({ path: outPath });
  await page.close();
}

async function captureWinner(context, w, h, outPath) {
  const page = await context.newPage();
  await page.goto(BASE_URL);
  await page.waitForTimeout(500);
  await dismissSplash(page);
  const fingers = [
    { x: w * 0.50, y: h * 0.35 },
    { x: w * 0.30, y: h * 0.60 },
    { x: w * 0.70, y: h * 0.60 },
  ];
  await placeFingers(page, fingers);
  await waitForAnyState(page, ANIM_STATES, 15000);
  await waitForState(page, 'WINNER', 60000);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: outPath });
  await page.close();
}

// --- Main ---

(async () => {
  console.log('Starting vite preview server...');
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});

  try {
    await waitForServer(BASE_URL);
    console.log('Server ready.\n');

    const browser = await chromium.launch({ headless: true });

    for (const device of DEVICES) {
      const dir = path.join(STORE_DIR, 'screenshots', device.name);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      console.log(`=== ${device.name} (${device.width}x${device.height}) ===`);

      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        hasTouch: true,
        deviceScaleFactor: 1,
      });

      for (const scene of SCENES) {
        const outPath = path.join(dir, `${scene.id}.png`);
        process.stdout.write(`  ${scene.id}...`);

        try {
          if (scene.id === 'splash') {
            await captureSplash(context, device.width, device.height, outPath);
          } else if (scene.id === 'placing') {
            await capturePlacing(context, device.width, device.height, outPath);
          } else if (scene.id === 'winner') {
            await captureWinner(context, device.width, device.height, outPath);
          } else {
            // Effect scenes: delay varies by effect for best visual
            const delay = scene.effect === 'NUKE' ? 4500
              : scene.effect === 'BLACK_HOLE' ? 3000
              : scene.effect === 'LASER' ? 2500
              : 3500; // BATTLE default
            await captureEffect(context, device.width, device.height, scene.effect, delay, outPath);
          }
          console.log(' ok');
        } catch (err) {
          console.log(` FAILED: ${err.message}`);
        }
      }

      await context.close();
      console.log();
    }

    await browser.close();
    console.log('Done! Screenshots saved to store/screenshots/');
  } finally {
    server.kill();
  }
})();
