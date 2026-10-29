import { jest } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import { mailer } from "../lib/mailer.js";
import Account from "../models/Account.js";
import LoginCode from "../models/LoginCode.js";
import Member from "../models/Member.js";
import Shop from "../models/Shop.js";
import User from "../models/User.js";
import { CODE_LIFETIME_MS, MAX_ATTEMPTS } from "../controllers/authController.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";

beforeAll(connect);
afterEach(async () => {
  jest.restoreAllMocks();
  await clearDatabase();
});
afterAll(closeDatabase);

const device = { accountId: "dev-acc", shopId: "dev-shop" };
let sent;
beforeEach(() => {
  sent = [];
  jest.spyOn(mailer, "sendLoginCode").mockImplementation(async (email, code) => sent.push({ email, code }));
});

const askCode = (email) => request(app).post("/api/auth/code").send({ email });
const verify = (body) => request(app).post("/api/auth/verify").send({ device, ...body });
const lastCode = () => sent.at(-1).code;
const wrong = (code) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

/** Pulls with the token a sign-in returned, to prove it works. */
const pullWith = ({ token, shopId }) =>
  request(app).get("/api/sync/pull").query({ shopId }).set("Authorization", `Bearer ${token}`);

describe("asking for a code", () => {
  it("emails a 6-digit code and keeps only its hash", async () => {
    const res = await askCode("  Owner@Example.com ").expect(200);
    expect(res.body.data.resendIn).toBe(30);
    expect(sent).toEqual([{ email: "owner@example.com", code: expect.stringMatching(/^\d{6}$/) }]);
    const stored = await LoginCode.findOne({ email: "owner@example.com" }).lean();
    expect(JSON.stringify(stored)).not.toContain(lastCode());
  });

  it("waits 30 seconds before sending another", async () => {
    await askCode("a@example.com").expect(200);
    const res = await askCode("a@example.com").expect(429);
    expect(res.body).toMatchObject({ reason: "tooSoon", retryIn: expect.any(Number) });
    await LoginCode.updateOne({ email: "a@example.com" }, { sentAt: new Date(Date.now() - 31_000) });
    await askCode("a@example.com").expect(200);
    expect(sent).toHaveLength(2);
  });

  it("refuses something that isn't an email", async () => {
    await askCode("not-an-email").expect(400);
    expect(sent).toEqual([]);
  });

  it("lets you ask again at once when the email couldn't be sent", async () => {
    mailer.sendLoginCode.mockRejectedValueOnce(new Error("down"));
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect((await askCode("a@example.com").expect(502)).body.reason).toBe("notSent");
    await askCode("a@example.com").expect(200);
  });
});

describe("a new owner", () => {
  it("names the restaurant, then gets an account built on the device's own ids", async () => {
    await askCode("new@example.com");
    const code = lastCode();

    const first = await verify({ email: "new@example.com", code }).expect(200);
    expect(first.body.data).toEqual({ needsName: true });

    const res = await verify({ email: "new@example.com", code, restaurantName: " Sharma Dhaba " }).expect(200);
    expect(res.body.data).toMatchObject({ ...device, restaurantName: "Sharma Dhaba", email: "new@example.com" });

    expect(await Account.findById("dev-acc").lean()).toMatchObject({ name: "Sharma Dhaba" });
    expect(await Shop.findOne({ accountId: "dev-acc", _id: "dev-shop" }).lean()).toBeTruthy();
    const [owner] = await Member.find({ accountId: "dev-acc" }).lean();
    expect(owner).toMatchObject({ roleId: "owner", scope: { kind: "allShops" } });
    expect((await User.findOne({ email: "new@example.com" }).lean()).memberships).toEqual([
      { accountId: "dev-acc", memberId: owner._id },
    ]);
    await pullWith(res.body.data).expect(200);
  });

  it("gets fresh ids if the device's are already taken", async () => {
    await Account.create({ _id: "dev-acc", name: "Someone else" });
    await askCode("new@example.com");
    const res = await verify({ email: "new@example.com", code: lastCode(), restaurantName: "Mine" }).expect(200);
    expect(res.body.data.accountId).not.toBe("dev-acc");
    expect(res.body.data.shopId).not.toBe("dev-shop");
    expect((await Account.findById("dev-acc").lean()).name).toBe("Someone else");
    await pullWith(res.body.data).expect(200);
  });

  it("makes one account however fast Sign in is tapped twice", async () => {
    await askCode("new@example.com");
    const body = { email: "new@example.com", code: lastCode(), restaurantName: "Twice" };
    const results = await Promise.all([verify(body), verify(body)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await Account.countDocuments()).toBe(1);
  });
});

describe("an owner signing in again", () => {
  async function signUp(email) {
    await askCode(email);
    const res = await verify({ email, code: lastCode(), restaurantName: "Sharma Dhaba" }).expect(200);
    await LoginCode.deleteMany({ email });
    return res.body.data;
  }

  it("gets their account and shop back on another device, without naming it again", async () => {
    const first = await signUp("owner@example.com");
    await askCode("owner@example.com");
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ email: "owner@example.com", code: lastCode(), device: { accountId: "other", shopId: "other" } })
      .expect(200);
    expect(res.body.data).toMatchObject({ accountId: first.accountId, shopId: first.shopId, restaurantName: "Sharma Dhaba" });
    expect(await Account.countDocuments()).toBe(1);
  });

  it("is refused once their membership is gone", async () => {
    const first = await signUp("owner@example.com");
    await Member.updateMany({ accountId: first.accountId }, { removedAt: 1 });
    await askCode("owner@example.com");
    const res = await verify({ email: "owner@example.com", code: lastCode() }).expect(403);
    expect(res.body.reason).toBe("noAccess");
  });
});

describe("a code", () => {
  it("is refused when wrong, and after five tries even when right", async () => {
    await askCode("a@example.com");
    const code = lastCode();
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await verify({ email: "a@example.com", code: wrong(code) }).expect(400)).body.reason).toBe("wrongCode");
    }
    expect((await verify({ email: "a@example.com", code }).expect(400)).body.reason).toBe("tooManyTries");
  });

  it("counts guesses sent all at once", async () => {
    await askCode("a@example.com");
    const code = lastCode();
    await Promise.all(Array.from({ length: 12 }, () => verify({ email: "a@example.com", code: wrong(code) })));
    expect((await verify({ email: "a@example.com", code }).expect(400)).body.reason).toBe("tooManyTries");
  });

  it("expires after 10 minutes", async () => {
    await askCode("a@example.com");
    await LoginCode.updateOne({ email: "a@example.com" }, { expiresAt: new Date(Date.now() - 1) });
    expect((await verify({ email: "a@example.com", code: lastCode() }).expect(400)).body.reason).toBe("expired");
    expect(CODE_LIFETIME_MS).toBe(10 * 60 * 1000);
  });

  it("works once", async () => {
    await askCode("a@example.com");
    const body = { email: "a@example.com", code: lastCode(), restaurantName: "Once" };
    await verify(body).expect(200);
    expect((await verify(body).expect(400)).body.reason).toBe("expired");
  });

  it("belongs to its own email", async () => {
    await askCode("a@example.com");
    const code = lastCode();
    await askCode("b@example.com");
    expect((await verify({ email: "b@example.com", code, restaurantName: "X" }).expect(400)).body.reason).toMatch(/wrongCode|expired/);
  });

  it("must be 6 digits, with a device", async () => {
    await verify({ email: "a@example.com", code: "12345" }).expect(400);
    await request(app).post("/api/auth/verify").send({ email: "a@example.com", code: "123456" }).expect(400);
  });
});
