import type { StreamDeck } from "@elgato-stream-deck/node";
import { dimBuffer } from "./animation.js";
import { renderLetterKey, renderSplashScreen } from "./render.js";
import { INCIDENT_KEY_COUNT } from "./types.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TITLE_TEXT = "DATAVERSE COMMAND CENTER";
const SPLASH_FADE_MS = 600;
const SPLASH_HOLD_MS = 1200;
const LETTER_DELAY_MS = 70;
const LETTER_FADE_IN_MS = 30;
const TITLE_HOLD_MS = 2000;

/**
 * Plays the full startup sequence:
 *  1. Splash image fades in over ~600ms
 *  2. Hold splash for ~1.2s
 *  3. Clear panel
 *  4. "DATAVERSE COMMAND CENTER" typed out one letter at a time (neon glow)
 *  5. Hold title for ~2s
 *  6. Clear panel — ready for incidents
 */
export async function playStartupSequence(
  deck: StreamDeck,
  splashPath: string
): Promise<void> {
  // --- Phase 1: Splash fade-in ---
  try {
    const splashBuf = await renderSplashScreen(splashPath);
    const fadeSteps = [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1.0];
    const fadeDelay = Math.round(SPLASH_FADE_MS / fadeSteps.length);

    for (const factor of fadeSteps) {
      const frame = factor < 1.0 ? dimBuffer(splashBuf, factor) : splashBuf;
      await deck.fillPanelBuffer(frame, { format: "rgb" });
      if (factor < 1.0) await delay(fadeDelay);
    }

    console.error("Splash screen displayed (768x384)");
    await delay(SPLASH_HOLD_MS);
  } catch {
    console.error("No splash image found at assets/splash.png — skipping");
  }

  // --- Phase 2: Clear for title ---
  await deck.clearPanel();
  await delay(200);

  // --- Phase 3: Letter-by-letter reveal ---
  const offset = Math.floor((INCIDENT_KEY_COUNT - TITLE_TEXT.length) / 2);

  // Pre-render all letter buffers in parallel
  const letterBuffers = await Promise.all(
    TITLE_TEXT.split("").map((ch) =>
      ch === " " ? Promise.resolve(null) : renderLetterKey(ch)
    )
  );

  // Type out each letter with a quick per-key fade-in
  for (let i = 0; i < TITLE_TEXT.length; i++) {
    const buf = letterBuffers[i];
    if (!buf) {
      await delay(LETTER_DELAY_MS);
      continue;
    }

    const keyIndex = offset + i;
    await deck.fillKeyBuffer(keyIndex, dimBuffer(buf, 0.25), { format: "rgb" });
    await delay(LETTER_FADE_IN_MS);
    await deck.fillKeyBuffer(keyIndex, buf, { format: "rgb" });
    await delay(LETTER_DELAY_MS);
  }

  // --- Phase 4: Hold title ---
  await delay(TITLE_HOLD_MS);

  // --- Phase 5: Clear for incidents ---
  await deck.clearPanel();
}
