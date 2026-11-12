// Tiny IndexedDB key-value store, mirrored to disk through the local MCP server when it's
// running (IndexedDB alone can vanish: a browser pane without persistent storage, cleared
// site data). Nothing leaves this machine.

import type { ChallengeMode } from "./rulesets";
import type { TrackerData } from "./rom/types";
import type { Outcome, TrackerSnapshot } from "./tracker/tracker";
import { BRIDGE_HTTP } from "./bridge/endpoint";

// The store's name is from the app's first name. It stays: a new name would be a new, empty
// store, and every browser's saves would seem gone.
const DB_NAME = "kaizo-ironmon-web";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const kv = {
  get: <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
  set: async (key: string, value: unknown) => {
    const r = await tx("readwrite", (s) => s.put(value, key));
    mirror(key, value);
    return r;
  },
  del: async (key: string) => {
    const r = await tx("readwrite", (s) => s.delete(key));
    mirror(key, undefined);
    return r;
  },
  keys: () => tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()),
};

// ---- Disk backups (via the MCP server's /backup endpoint) ----

const BACKUP_URL = `${BRIDGE_HTTP}/backup`;

const TYPED = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array } as const;
type TypedName = keyof typeof TYPED;

/** JSON with typed arrays as base64 ({"$ta": "Float64Array", "b64": "..."}), for files on disk. */
function encode(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (ArrayBuffer.isView(v) && v.constructor.name in TYPED) {
      const bytes = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return { $ta: v.constructor.name, b64: btoa(s) };
    }
    return v;
  });
}

function revive(_k: string, v: unknown): unknown {
  const t = v as { $ta?: string; b64?: string } | null;
  if (t && typeof t === "object" && typeof t.$ta === "string" && typeof t.b64 === "string" && t.$ta in TYPED) {
    const bin = atob(t.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TYPED[t.$ta as TypedName](bytes.buffer);
  }
  return v;
}

/** Whether the last write reached the disk (null = not tried yet). */
export let backupOk: boolean | null = null;
// One write in flight per key, the latest value wins (autosaves come every 15 s).
const pendingWrite = new Map<string, { value: unknown }>();
const inFlight = new Set<string>();

// The current run's recording grows to megabytes; copy it at most every 2 minutes (a disk copy
// that's a little behind just means a jump in the replay, which it already handles).
const THROTTLED: Record<string, number> = { "run.replay": 120_000 };
const lastFlush = new Map<string, number>();
const timers = new Map<string, number>();

function mirror(key: string, value: unknown): void {
  pendingWrite.set(key, { value });
  const every = THROTTLED[key];
  const wait = every ? (lastFlush.get(key) ?? 0) + every - Date.now() : 0;
  if (wait > 0) {
    if (!timers.has(key)) timers.set(key, window.setTimeout(() => {
      timers.delete(key);
      const next = pendingWrite.get(key);
      if (next) mirror(key, next.value);
    }, wait));
    return;
  }
  lastFlush.set(key, Date.now());
  if (!inFlight.has(key)) void flush(key);
}

async function flush(key: string): Promise<void> {
  inFlight.add(key);
  try {
    for (let next = pendingWrite.get(key); next; next = pendingWrite.get(key)) {
      pendingWrite.delete(key);
      const url = `${BACKUP_URL}/${encodeURIComponent(key)}`;
      try {
        const res = next.value === undefined
          ? await fetch(url, { method: "DELETE" })
          : await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: encode(next.value) });
        backupOk = res.ok;
      } catch {
        backupOk = false; // the MCP server isn't running: the browser copy is all there is
      }
    }
  } finally {
    inFlight.delete(key);
  }
}

/** If this browser has no run but the disk does, copy the disk backup in. True if restored. */
export async function restoreFromDisk(): Promise<boolean> {
  if (await kv.get(KEYS.run)) return false;
  let all: Record<string, unknown>;
  try {
    const res = await fetch(BACKUP_URL);
    if (!res.ok) return false;
    all = JSON.parse(await res.text(), revive) as Record<string, unknown>;
  } catch {
    return false;
  }
  if (!all[KEYS.run] && !all[KEYS.baseRom]) return false;
  for (const [k, v] of Object.entries(all)) await tx("readwrite", (s) => s.put(v, k));
  return true;
}

/** Everything in the store as one file (the "Export save" button). */
export async function exportAll(): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const k of await kv.keys()) out[String(k)] = await kv.get(String(k));
  // "kaizoSave" marks the file format (from the app's first name); kept so old and new exports import alike.
  return encode({ kaizoSave: 1, at: Date.now(), data: out });
}

/** Replaces the store with an exported file's contents (and mirrors it to disk). */
export async function importAll(text: string): Promise<void> {
  const parsed = JSON.parse(text, revive) as { kaizoSave?: number; data?: Record<string, unknown> };
  if (parsed.kaizoSave !== 1 || !parsed.data) throw new Error("That isn't a save file exported from this app.");
  for (const k of await kv.keys()) await kv.del(String(k));
  for (const [k, v] of Object.entries(parsed.data)) await kv.set(k, v);
}

export interface BaseRom {
  name: string;
  bytes: Uint8Array;
}

export interface CurrentRun {
  attempt: number;
  /**
   * The ruleset. Saves from rulesets this version no longer has keep their old id: the app
   * treats such a run as no current run (see isKnownRuleset).
   */
  mode: ChallengeMode;
  /** The game the run plays: the base ROM as loaded, unchanged. */
  rom: Uint8Array;
  data: TrackerData;
  startedAt: number;
  /** Hardcore Nuzlocke option: a bottomless stack of Rare Candies (missing = on). */
  rareCandies?: boolean;
  /** Hardcore Nuzlocke option: hard level caps (missing = off). */
  hardLevelCaps?: boolean;
  /** Hardcore Nuzlocke option: the first rival battle doesn't count (missing = off). */
  firstRivalFree?: boolean;
  /** The first violation ends the run (missing = the ruleset's default). */
  endOnViolation?: boolean;
  /** Rule ids set to "logged only" at the start of the run (harness tuning). */
  lenientRules?: string[];
  /** Short run: badges that win the run (missing = full game). */
  goalBadges?: number;
}

/** A finished attempt in the run history. */
export interface RunRecord {
  attempt: number;
  /** Runs recorded before a ruleset was removed keep its id (or none, the oldest): shown, never resumed. */
  mode?: string;
  version: string;
  startedAt: number;
  endedAt: number;
  lead: string;
  level: number;
  badges: number;
  /** Older records may hold outcome kinds this version no longer produces. */
  outcome: Outcome | { kind: "abandoned"; detail: string } | { kind: string; detail: string };
}

export const KEYS = {
  baseRom: "baseRom",
  run: "run",
  battery: "run.battery",
  autoState: "run.autoState",
  slotState: "run.slotState",
  tracker: "run.tracker",
  history: "history",
  attempts: "attempts",
  /** The current run's recording so far (ReplayLog), saved alongside autoState. */
  replay: "run.replay",
  /** The AI's own route book for this run (note_route / go_to). */
  routes: "run.routes",
  /** A save kept when the run first reached a story milestone (saveMilestone in main.ts), by milestone id. */
  milestone: (id: string) => `run.milestone.${id}`,
  /** A ruleset's furthest run's recording (SavedReplay), kept across runs ("bestReplay.nuzlocke"). */
  bestReplay: (ruleset: ChallengeMode) => `bestReplay.${ruleset}`,
  /** A finished run's recording (SavedReplay), by attempt number — what scripts/verify-run.mjs checks. */
  runReplay: (attempt: number) => `replay.attempt-${attempt}`,
} as const;

export async function clearRun(): Promise<void> {
  const milestones = (await kv.keys()).map(String).filter((k) => k.startsWith(KEYS.milestone("")));
  await Promise.all([KEYS.run, KEYS.battery, KEYS.autoState, KEYS.slotState, KEYS.tracker, KEYS.replay, KEYS.routes, ...milestones].map((k) => kv.del(k)));
}

export type { TrackerSnapshot };
