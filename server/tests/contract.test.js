import { readFileSync } from "node:fs";
import { PERMISSIONS, PRESET_ROLES } from "../domain/access.js";
import { ACCOUNT_TABLES, SHOP_TABLES, WRITE_PERMISSION } from "../domain/tables.js";

// The server can't import the client's TypeScript, so it keeps copies of the
// permissions and the synced tables. These tests read the client's source
// and fail the moment the two drift apart.

const client = (path) => readFileSync(new URL(`../../client/src/${path}`, import.meta.url), "utf8");

/** The quoted strings of `const NAME = [ ... ]` in a source file, comments ignored. */
function listIn(source, name) {
  const body = source.match(new RegExp(`const ${name}(?:: [^=]+)? = \\[([\\s\\S]*?)\\]`))?.[1];
  if (body === undefined) throw new Error(`${name} not found in the client source`);
  const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  return [...code.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("server and client agree", () => {
  const access = client("domain/access.ts");
  const db = client("infrastructure/db/db.ts");
  const role = (id) => PRESET_ROLES.find((r) => r.id === id).permissions;

  it("on the permissions", () => {
    expect(PERMISSIONS).toEqual(listIn(access, "PERMISSIONS"));
  });

  it("on what each preset may do", () => {
    const staff = listIn(access, "STAFF");
    expect(role("staff")).toEqual(staff);
    expect(role("manager")).toEqual([...staff, ...listIn(access, "MANAGER")]);
    expect(role("owner")).toEqual(PERMISSIONS);
  });

  it("on the synced tables, and every table has a write permission", () => {
    expect(ACCOUNT_TABLES).toEqual(listIn(db, "ACCOUNT_TABLES"));
    expect(SHOP_TABLES).toEqual(listIn(db, "SHOP_TABLES"));
    for (const table of [...ACCOUNT_TABLES, ...SHOP_TABLES]) expect(PERMISSIONS).toContain(WRITE_PERMISSION[table]);
  });
});
