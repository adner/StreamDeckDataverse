import { listStreamDecks, openStreamDeck, DeviceModelId } from "@elgato-stream-deck/node";
import { renderTextKey } from "./render.js";

async function main(): Promise<void> {
  // 1. Discover devices
  const devices = await listStreamDecks();
  if (devices.length === 0) {
    console.error("No Stream Deck devices found. Is one plugged in?");
    process.exit(1);
  }

  console.log(`Found ${devices.length} device(s):`);
  for (const dev of devices) {
    console.log(`  - ${dev.model} at ${dev.path}`);
  }

  // 2. Open the XL device
  const xlDevice = devices.find((d) => d.model === DeviceModelId.XL);
  if (!xlDevice) {
    console.error("No Stream Deck XL found.");
    process.exit(1);
  }
  const deck = await openStreamDeck(xlDevice.path);
  console.log(`Opened: ${deck.PRODUCT_NAME} (model: ${deck.MODEL})`);
  console.log(`Firmware: ${await deck.getFirmwareVersion()}`);
  console.log(`Serial:   ${await deck.getSerialNumber()}`);

  // 3. Set brightness
  await deck.setBrightness(80);

  // 4. Clear all keys
  await deck.clearPanel();

  // 5. Fill first three keys with solid colors
  await deck.fillKeyColor(0, 255, 0, 0);   // Red
  await deck.fillKeyColor(1, 0, 255, 0);   // Green
  await deck.fillKeyColor(2, 0, 0, 255);   // Blue

  // 6. Render text labels on a few keys
  const labels = [
    { key: 3, text: "Hello", bg: "#6200ea" },
    { key: 4, text: "World", bg: "#0091ea" },
    { key: 5, text: "D365",  bg: "#00695c" },
  ];

  for (const label of labels) {
    const buf = await renderTextKey(label.text, label.bg);
    await deck.fillKeyBuffer(label.key, buf, { format: "rgb" });
  }

  console.log("Keys initialized. Press buttons to interact.");

  // 7. Key events
  deck.on("down", (control) => {
    if (control.type === "button") {
      console.log(`Key ${control.index} DOWN`);
      deck.fillKeyColor(control.index, 255, 255, 255).catch(console.error);
    }
  });

  deck.on("up", (control) => {
    if (control.type === "button") {
      console.log(`Key ${control.index} UP`);
      deck.clearKey(control.index).catch(console.error);
    }
  });

  deck.on("error", (err) => {
    console.error("Stream Deck error:", err);
  });

  // 8. Graceful shutdown
  const cleanup = async () => {
    console.log("\nShutting down...");
    await deck.resetToLogo();
    await deck.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch(console.error);
