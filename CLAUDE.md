# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A monorepo with two components:

1. **`streamdeck/`** — TypeScript/Node.js app that renders custom images to an Elgato Stream Deck XL using low-level HID control via `@elgato-stream-deck/node`.
2. **`dotnet/ServiceBusListener/`** — .NET 8 console app that subscribes to an Azure Service Bus queue (`dataverseupdates`), deserializes Dataverse `RemoteExecutionContext` messages, and writes incident data as NDJSON to stdout.

The two components communicate via stdout/stdin NDJSON IPC (the TypeScript app spawns the .NET process as a child process).

## Commands

### Stream Deck (TypeScript)

```sh
cd streamdeck && npm run dev      # run directly with tsx (requires Stream Deck connected)
cd streamdeck && npm run build    # compile TypeScript to dist/
cd streamdeck && npm run start    # run compiled output from dist/
cd streamdeck && npx tsc --noEmit # type-check without emitting
```

### Service Bus Listener (.NET)

```sh
dotnet build dotnet/ServiceBusListener/                    # build
dotnet run --project dotnet/ServiceBusListener/             # run (needs appsettings.json)
dotnet run --project dotnet/ServiceBusListener/ -- --tee messages.jsonl  # run with tee logging
```

To configure: copy `dotnet/ServiceBusListener/appsettings.template.json` to `dotnet/ServiceBusListener/appsettings.json` and fill in your Service Bus connection string.

## Architecture

### Stream Deck App (`streamdeck/`)

**ESM project** (`"type": "module"` in package.json). Use `.js` extensions in import paths (e.g., `import { foo } from "./bar.js"`).

- **`src/index.ts`** — Entry point. Discovers Stream Deck devices via `listStreamDecks()`, opens the first one with `openStreamDeck(path)`, sets up key event listeners (`down`/`up` events on the `StreamDeck` object), and handles graceful shutdown (`resetToLogo()` + `close()`).
- **`src/render.ts`** — Image rendering utilities. Uses `sharp` to convert SVG templates into raw RGB pixel buffers sized for Stream Deck keys. Buffers are passed to `deck.fillKeyBuffer(keyIndex, buffer, { format: "rgb" })`.

### Service Bus Listener (`dotnet/ServiceBusListener/`)

- **`Program.cs`** — Entry point. Configures hosting with console logging routed to stderr (keeps stdout clean for NDJSON). Supports `--tee <filepath>` CLI flag.
- **`Services/ServiceBusListenerService.cs`** — `BackgroundService` that connects to Azure Service Bus, processes messages, deserializes `RemoteExecutionContext`, and writes `IncidentMessage` JSON lines to stdout.
- **`Services/MessageDeserializer.cs`** — Deserializes `RemoteExecutionContext` from .NET Binary XML (`application/msbin1`) using `DataContractSerializer` + `XmlDictionaryReader.CreateBinaryReader()`. Falls back to text XML. Maps incident entity attributes to `IncidentMessage` DTO.
- **`Models/IncidentMessage.cs`** — Flat JSON DTO written to stdout (one line per event).

### IPC Pattern (stdout/stdin NDJSON)

The TypeScript app spawns the .NET process via `child_process.spawn()`. The .NET app writes one JSON line per incident event to stdout. All diagnostic logging goes to stderr.

**Observability:**
- `--tee <filepath>` flag: each NDJSON line is also appended to the specified file (`tail -f messages.jsonl`)
- stderr logging: summary line per processed message
- Standalone mode: run `dotnet run` directly to see JSON output in terminal

## Stream Deck API Patterns

The library is `@elgato-stream-deck/node` v7.x. Key API details:

- **Device discovery:** `await listStreamDecks()` returns `StreamDeckDeviceInfo[]`; open with `await openStreamDeck(path)`
- **Key images:** `fillKeyColor(index, r, g, b)`, `fillKeyBuffer(index, buffer, { format: "rgb" | "rgba" })`, `clearKey(index)`, `clearPanel()`
- **Events:** `deck.on("down", (control) => ...)` — in v7.x, events pass a `control` object (not a key index). Use `control.type === "button"` and `control.index` to get the key number.
- **Brightness:** `deck.setBrightness(0-100)`
- **Cleanup:** always call `resetToLogo()` then `close()` on shutdown
- **XL key size:** 96x96 pixels, 8 columns x 4 rows = 32 keys
- `@julusian/jpeg-turbo` is installed for faster image encoding (XL uses JPEG internally)

## Known Issues

There is a [documented issue](https://github.com/microsoft/PowerPlatform-DataverseServiceClient/issues/502) with deserializing `RemoteExecutionContext` on .NET 8. If this surfaces:
- **Fallback A:** Reconfigure the Dataverse Service Endpoint to use JSON `MessageFormat`
- **Fallback B:** Target `net48` instead of `net8.0` with `Microsoft.CrmSdk.CoreAssemblies`
