import type { RoleId } from "../../domain/access";
import { phoneLabel } from "../../domain/phones";
import { err, ok } from "../../domain/result";
import type { Email } from "../../domain/signIn";
import type { AccountService, JoinError, SignInError } from "../../usecases/ports";
import { adoptSession, subscribeSession } from "../db/deviceSession";
import { getScope } from "../db/repo";

type Reply = { status: number; body: Record<string, unknown> };

/** POSTs JSON to the API (same origin). Undefined when the network never answered. */
async function post(path: string, payload: unknown, signal?: AbortSignal): Promise<Reply | undefined> {
  if (!navigator.onLine) return undefined;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return undefined;
  }
  // An error page from a proxy is not JSON; its status still says what happened.
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body: response.ok ? (body.data ?? {}) : body };
}

const SIGN_IN_REASONS: readonly SignInError[] = ["wrongCode", "expired", "tooManyTries", "noAccess"];

export const httpAccountService: AccountService = {
  subscribe: subscribeSession,

  async requestCode(email: Email, signal) {
    const reply = await post("/auth/code", { email }, signal);
    if (!reply) return err({ kind: "offline" });
    if (reply.status === 200) return ok({ resendIn: Number(reply.body.resendIn ?? 30) });
    if (reply.body.reason === "tooSoon") return err({ kind: "tooSoon", retryIn: Number(reply.body.retryIn ?? 30) });
    return err({ kind: "failed" });
  },

  async signIn(email, code, restaurantName, signal) {
    const device = await getScope();
    const reply = await post("/auth/verify", { email, code, device, restaurantName, label: phoneLabel(navigator.userAgent ?? "") }, signal);
    if (!reply) return err("offline");
    if (reply.status !== 200) {
      const reason = SIGN_IN_REASONS.find((r) => r === reply.body.reason);
      return err(reason ?? "failed");
    }
    if (reply.body.needsName) return ok({ kind: "needsName" });

    const { token, accountId, brandId, shopId, restaurantName: name } = reply.body;
    if (typeof token !== "string" || typeof accountId !== "string" || typeof shopId !== "string" || typeof name !== "string") {
      return err("failed");
    }
    // A server from before brands names none: the account's first brand has its id.
    const scope = { accountId, brandId: typeof brandId === "string" ? brandId : accountId, shopId };
    const session = { via: "email" as const, email, restaurantName: name };
    await adoptSession({ session, token, scope });
    return ok({ kind: "signedIn", session });
  },

  async previewJoin(code, signal) {
    const reply = await post("/devices/join", { code }, signal);
    if (!reply) return err("offline");
    if (reply.status !== 200 || typeof reply.body.restaurantName !== "string") return err(joinError(reply));
    return ok({ restaurantName: reply.body.restaurantName });
  },

  async join(code, signal) {
    const reply = await post("/devices/join", { code, confirm: true, label: phoneLabel(navigator.userAgent ?? "") }, signal);
    if (!reply) return err("offline");
    const { token, accountId, brandId, shopId, restaurantName, person } = reply.body;
    if (reply.status !== 200) return err(joinError(reply));
    if (typeof token !== "string" || typeof accountId !== "string" || typeof shopId !== "string" || typeof restaurantName !== "string") {
      return err("failed");
    }
    const p = person as { name?: unknown; roleId?: unknown } | undefined;
    const known = typeof p?.name === "string" && (p.roleId === "manager" || p.roleId === "staff");
    const session = { via: "link" as const, restaurantName, ...(known && { person: { name: p.name as string, roleId: p.roleId as RoleId } }) };
    await adoptSession({ session, token, scope: { accountId, brandId: typeof brandId === "string" ? brandId : accountId, shopId } });
    return ok(session);
  },
};

const joinError = (reply: Reply): JoinError => (reply.body.reason === "wrongCode" ? "wrongCode" : "failed");
