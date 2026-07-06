# stopthrowingrocks.github.io

Personal site built with [Zola](https://www.getzola.org/) and deployed to GitHub Pages via GitHub Actions.

## Local development

**Prerequisites:** Zola, Node.js 22+

```sh
npm install          # install all workspace dependencies
npm run serve        # start Zola dev server (hot-reloads templates/content)
npm run watch        # compile all TypeScript workspaces in parallel (with color-coded output)
```

Run both `serve` and `watch` together in two terminals for a full local dev loop.

## Building

```sh
npm run build        # compile all TypeScript workspaces (sequential)
```

This is what GitHub Actions runs on every push to `main`. The site is then built with Zola and deployed to the `gh-pages` branch.

## Project structure

```
content/
  wma1/             # Web MIDI app
  color-sort/       # Color sort puzzle
  teraformr/        # Terraforming game
  starbattle-v1/    # Star Battle puzzle
    src/            # TypeScript source modules
    scripts/        # Scraper utilities (Playwright)
    starbattle.js   # Compiled bundle (committed)
    levels.json     # Puzzle data
scripts/
  watch.js          # Parallel watch orchestrator (reads workspaces from package.json)
.github/workflows/
  main.yml          # CI: npm ci → npm run build → zola deploy
```

## TypeScript workspaces

Each content area is an npm workspace with its own `package.json`. Common scripts:

| Script | What it does |
|--------|-------------|
| `npm run build` | Build all workspaces (used by CI) |
| `npm run watch` | Watch all workspaces in parallel |
| `npm run build --workspace=content/xxx` | Build one workspace |

Adding a new TypeScript project: create `content/xxx/package.json` with a `build` script, add `"content/xxx"` to the `workspaces` array in the root `package.json`, and both `npm run build` and `npm run watch` will pick it up automatically.

## Star Battle scraper

Scrapes puzzles from puzzle-star-battle.com into `content/starbattle-v1/levels.json`.

```sh
npm run scrape --workspace=content/starbattle-v1
```

Requires Playwright browsers: `npx playwright install chromium` (one-time setup). Progress is saved to `content/starbattle-v1/scripts/scrape-progress.json` so interrupted runs can resume.
