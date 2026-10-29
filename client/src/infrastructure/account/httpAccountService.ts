import { err, ok } from "../../domain/result";
import type { Email } from "../../domain/signIn";
import type { AccountService, SignInError } from "../../usecases/ports";
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
    const reply = await post("/auth/verify", { email, code, device, restaurantName }, signal);
    if (!reply) return err("offline");
    if (reply.status !== 200) {
      const reason = SIGN_IN_REASONS.find((r) => r === reply.body.reason);
      return err(reason ?? "failed");
    }
    if (reply.body.needsName) return ok({ kind: "needsName" });

    const { token, accountId, shopId, restaurantName: name } = reply.body;
    if (typeof token !== "string" || typeof accountId !== "string" || typeof shopId !== "string" || typeof name !== "string") {
      return err("failed");
    }
    const session = { email, restaurantName: name };
    await adoptSession({ session, token, scope: { accountId, shopId } });
    return ok({ kind: "signedIn", session });
  },
};
