import type { StreamDeck } from "@elgato-stream-deck/node";
import { GRID_COLUMNS, GRID_ROWS, INCIDENT_KEY_START } from "./types.js";

const FRAME_DELAY_MS = 120;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Animates a pre-rendered buffer sliding from the bottom row up to the
 * target slot's position within the same column.
 *
 * Uses overlap frames: the image briefly appears on two adjacent keys
 * simultaneously to create a smooth trailing effect.
 *
 * Sequence for each row transition:
 *   1. Show on current row only → delay
 *   2. Show on current row + row above → delay
 *   3. Clear current row (image remains on row above) → continue
 */
export async function slideInAnimation(
  deck: StreamDeck,
  targetSlot: number,
  buffer: Buffer
): Promise<void> {
  const targetKey = targetSlot + INCIDENT_KEY_START;
  const targetRow = Math.floor(targetKey / GRID_COLUMNS);
  const col = targetKey % GRID_COLUMNS;

  // Target is already on the bottom row — place directly
  if (targetRow === GRID_ROWS - 1) {
    await deck.fillKeyBuffer(targetKey, buffer, { format: "rgb" });
    return;
  }

  const bottomRow = GRID_ROWS - 1;

  for (let row = bottomRow; row >= targetRow; row--) {
    const keyIndex = row * GRID_COLUMNS + col;

    // Show image at current position
    await deck.fillKeyBuffer(keyIndex, buffer, { format: "rgb" });

    if (row === targetRow) break; // Final position — leave in place

    await delay(FRAME_DELAY_MS);

    // Overlap frame: show on both current and next row up
    const nextKey = (row - 1) * GRID_COLUMNS + col;
    await deck.fillKeyBuffer(nextKey, buffer, { format: "rgb" });
    await delay(FRAME_DELAY_MS);

    // Clear current row, image continues on the row above
    await deck.clearKey(keyIndex);
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
