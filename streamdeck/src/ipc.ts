import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";
import { fileURLToPath } from "url";
import path from "path";

import type { IncidentMessage } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root is two levels up from streamdeck/src/ */
const PROJECT_PATH = path.resolve(__dirname, "..", "..", "dotnet", "ServiceBusListener");

const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export interface ServiceBusChildEvents {
  incident: [msg: IncidentMessage];
}

export class ServiceBusChild extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  private restartDelay = BASE_DELAY_MS;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  start(): void {
    this.stopping = false;
    this.spawn();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (!this.child) return;

    const child = this.child;
    this.child = null;

    child.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 5_000);

      child.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  private spawn(): void {
    console.error(`[ipc] Spawning dotnet run --project ${PROJECT_PATH}`);

    const child = spawn("dotnet", ["run", "--project", PROJECT_PATH], {
      stdio: ["ignore", "pipe", "inherit"],
    });

    this.child = child;

    const rl = createInterface({ input: child.stdout! });

    rl.on("line", (line: string) => {
      try {
        const msg: IncidentMessage = JSON.parse(line);
        this.restartDelay = BASE_DELAY_MS; // reset backoff on success
        this.emit("incident", msg);
      } catch {
        console.error("[ipc] Failed to parse NDJSON line:", line);
      }
    });

    child.on("error", (err: Error) => {
      console.error("[ipc] Child process error:", err.message);
    });

    child.on("exit", (code: number | null, signal: string | null) => {
      console.error(`[ipc] Child exited (code=${code}, signal=${signal})`);
      this.child = null;
      if (!this.stopping) {
        this.scheduleRestart();
      }
    });
  }

  private scheduleRestart(): void {
    console.error(`[ipc] Restarting in ${this.restartDelay}ms...`);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.spawn();
    }, this.restartDelay);
    this.restartDelay = Math.min(this.restartDelay * 2, MAX_DELAY_MS);
  }
}
