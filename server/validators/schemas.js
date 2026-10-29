import { z } from "zod";
import { ACCOUNT_TABLES, SHOP_TABLES } from "../domain/tables.js";

export const loginSchema = z.object({
  email: z.string().email("A valid email is required"),
  password: z.string().min(1, "Password is required"),
});

const SYNCED = [...ACCOUNT_TABLES, ...SHOP_TABLES];
const MAX_CHANGES = 500;

// A key Mongo would read as an operator or a path: refused anywhere in a record.
function unsafeKey(value) {
  if (Array.isArray(value)) return value.some(unsafeKey);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, inner]) => key.startsWith("$") || key.includes(".") || unsafeKey(inner));
}

const syncId = z.string().min(1).max(100);

export const pushSchema = z.object({
  changes: z
    .array(
      z.object({
        table: z.enum(SYNCED, "Unknown table"),
        record: z
          .looseObject({ id: syncId, shopId: syncId.optional(), deleted: z.boolean().optional() })
          .refine((record) => !unsafeKey(record), "A record field name may not start with $ or contain a dot"),
      }),
    )
    .min(1, "Nothing to push")
    .max(MAX_CHANGES, `At most ${MAX_CHANGES} changes at once`),
});

export const pullQuerySchema = z.object({
  since: z.coerce.number().int().min(0).default(0),
  shopId: syncId,
});
