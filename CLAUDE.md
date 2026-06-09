# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A browser chess game where a human plays against a "Claude"-branded chess AI. Pure static HTML/CSS/JS — **no build step, no dependencies, no package manager, no tests, no framework.** Everything runs client-side in the browser; the AI is a full search engine written in plain JavaScript.

## Two independent implementations (important)

There are **two separate, diverging codebases** for the same game. A change to one does **not** propagate to the other — keep this in mind before assuming a fix applies everywhere.

1. **`index.html`** (repo root) — the **primary, deployed, mobile-responsive** single-file version. Self-contained: HTML + CSS + two `<script>` blocks. This is what most work has targeted (side selection, dynamic AI time management, responsive layout, troll Undo).
2. **`chess/`** — an **older modular** version split into `index.html` + `js/{constants,engine,ai,app}.js` + `css/style.css`. Desktop-oriented (header, difficulty `<select>`, flip button). Its AI is simpler (fixed-depth, synchronous).

When the user says "desktop version" they usually mean `chess/`; "mobile/main" means root `index.html`.

## Running & developing

- **Run it:** open the `.html` file directly in a browser (`open index.html`), or visit the deployed site. No server needed.
- **Syntax-check after edits** (there's no linter/test runner):
  - Modular files: `node --check chess/js/app.js`
  - `index.html`'s inline scripts (extract the two `<script>` bodies and parse):
    ```bash
    node -e 'const fs=require("fs"),h=fs.readFileSync("index.html","utf8");
      const eng=h.split(`<script id="engine">`)[1].split("</script>")[0];
      const ui=h.split(`<!-- ═══ UI`)[1].split("<script>")[1].split("</script>")[0];
      new Function(eng); new Function("document","URL","Worker","Blob",ui);
      console.log("scripts parse OK");'
    ```
  - The engine is pure (DOM-free), so you can also `eval` it in Node and call `searchTimed(board,ep,cr,color,ms)` directly to smoke-test the AI from a given position.

## Deployment (GitHub Pages)

- Repo: `friidom/chess-vs-claude` (public). Deployed via **GitHub Pages** from `main` branch root.
- **Pushing to `main` auto-redeploys** (build takes ~1 min). Live URLs: root `index.html` at https://friidom.github.io/chess-vs-claude/ , modular at `/chess/`.
- Check build status: `gh api repos/friidom/chess-vs-claude/pages/builds/latest --jq '.status'` (`building` → `built`).
- The user wants **every change committed and pushed** with a clean message so there's always a revertable version. `.claude/settings.local.json` and `.DS_Store` are gitignored.

## Architecture / shared concepts

Both versions share the same core design (the code is duplicated, not imported):

- **Board representation:** an 8×8 array of single chars. Row 0 = rank 8, row 7 = rank 1; column 0 = file a. **Uppercase = White, lowercase = Black**, `null` = empty. `colr(p)`/`isW(p)` derive color from case.
- **Move object:** `{ from:[r,c], to:[r,c], sp }` where `sp` (special) ∈ `promo | dp` (double pawn push) `| ep` (en passant) `| cks`/`cqs` (king/queen-side castle), or `null`.
- **Engine layering:** move generation (`pseudo`/`legal`, attack detection, `applyMv`, castling-rights tracking) → evaluation (material + piece-square tables, pawn structure, king safety, with an endgame king table) → search.
- **Search:** negamax + alpha-beta with a Zobrist-hashed transposition table, null-move pruning, PVS, late-move reductions, killer-move + history-heuristic ordering, quiescence search with delta pruning, and check extensions.

### `index.html` specifics (the advanced engine)
- The engine lives in `<script id="engine">` and is **also stringified at runtime** (`document.getElementById('engine').textContent`) into a **Blob Web Worker**, so the AI searches off the main thread (UI/spinner stay responsive). **The engine script must stay DOM-free** or the worker breaks. The second `<script>` is the UI/interaction/worker driver.
- **Dynamic time management:** `TIME_LIMIT` (4000ms) is a *hard cap*. `allocTime()` computes a *soft budget* from board features (in-check, captures available, piece count, move count), and `searchTimed()` runs iterative deepening that stops early on a forced mate, a stable best move, or the soft budget — so easy/forced positions move fast and sharp ones use the full budget.
- Side selection (`startGame`), board flip (`flipped`), and panel/coordinate orientation all derive from `humanColor`/`aiColor`.

### `chess/` specifics
- Synchronous AI on the main thread via `bestAIMove(b, ep, cr, maxDepth)`; the difficulty `<select>` sets `maxDepth`. No worker, no dynamic timing.
- `app.js` keeps a `stateStack` of snapshots (legacy from a real undo that has since been disabled — see below).

## Gotchas

- **The "Undo" button is a deliberate troll in both versions** — it never reverts a move; it shows a random taunt toast (`taunt()` / `TAUNTS`). Do **not** "fix" it into a real undo unless asked. In `chess/` the old real-undo plumbing (`restoreSnapshot`, `rebuildMoveList`, `stateStack`) is now unused dead code left in place.
- Function names differ between versions (e.g. `legal` vs `legalMoves`, `applyMv` vs `applyMove`, `inChk` vs `inCheck`, `evalAbs` vs `evalAbsolute`) — don't assume a symbol from one exists in the other.
