import type { StreamDeck } from "@elgato-stream-deck/node";
import { renderIncidentKey } from "./render.js";
import {
  type IncidentMessage,
  PRIORITY_COLORS,
  DEFAULT_PRIORITY_COLOR,
  INCIDENT_KEY_START,
  INCIDENT_KEY_COUNT,
} from "./types.js";

export class IncidentBoard {
  private slots: (IncidentMessage | null)[] = new Array(INCIDENT_KEY_COUNT).fill(null);
  private idToSlot = new Map<string, number>();
  private deck: StreamDeck;

  constructor(deck: StreamDeck) {
    this.deck = deck;
  }

  async handleIncident(msg: IncidentMessage): Promise<void> {
    const existing = this.idToSlot.get(msg.incidentId);

    if (existing !== undefined) {
      // Update in place
      this.slots[existing] = msg;
      await this.renderSlot(existing);
      return;
    }

    // Find first empty slot
    let slot = this.slots.indexOf(null);

    if (slot === -1) {
      // Board full — evict oldest (slot 0), shift everything left
      const evicted = this.slots[0]!;
      this.idToSlot.delete(evicted.incidentId);

      for (let i = 0; i < INCIDENT_KEY_COUNT - 1; i++) {
        this.slots[i] = this.slots[i + 1];
        if (this.slots[i]) {
          this.idToSlot.set(this.slots[i]!.incidentId, i);
        }
      }
      slot = INCIDENT_KEY_COUNT - 1;
      this.slots[slot] = null;

      // Re-render all shifted slots
      for (let i = 0; i < INCIDENT_KEY_COUNT - 1; i++) {
        await this.renderSlot(i);
      }
    }

    this.slots[slot] = msg;
    this.idToSlot.set(msg.incidentId, slot);
    await this.renderSlot(slot);
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
      await this.deck.clearKey(keyIndex);
      return;
    }

    const bgColor = PRIORITY_COLORS[msg.priorityCode ?? 0] ?? DEFAULT_PRIORITY_COLOR;
    const buf = await renderIncidentKey(
      msg.ticketNumber ?? "---",
      msg.title ?? "Untitled",
      msg.priorityLabel ?? "Unknown",
      bgColor
    );
    await this.deck.fillKeyBuffer(keyIndex, buf, { format: "rgb" });
  }

  async renderAll(): Promise<void> {
    for (let i = 0; i < INCIDENT_KEY_COUNT; i++) {
      await this.renderSlot(i);
    }
  }
}
