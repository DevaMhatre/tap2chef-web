import request from "supertest";
import app from "../app.js";
import { connect, closeDatabase, clearDatabase } from "./helpers/db.js";
import { createUser } from "./helpers/seed.js";

beforeAll(connect);
afterEach(clearDatabase);
afterAll(closeDatabase);

describe("POST /api/auth/login", () => {
  it("logs in with valid credentials and returns a token", async () => {
    const { user, plainPassword } = await createUser({ role: "owner" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: plainPassword });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.userDetails.token).toBeDefined();
    expect(res.body.data.userDetails.role).toBe("owner");
  });

  it("rejects an incorrect password", async () => {
    const { user } = await createUser({ role: "owner" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("rejects an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
  });

  it("rejects a malformed request body", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
  });
});
