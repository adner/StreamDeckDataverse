import { listStreamDecks, openStreamDeck, DeviceModelId } from "@elgato-stream-deck/node";
import { renderTextKey } from "./render.js";
import { ServiceBusChild } from "./ipc.js";
import { IncidentBoard } from "./incident-board.js";
import type { IncidentMessage } from "./types.js";

async function main(): Promise<void> {
  // 1. Discover devices
  const devices = await listStreamDecks();
  if (devices.length === 0) {
    console.error("No Stream Deck devices found. Is one plugged in?");
    process.exit(1);
  }

  console.error(`Found ${devices.length} device(s):`);
  for (const dev of devices) {
    console.error(`  - ${dev.model} at ${dev.path}`);
  }

  // 2. Open the XL device
  const xlDevice = devices.find((d) => d.model === DeviceModelId.XL);
  if (!xlDevice) {
    console.error("No Stream Deck XL found.");
    process.exit(1);
  }
  const deck = await openStreamDeck(xlDevice.path);
  console.error(`Opened: ${deck.PRODUCT_NAME} (model: ${deck.MODEL})`);
  console.error(`Firmware: ${await deck.getFirmwareVersion()}`);
  console.error(`Serial:   ${await deck.getSerialNumber()}`);

  // 3. Set brightness
  await deck.setBrightness(80);

  // 4. Clear all keys
  await deck.clearPanel();

  // 5. Render header row (row 0: keys 0–7)
  const headers = [
    { key: 0, text: "D365",   bg: "#00695c" },
    { key: 1, text: "Cases",  bg: "#1565c0" },
    { key: 7, text: "Status", bg: "#4e342e" },
  ];

  for (const h of headers) {
    const buf = await renderTextKey(h.text, h.bg);
    await deck.fillKeyBuffer(h.key, buf, { format: "rgb" });
  }

  // 6. Set up incident board (keys 8–31)
  const board = new IncidentBoard(deck);

  // 7. Spawn .NET Service Bus listener
  const child = new ServiceBusChild();

  child.on("incident", (msg: IncidentMessage) => {
    console.error(`[incident] ${msg.messageName}: ${msg.ticketNumber} — ${msg.title}`);
    board.handleIncident(msg).catch((err) => console.error("[board] render error:", err));
  });

  child.start();

  console.error("Keys initialized. Waiting for incidents...");

  // 8. Key events
  deck.on("down", (control) => {
    if (control.type !== "button") return;

    const incident = board.getIncidentAtKey(control.index);
    if (incident) {
      console.error(
        `[keydown] ${incident.ticketNumber}: ${incident.title} ` +
        `(priority=${incident.priorityLabel}, status=${incident.statusLabel})`
      );
    }
    deck.fillKeyColor(control.index, 255, 255, 255).catch(console.error);
  });

  deck.on("up", (control) => {
    if (control.type !== "button") return;

    const incident = board.getIncidentAtKey(control.index);
    if (incident) {
      // Re-render the incident key to restore it
      const slot = control.index - 8;
      board.renderSlot(slot).catch(console.error);
    } else {
      // For header/empty keys, just clear
      deck.clearKey(control.index).catch(console.error);
    }
  });

  deck.on("error", (err) => {
    console.error("Stream Deck error:", err);
  });

  // 9. Graceful shutdown
  const cleanup = async () => {
    console.error("\nShutting down...");
    await child.stop();
    await deck.resetToLogo();
    await deck.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(console.error);
