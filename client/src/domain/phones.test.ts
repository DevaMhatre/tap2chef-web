import { describe, expect, it } from "vitest";
import { ownerFirst, phoneLabel, type Phone } from "./phones";

describe("phones", () => {
  it("names a device by what it is", () => {
    expect(phoneLabel("Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe("Android phone");
    expect(phoneLabel("Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 Chrome/120 Safari/537.36")).toBe("Android tablet");
    expect(phoneLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)")).toBe("iPhone");
    expect(phoneLabel("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("iPad");
    expect(phoneLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(phoneLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows computer");
    expect(phoneLabel("")).toBe("Phone");
  });

  it("puts the phone looking at the list first", () => {
    const phone = (id: string, current = false): Phone => ({ id, label: "Phone", kind: "linked", lastSeenAt: 0, current });
    expect(ownerFirst([phone("a"), phone("b", true), phone("c")]).map((p) => p.id)).toEqual(["b", "a", "c"]);
  });
});
