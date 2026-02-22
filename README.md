# Chwazam

A finger chooser game — place fingers on the screen and watch towers battle it out to pick a winner.

## How to play

1. Each player places a finger on the screen
2. Towers spawn and a countdown begins
3. Towers battle with cannons and guided missiles
4. Last tower standing wins — the winner is always fair (uniform 1/N chance)

## Tech Stack

- TypeScript + HTML5 Canvas
- Vite for bundling
- Capacitor for Android APK
- Playwright for testing

## Development

```bash
npm install
npm run dev          # Dev server
npm run build        # Production build
npx playwright test  # Run tests
```

## Android Build

```bash
npm run build && npx cap sync
cd android && ./gradlew assembleRelease
```

Or push a `v*` tag to trigger the CI release pipeline which builds and publishes a signed APK on GitHub Releases.

## License

WTFPL — see [LICENSE](LICENSE)
