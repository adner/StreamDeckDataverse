# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A TypeScript/Node.js application that renders custom images to an Elgato Stream Deck XL using low-level HID control via `@elgato-stream-deck/node`. Intended to integrate with Dynamics 365 and Dataverse.

## Commands

- `npm run dev` — run directly with tsx (no compile step, requires Stream Deck connected)
- `npm run build` — compile TypeScript to `dist/`
- `npm run start` — run compiled output from `dist/`
- `npx tsc --noEmit` — type-check without emitting

## Architecture

**ESM project** (`"type": "module"` in package.json). Use `.js` extensions in import paths (e.g., `import { foo } from "./bar.js"`).

- **`src/index.ts`** — Entry point. Discovers Stream Deck devices via `listStreamDecks()`, opens the first one with `openStreamDeck(path)`, sets up key event listeners (`down`/`up` events on the `StreamDeck` object), and handles graceful shutdown (`resetToLogo()` + `close()`).
- **`src/render.ts`** — Image rendering utilities. Uses `sharp` to convert SVG templates into raw RGB pixel buffers sized for Stream Deck keys. Buffers are passed to `deck.fillKeyBuffer(keyIndex, buffer, { format: "rgb" })`.

## Stream Deck API Patterns

The library is `@elgato-stream-deck/node` v7.x. Key API details:

- **Device discovery:** `await listStreamDecks()` returns `StreamDeckDeviceInfo[]`; open with `await openStreamDeck(path)`
- **Key images:** `fillKeyColor(index, r, g, b)`, `fillKeyBuffer(index, buffer, { format: "rgb" | "rgba" })`, `clearKey(index)`, `clearPanel()`
- **Events:** `deck.on("down", (control) => ...)` — in v7.x, events pass a `control` object (not a key index). Use `control.type === "button"` and `control.index` to get the key number.
- **Brightness:** `deck.setBrightness(0-100)`
- **Cleanup:** always call `resetToLogo()` then `close()` on shutdown
- **XL key size:** 96x96 pixels, 8 columns x 4 rows = 32 keys
- `@julusian/jpeg-turbo` is installed for faster image encoding (XL uses JPEG internally)
