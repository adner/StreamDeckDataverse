import type { StreamDeck } from "@elgato-stream-deck/node";
import { renderIncidentKey } from "./render.js";
import { AnimationQueue, slideInAnimation, updatePulseAnimation, fadeOutAnimation, shiftPulseAnimation } from "./animation.js";
import {
  type IncidentMessage,
  PRIORITY_COLORS,
  DEFAULT_PRIORITY_COLOR,
  INCIDENT_KEY_START,
  INCIDENT_KEY_COUNT,
  ORIGIN_EMOJIS,
} from "./types.js";

export class IncidentBoard {
  private slots: (IncidentMessage | null)[] = new Array(INCIDENT_KEY_COUNT).fill(null);
  private buffers: (Buffer | null)[] = new Array(INCIDENT_KEY_COUNT).fill(null);
  private idToSlot = new Map<string, number>();
  private deck: StreamDeck;
  private animationQueue = new AnimationQueue();
  private processingChain: Promise<void> = Promise.resolve();

  constructor(deck: StreamDeck) {
    this.deck = deck;
  }

  handleIncident(msg: IncidentMessage): void {
    this.processingChain = this.processingChain
      .then(() => this.processIncident(msg))
      .catch((err) => console.error("[board] process error:", err));
  }

  private async processIncident(msg: IncidentMessage): Promise<void> {
    // Inactive state (Resolved=1, Cancelled=2) — remove from board
    if (msg.stateCode !== null && msg.stateCode !== 0) {
      const slot = this.idToSlot.get(msg.incidentId);
      if (slot === undefined) return; // not on board — no-op
      await this.removeIncident(slot);
      return;
    }

    const existing = this.idToSlot.get(msg.incidentId);

    if (existing !== undefined) {
      // Update in place — pulse animation
      this.slots[existing] = msg;
      const buf = await this.renderBuffer(msg);
      this.buffers[existing] = buf;
      const keyIndex = existing + INCIDENT_KEY_START;
      this.animationQueue.enqueue(() =>
        updatePulseAnimation(this.deck, keyIndex, buf)
      );
      return;
    }

    // New incident — pre-render buffer before queuing animation
    const buf = await this.renderBuffer(msg);

    let slot = this.slots.indexOf(null);

    if (slot === -1) {
      // Board full — evict oldest (slot 0), shift everything left
      const evicted = this.slots[0]!;
      this.idToSlot.delete(evicted.incidentId);

      for (let i = 0; i < INCIDENT_KEY_COUNT - 1; i++) {
        this.slots[i] = this.slots[i + 1];
        this.buffers[i] = this.buffers[i + 1];
        if (this.slots[i]) {
          this.idToSlot.set(this.slots[i]!.incidentId, i);
        }
      }
      slot = INCIDENT_KEY_COUNT - 1;
      this.slots[slot] = null;
      this.buffers[slot] = null;

      // Re-render all shifted slots immediately (no animation)
      for (let i = 0; i < INCIDENT_KEY_COUNT - 1; i++) {
        await this.renderSlot(i);
      }
    }

    // Commit data model immediately
    this.slots[slot] = msg;
    this.buffers[slot] = buf;
    this.idToSlot.set(msg.incidentId, slot);

    // Enqueue slide-in animation (non-blocking)
    this.animationQueue.enqueue(() =>
      slideInAnimation(this.deck, slot, buf)
    );
  }

  private async removeIncident(slot: number): Promise<void> {
    const removed = this.slots[slot];
    if (!removed) return;

    const cachedBuffer = this.buffers[slot];

    // 1. Remove from id map
    this.idToSlot.delete(removed.incidentId);

    // 2. Enqueue fade-out animation
    if (cachedBuffer) {
      this.animationQueue.enqueue(() =>
        fadeOutAnimation(this.deck, slot + INCIDENT_KEY_START, cachedBuffer)
      );
    } else {
      this.animationQueue.enqueue(async () => {
        await this.deck.clearKey(slot + INCIDENT_KEY_START);
      });
    }

    // 3. Find last occupied slot
    let lastOccupied = -1;
    for (let i = INCIDENT_KEY_COUNT - 1; i > slot; i--) {
      if (this.slots[i] !== null) {
        lastOccupied = i;
        break;
      }
    }

    // 4. Shift data model left
    for (let i = slot; i < INCIDENT_KEY_COUNT - 1; i++) {
      this.slots[i] = this.slots[i + 1];
      this.buffers[i] = this.buffers[i + 1];
      if (this.slots[i]) {
        this.idToSlot.set(this.slots[i]!.incidentId, i);
      }
    }
    this.slots[INCIDENT_KEY_COUNT - 1] = null;
    this.buffers[INCIDENT_KEY_COUNT - 1] = null;

    // 5. Enqueue shift animation: instant re-render + sequential pulse
    if (lastOccupied > slot) {
      const shiftedSlots: { slot: number; buf: Buffer }[] = [];
      for (let i = slot; i < lastOccupied; i++) {
        if (this.buffers[i]) {
          shiftedSlots.push({ slot: i, buf: this.buffers[i]! });
        }
      }

      this.animationQueue.enqueue(async () => {
        // Instantly render all shifted keys in new positions
        for (const s of shiftedSlots) {
          await this.deck.fillKeyBuffer(s.slot + INCIDENT_KEY_START, s.buf, { format: "rgb" });
        }
        // Clear the vacated last slot
        await this.deck.clearKey(lastOccupied + INCIDENT_KEY_START);

        // Sequential pulse on each shifted key (left-to-right ripple)
        for (const s of shiftedSlots) {
          await shiftPulseAnimation(this.deck, s.slot + INCIDENT_KEY_START, s.buf);
        }
      });
    }
  }

  async flushAnimations(): Promise<void> {
    await this.animationQueue.flush();
  }

  getIncidentAtKey(keyIndex: number): IncidentMessage | null {
    if (keyIndex < INCIDENT_KEY_START || keyIndex >= INCIDENT_KEY_START + INCIDENT_KEY_COUNT) {
      return null;
    }
    return this.slots[keyIndex - INCIDENT_KEY_START];
  }

  async renderSlot(slot: number): Promise<void> {
    const keyIndex = slot + INCIDENT_KEY_START;
    const msg = this.slots[slot];

    if (!msg) {
      this.buffers[slot] = null;
      await this.deck.clearKey(keyIndex);
      return;
    }

    const buf = await this.renderBuffer(msg);
    this.buffers[slot] = buf;
    await this.deck.fillKeyBuffer(keyIndex, buf, { format: "rgb" });
  }

  private async renderBuffer(msg: IncidentMessage): Promise<Buffer> {
    const bgColor = PRIORITY_COLORS[msg.priorityCode ?? 0] ?? DEFAULT_PRIORITY_COLOR;
    const originEmoji = ORIGIN_EMOJIS[msg.caseOriginCode ?? 0] ?? "\u{2753}";
    return renderIncidentKey(originEmoji, msg.priorityLabel ?? "Unknown", bgColor);
  }

  async renderAll(): Promise<void> {
    for (let i = 0; i < INCIDENT_KEY_COUNT; i++) {
      await this.renderSlot(i);
    }
  }
}
