import type { StreamDeck } from "@elgato-stream-deck/node";
import { GRID_COLUMNS, GRID_ROWS, INCIDENT_KEY_START } from "./types.js";

const FRAME_DELAY_MS = 80;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Animates a pre-rendered buffer sliding from the bottom row up to the
 * target slot's position within the same column.
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

  // Animate from bottom row up to target row
  for (let row = GRID_ROWS - 1; row >= targetRow; row--) {
    const keyIndex = row * GRID_COLUMNS + col;
    await deck.fillKeyBuffer(keyIndex, buffer, { format: "rgb" });

    if (row !== targetRow) {
      await delay(FRAME_DELAY_MS);
      await deck.clearKey(keyIndex);
    }
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
