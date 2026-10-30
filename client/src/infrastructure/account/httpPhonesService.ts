import type { Phone } from "../../domain/phones";
import { err, ok, type Result } from "../../domain/result";
import type { PhonesError, PhonesService } from "../../usecases/ports";
import { deviceToken } from "../db/deviceSession";

// The owner's phone asking the server about the restaurant's phones. Anti-
// corruption layer: server rows are checked, never trusted, on the way in.

type Reply = { status: number; body: Record<string, unknown> };

async function call(path: string, init: RequestInit, signal?: AbortSignal): Promise<Reply | undefined> {
  const token = await deviceToken();
  if (!token || !navigator.onLine) return undefined;
  try {
    const response = await fetch(`/api/devices${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal });
    const body = await response.json().catch(() => ({}));
    return { status: response.status, body: response.ok ? (body.data ?? {}) : body };
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
}

function problem(reply: Reply | undefined): PhonesError {
  if (!reply) return "offline";
  return reply.body.reason === "notOwnerPhone" ? "notOwnerPhone" : "failed";
}

function toPhone(row: unknown): Phone[] {
  const r = row as Record<string, unknown>;
  if (typeof r?.id !== "string" || typeof r.label !== "string" || typeof r.lastSeenAt !== "number") return [];
  if (r.kind !== "owner" && r.kind !== "linked") return [];
  return [{ id: r.id, label: r.label, kind: r.kind, lastSeenAt: r.lastSeenAt, current: r.current === true }];
}

export const httpPhonesService: PhonesService = {
  async linkCode(signal) {
    const reply = await call("/link-code", { method: "POST" }, signal);
    if (reply?.status !== 200 || typeof reply.body.code !== "string" || typeof reply.body.expiresAt !== "number") return err(problem(reply));
    return ok({ code: reply.body.code, expiresAt: reply.body.expiresAt });
  },

  async list(signal): Promise<Result<Phone[], PhonesError>> {
    const reply = await call("", { method: "GET" }, signal);
    if (reply?.status !== 200 || !Array.isArray(reply.body.devices)) return err(problem(reply));
    return ok(reply.body.devices.flatMap(toPhone));
  },

  async remove(id, signal) {
    const reply = await call(`/${encodeURIComponent(id)}`, { method: "DELETE" }, signal);
    // Already gone is what was asked for.
    if (reply?.status === 200 || reply?.status === 404) return ok(undefined);
    return err(problem(reply));
  },
};
