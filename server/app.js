import express from "express";
import cors from "cors";
import helmet from "helmet";
import "dotenv/config";

import authRoutes from "./routes/auth.js";
import syncRoutes from "./routes/sync.js";

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
// A device's first push can carry a whole restaurant's history, in batches.
app.use("/api/sync", express.json({ limit: "2mb" }), syncRoutes);
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "ok" });
});

app.use("/api/auth", authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

export default app;
