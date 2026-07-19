# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An internal browser-based 3D boat-racing game (Estonian UI, ITK Inseneribüroo branding). Three.js client, Node.js multiplayer server. Comments, UI strings, and many identifiers are in Estonian — keep new code consistent with that.

## Commands

Requires Node.js 20+. npm workspaces monorepo: `shared`, `server`, `client`.

```bash
npm install
npm run dev          # client (Vite, :5173) + server (:8090) concurrently
npm run typecheck    # tsc --noEmit across all three workspaces (the only check; no tests, no linter)
npm run build        # vite build → client/dist
npm start            # production: server serves client/dist + WebSocket on PORT (default 8090)
npm run clean        # kill stray dev processes
scripts/fetch-assets.sh  # download CC0 assets (HDRIs, PBR textures) into client/public — idempotent
```

Typecheck a single workspace: `npm run typecheck -w client` (or `-w server`, `-w shared`).

Dev helper pages (Vite dev server): `/boat-test.html` (all boat models), `/wake-test.html` (wake render target), `/map-test.html?track=<id>&h=<camHeight>&tilt=<0..1.2>` (track overview from above).

Production deployment uses pm2 via `ecosystem.config.cjs`.

## Architecture

```
shared/   protocol types, vehicle stats, track definitions, wave math, constants
server/   express + ws: rooms, sessions, race phase machine, results authority
client/   Three.js: Gerstner-wave ocean, arcade physics, procedural + glTF models, Web Audio synthesis
```

- **Client** imports shared via the `@shared` alias (Vite + tsconfig). **Server** imports it via relative paths (`../../shared/src/...`). Server runs TypeScript directly with `tsx` — no build step.
- Entry points: `client/src/main.ts` → `client/src/Game.ts` (the god object wiring world, sim, net, UI, audio); `server/src/index.ts` → `ConnectionHandler` → `RoomManager`/`Room`.

### Critical contract: wave math is duplicated CPU/GPU

`shared/src/waves.ts` (CPU, used for boat buoyancy and by the server) and `client/src/world/ocean.vert.glsl` (GPU, renders the ocean) implement the **same Gerstner-wave math and must stay identical** — otherwise boats don't sit on the visible waves. If you change one, change the other. Wave sets are always exactly 4 waves per weather (fixed GPU uniform array size).

### Multiplayer model

- Clients simulate their own boat locally and send positions at 15 Hz (`state` messages, terse payload: `p`/`r`/`v`/`s`). The server **relays** positions to other clients, which render remote boats through a 150 ms interpolation buffer (`client/src/sim/RemoteBoat.ts`).
- The server is **solely authoritative over race results**: race clock, gate ordering (gate N before N+1), laps, finish order, DNF timeouts (`server/src/Room.ts` phase machine: LOBBY → COUNTDOWN → RACING → FINISHED → LOBBY).
- The whole protocol is the `C2S`/`S2C` discriminated unions in `shared/src/protocol.ts` — add message types there first. Server-side input validation lives in `server/src/validation.ts`.
- Client always connects to `location.host` (`/ws` path); Vite dev proxies `/ws` to :8090. Sessions support reconnect within 60 s via `sessionToken`.

### Client structure notes

- `sim/` is gameplay simulation (physics, collisions, race logic, ghost replay) — deliberately separate from `world/` (rendering: ocean, terrain, sky, weather, track props) and `boats/` (mesh construction).
- Graphics quality tiers live in `client/src/core/Quality.ts` (`ultra`/`korge`/`keskmine`/`madal`) with automatic downgrade; texture resolution selection in `core/Textures.ts`. New rendering features should be gated per-tier.
- Content is procedural-first: glTF/texture assets (Kenney kit, Poly Haven, ambientCG — see `client/public/ATTRIBUTION.md`) are optional enhancements with procedural fallbacks when files are missing. All audio is synthesized via Web Audio, no audio files.
- Tracks are data definitions in `shared/src/tracks/*.ts`, built into scenes by `client/src/world/TrackBuilder.ts`.
- UI is DOM-based (not in-canvas): `ui/ScreenManager.ts` + screens; all user-facing strings go through `client/src/ui/i18n/et.ts`.
