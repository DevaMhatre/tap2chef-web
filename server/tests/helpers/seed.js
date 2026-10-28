import bcrypt from "bcrypt";
import User from "../../models/User.js";

export const createUser = async ({ role = "staff", ...overrides } = {}) => {
  const password = overrides.plainPassword || "password123";

  const user = await User.create({
    name: overrides.name || `Test ${role}`,
    email: overrides.email || `${role}-${Date.now()}@example.com`,
    password: await bcrypt.hash(password, 10),
    role,
  });

  return { user, plainPassword: password };
};
