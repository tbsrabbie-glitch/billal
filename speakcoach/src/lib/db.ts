"use client";

import Dexie, { type EntityTable } from "dexie";
import type { MediaKind, MediaRecord, SessionRecord, SessionSetup } from "./types";

class SpeakCoachDB extends Dexie {
  sessions!: EntityTable<SessionRecord, "id">;
  media!: EntityTable<MediaRecord, "id">;

  constructor() {
    super("speakcoach");
    this.version(1).stores({
      sessions: "id, createdAt, setup.speechType, retryOf",
      media: "id, sessionId",
    });
  }
}

let instance: SpeakCoachDB | null = null;

function db(): SpeakCoachDB {
  if (!instance) instance = new SpeakCoachDB();
  return instance;
}

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // ignore: not supported
  }
  return false;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createSession(setup: SessionSetup, retryOf?: string): Promise<SessionRecord> {
  const now = Date.now();
  const session: SessionRecord = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    status: "setup",
    setup,
    retryOf,
  };
  await db().sessions.add(session);
  return session;
}

export async function getSession(id: string): Promise<SessionRecord | undefined> {
  return db().sessions.get(id);
}

export async function listSessions(): Promise<SessionRecord[]> {
  return db().sessions.orderBy("createdAt").reverse().toArray();
}

export async function updateSession(id: string, changes: Partial<SessionRecord>): Promise<void> {
  await db().sessions.update(id, { ...changes, updatedAt: Date.now() });
}

export async function saveMedia(sessionId: string, kind: MediaKind, blob: Blob): Promise<void> {
  await db().media.put({
    id: `${sessionId}:${kind}`,
    sessionId,
    kind,
    blob,
    mimeType: blob.type,
  });
}

export async function getMedia(sessionId: string, kind: MediaKind): Promise<MediaRecord | undefined> {
  return db().media.get(`${sessionId}:${kind}`);
}

/** Removes the session and every recording that belongs to it. */
export async function deleteSession(id: string): Promise<void> {
  const d = db();
  await d.transaction("rw", d.sessions, d.media, async () => {
    await d.media.where("sessionId").equals(id).delete();
    await d.sessions.delete(id);
  });
}

interface BackupFile {
  app: "speakcoach";
  version: 1;
  exportedAt: number;
  sessions: SessionRecord[];
  frames: Record<string, string>;
}

/** Everything except videos/audio (which can be large) as one JSON file. */
export async function exportData(): Promise<Blob> {
  const d = db();
  const sessions = await d.sessions.toArray();
  const frames: Record<string, string> = {};
  for (const m of await d.media.where("id").anyOf(sessions.map((s) => `${s.id}:frames`)).toArray()) {
    frames[m.sessionId] = await m.blob.text();
  }
  const file: BackupFile = { app: "speakcoach", version: 1, exportedAt: Date.now(), sessions, frames };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

/** Adds sessions from a backup; sessions already on this device are left alone. Returns how many were added. */
export async function importData(file: File): Promise<number> {
  const data = JSON.parse(await file.text()) as Partial<BackupFile>;
  if (data.app !== "speakcoach" || !Array.isArray(data.sessions)) throw new Error("That isn't a SpeakCoach backup file.");
  const d = db();
  let added = 0;
  await d.transaction("rw", d.sessions, d.media, async () => {
    for (const s of data.sessions!) {
      if (!s?.id || (await d.sessions.get(s.id))) continue;
      await d.sessions.add(s);
      const frames = data.frames?.[s.id];
      if (frames) {
        await d.media.put({ id: `${s.id}:frames`, sessionId: s.id, kind: "frames", blob: new Blob([frames], { type: "application/json" }), mimeType: "application/json" });
      }
      added++;
    }
  });
  return added;
}

export async function storageEstimate(): Promise<{ usedMB: number; quotaMB: number } | null> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return null;
    return {
      usedMB: Math.round((est.usage ?? 0) / 1e6),
      quotaMB: Math.round((est.quota ?? 0) / 1e6),
    };
  } catch {
    return null;
  }
}
