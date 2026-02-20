import type { StreamDeck } from "@elgato-stream-deck/node";
import { GRID_COLUMNS, GRID_ROWS, INCIDENT_KEY_START } from "./types.js";

const TOTAL_ANIMATION_MS = 180;
const FRAMES_PER_ROW = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a dimmed copy of an RGB buffer by multiplying each byte by a factor. */
function dimBuffer(buf: Buffer, factor: number): Buffer {
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = Math.round(buf[i] * factor);
  }
  return out;
}

/**
 * Animates a pre-rendered buffer sliding from the bottom row up to the
 * target slot's position within the same column.
 *
 * Uses brightness-ramped overlap frames for smooth trailing:
 *
 * Per row transition:
 *   1. Current 100%                          → delay
 *   2. Current 100% + next 30%              → delay
 *   3. Current 100% + next 60%              → delay
 *   4. Current 60%  + next 100%             → delay
 *   5. Current 30%  + next 100%             → delay
 *   6. Clear current, next stays full        → continue
 */
export async function slideInAnimation(
  deck: StreamDeck,
  targetSlot: number,
  buffer: Buffer
): Promise<void> {
  const targetKey = targetSlot + INCIDENT_KEY_START;
  const targetRow = Math.floor(targetKey / GRID_COLUMNS);
  const col = targetKey % GRID_COLUMNS;

  // Target is on the bottom row — quick fade-in
  if (targetRow === GRID_ROWS - 1) {
    const fadeDelay = Math.round(TOTAL_ANIMATION_MS / FRAMES_PER_ROW);
    await deck.fillKeyBuffer(targetKey, dimBuffer(buffer, 0.3), { format: "rgb" });
    await delay(fadeDelay);
    await deck.fillKeyBuffer(targetKey, dimBuffer(buffer, 0.6), { format: "rgb" });
    await delay(fadeDelay);
    await deck.fillKeyBuffer(targetKey, buffer, { format: "rgb" });
    return;
  }

  // Pre-compute dimmed buffers (reused across row transitions)
  const dim30 = dimBuffer(buffer, 0.3);
  const dim60 = dimBuffer(buffer, 0.6);

  const bottomRow = GRID_ROWS - 1;
  const rowsToTravel = bottomRow - targetRow;
  const frameDelay = Math.round(TOTAL_ANIMATION_MS / (rowsToTravel * FRAMES_PER_ROW));

  for (let row = bottomRow; row >= targetRow; row--) {
    const curKey = row * GRID_COLUMNS + col;

    // Show full image at current position
    await deck.fillKeyBuffer(curKey, buffer, { format: "rgb" });

    if (row === targetRow) break; // Final position — leave in place

    const nextKey = (row - 1) * GRID_COLUMNS + col;

    // Frame 1: current 100% (already shown) — pause
    await delay(frameDelay);

    // Frame 2: current 100% + next 30%
    await deck.fillKeyBuffer(nextKey, dim30, { format: "rgb" });
    await delay(frameDelay);

    // Frame 3: current 100% + next 60%
    await deck.fillKeyBuffer(nextKey, dim60, { format: "rgb" });
    await delay(frameDelay);

    // Frame 4: current 60% + next 100%
    await deck.fillKeyBuffer(curKey, dim60, { format: "rgb" });
    await deck.fillKeyBuffer(nextKey, buffer, { format: "rgb" });
    await delay(frameDelay);

    // Frame 5: current 30% + next 100%
    await deck.fillKeyBuffer(curKey, dim30, { format: "rgb" });
    await delay(frameDelay);

    // Clear current row, next row stays full
    await deck.clearKey(curKey);
  }
}

/**
 * Serializes animation tasks so rapid arrivals play sequentially
 * rather than interleaving.
 */
export class AnimationQueue {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private flushResolvers: (() => void)[] = [];

  enqueue(task: () => Promise<void>): void {
    this.queue.push(task);
    if (!this.running) {
      this.drain();
    }
  }

  async flush(): Promise<void> {
    if (!this.running && this.queue.length === 0) return;
    return new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        await task();
      } catch (err) {
        console.error("[animation] Animation task failed:", err);
      }
    }
    this.running = false;
    for (const resolve of this.flushResolvers) {
      resolve();
    }
    this.flushResolvers = [];
  }
}
