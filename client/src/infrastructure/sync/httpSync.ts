import { liveQuery } from "dexie";
import { err, ok } from "../../domain/result";
import type { SyncService } from "../../usecases/ports";
import { db, type OutboxRow, type StoredRecord } from "../db/db";
import { CURSOR_KEY, deviceToken, forgetSession, syncCursor } from "../db/deviceSession";
import { getScope, type Scope } from "../db/repo";
import { fromWire, toWire, type WireChange } from "./wire";

export const PUSH_BATCH = 500;

type Call = { status: number; body: Record<string, unknown> } | undefined;

async function call(path: string, token: string, init: RequestInit, signal?: AbortSignal): Promise<Call> {
  try {
    const response = await fetch(`/api${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal,
    });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body: response.ok ? (body.data ?? {}) : body };
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

const post = (changes: WireChange[], token: string, signal?: AbortSignal) =>
  call("/sync/push", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ changes }) }, signal);

type Outcome = "done" | "offline" | "signedOut" | "failed";

/**
 * Sends the oldest waiting changes, one per record, as the record is now. The
 * outbox entries sent are cleared; a change made meanwhile has a later entry
 * and goes next time.
 */
async function pushOnce(token: string, scope: Scope, signal?: AbortSignal): Promise<Outcome | "more"> {
  const entries = await db.outbox.orderBy("seq").limit(PUSH_BATCH * 4).toArray();
  if (entries.length === 0) return "done";

  const latest = new Map<string, OutboxRow>();
  for (const entry of entries) latest.set(`${entry.table}/${entry.recordId}`, entry);
  const picked = [...latest.values()].slice(0, PUSH_BATCH);
  const rows = await Promise.all(picked.map((e) => db[e.table].get(e.recordId)));
  const sendable = picked.flatMap((entry, i) => (rows[i] ? [{ entry, change: toWire(entry.table, rows[i] as StoredRecord, scope) }] : []));
  const covered = (entry: OutboxRow) => entries.filter((e) => e.table === entry.table && e.recordId === entry.recordId && e.seq! <= entry.seq!);

  if (sendable.length > 0) {
    const reply = await post(sendable.map((s) => s.change), token, signal);
    if (!reply) return "offline";
    if (reply.status === 401) return "signedOut";
    if (reply.status >= 500 || reply.status === 429) return "failed";
    if (reply.status !== 200) {
      // One record the server won't take must not hold back the rest: send
      // each alone, and set aside only what it still refuses.
      for (const { entry, change } of sendable) {
        const alone = await post([change], token, signal);
        if (!alone || alone.status === 401 || alone.status >= 500) return alone?.status === 401 ? "signedOut" : "failed";
        if (alone.status !== 200) console.warn(`Sync refused ${entry.table} ${entry.recordId}:`, alone.body.message);
        await db.outbox.bulkDelete(covered(entry).map((e) => e.seq!));
      }
      return "more";
    }
  }
  // Entries for rows that no longer exist go too, with everything sent.
  await db.outbox.bulkDelete(picked.flatMap(covered).map((e) => e.seq!));
  return "more";
}

/** Applies everyone's changes since the cursor; a record with a change of ours still waiting keeps ours. */
async function pullOnce(token: string, scope: Scope, signal?: AbortSignal): Promise<Outcome | "more"> {
  const since = await syncCursor();
  const reply = await call(`/sync/pull?shopId=${encodeURIComponent(scope.shopId)}&since=${since}`, token, { method: "GET" }, signal);
  if (!reply) return "offline";
  if (reply.status === 401) return "signedOut";
  if (reply.status !== 200) return "failed";

  const changes = Array.isArray(reply.body.changes) ? reply.body.changes : [];
  const pulled = changes.flatMap((c) => fromWire(c, scope) ?? []);
  const tables = [...new Set(pulled.map((p) => db[p.table]))];
  await db.transaction("rw", [db.meta, db.outbox, ...tables], async () => {
    for (const { table, row } of pulled) {
      // Ours reaches the server later, so ours wins there too.
      const waiting = await db.outbox.where("recordId").equals(row.id).filter((e) => e.table === table).count();
      if (waiting === 0) await db[table].put(row);
    }
    await db.meta.put({ key: CURSOR_KEY, value: String(Number(reply.body.seq ?? since)) });
  });
  return reply.body.more === true ? "more" : "done";
}

async function drain(step: () => Promise<Outcome | "more">, signal?: AbortSignal): Promise<Outcome> {
  for (;;) {
    if (signal?.aborted) return "failed";
    const outcome = await step();
    if (outcome !== "more") return outcome;
  }
}

export const httpSync: SyncService = {
  async run(signal) {
    const token = await deviceToken();
    if (!token) return err("signedOut");
    if (!navigator.onLine) return err("offline");
    const scope = await getScope();

    const pushed = await drain(() => pushOnce(token, scope, signal), signal);
    const outcome = pushed === "done" ? await drain(() => pullOnce(token, scope, signal), signal) : pushed;
    if (outcome === "signedOut") await forgetSession();
    return outcome === "done" ? ok(undefined) : err(outcome);
  },

  subscribeWaiting(onChange) {
    return subscribeCount(() => db.outbox.count(), onChange);
  },
};

function subscribeCount(query: () => Promise<number>, onChange: (n: number) => void): () => void {
  const subscription = liveQuery(query).subscribe({ next: onChange, error: (error) => console.error(error) });
  return () => subscription.unsubscribe();
}
