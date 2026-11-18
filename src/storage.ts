// Tiny IndexedDB key-value store, mirrored to disk through the local MCP server when it's
// running (IndexedDB alone can vanish: a browser pane without persistent storage, cleared
// site data). Nothing leaves this machine.

import { BRIDGE_HTTP } from "./bridge/endpoint";
import {
  KEYS,
  THROTTLED_KEYS,
  keysClearedWithRun,
  type BaseRom,
  type CurrentRun,
  type RunRecord,
} from "./run-artifacts";
import { decodeSave, encodeSave, reviveSave } from "./save-codec";
import type { TrackerSnapshot } from "./tracker/tracker";

export { KEYS, type BaseRom, type CurrentRun, type RunRecord, type TrackerSnapshot };

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

/** Whether the last write reached the disk (null = not tried yet). */
export let backupOk: boolean | null = null;
// One write in flight per key, the latest value wins (autosaves come every 15 s).
const pendingWrite = new Map<string, { value: unknown }>();
const inFlight = new Set<string>();

// The current run's recording grows to megabytes; copy it at most every 2 minutes (a disk copy
// that's a little behind just means a jump in the replay, which it already handles — see THROTTLED_KEYS).
const lastFlush = new Map<string, number>();
const timers = new Map<string, number>();

function mirror(key: string, value: unknown): void {
  pendingWrite.set(key, { value });
  const every = THROTTLED_KEYS[key];
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
          : await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: encodeSave(next.value) });
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
    all = JSON.parse(await res.text(), reviveSave) as Record<string, unknown>;
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
  return encodeSave({ kaizoSave: 1, at: Date.now(), data: out });
}

/** Replaces the store with an exported file's contents (and mirrors it to disk). */
export async function importAll(text: string): Promise<void> {
  const parsed = decodeSave<{ kaizoSave?: number; data?: Record<string, unknown> }>(text);
  if (parsed.kaizoSave !== 1 || !parsed.data) throw new Error("That isn't a save file exported from this app.");
  for (const k of await kv.keys()) await kv.del(String(k));
  for (const [k, v] of Object.entries(parsed.data)) await kv.set(k, v);
}

export async function clearRun(): Promise<void> {
  const keys = (await kv.keys()).map(String);
  await Promise.all(keysClearedWithRun(keys).map((k) => kv.del(k)));
}
