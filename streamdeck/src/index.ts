import { listStreamDecks, openStreamDeck, DeviceModelId } from "@elgato-stream-deck/node";
import { exec } from "child_process";
import { ServiceBusChild } from "./ipc.js";
import { IncidentBoard } from "./incident-board.js";
import { D365_BASE_URL, D365_APP_ID, type IncidentMessage } from "./types.js";

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

  // 5. Set up incident board (keys 0–31)
  const board = new IncidentBoard(deck);

  // 7. Spawn .NET Service Bus listener
  const child = new ServiceBusChild();

  child.on("incident", (msg: IncidentMessage) => {
    console.error(`[incident] ${msg.messageName}: ${msg.ticketNumber} — ${msg.title}`);
    board.handleIncident(msg);
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
      const url = `${D365_BASE_URL}?appid=${D365_APP_ID}&forceUCI=1&pagetype=entityrecord&etn=incident&id=${incident.incidentId}`;
      exec(`start chrome "${url}"`, (err) => {
        if (err) console.error("[open] Failed to open Chrome:", err.message);
      });
    }
    deck.fillKeyColor(control.index, 255, 255, 255).catch(console.error);
  });

  deck.on("up", (control) => {
    if (control.type !== "button") return;

    const incident = board.getIncidentAtKey(control.index);
    if (incident) {
      // Re-render the incident key to restore it
      const slot = control.index;
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
    await board.flushAnimations();
    await deck.resetToLogo();
    await deck.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(console.error);
