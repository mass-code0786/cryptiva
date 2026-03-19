import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import morgan from "morgan";

import { CLIENT_URL, MONGO_URI, PORT } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import depositRoutes from "./routes/depositRoutes.js";
import p2pRoutes from "./routes/p2pRoutes.js";
import referralRoutes from "./routes/referralRoutes.js";
import salaryRoutes from "./routes/salaryRoutes.js";
import supportRoutes from "./routes/supportRoutes.js";
import tradeRoutes from "./routes/tradeRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import withdrawalRoutes from "./routes/withdrawalRoutes.js";
import { settleActiveTrades, startTradeEngine, stopTradeEngine } from "./services/tradeEngineService.js";
import { startSalaryScheduler } from "./services/salarySchedulerService.js";
import { startKeepAliveScheduler, stopKeepAliveScheduler } from "./services/keepAliveService.js";

const app = express();

const allowedOrigins = new Set(
  (CLIENT_URL || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
allowedOrigins.add("http://localhost:5173");

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy blocked this origin"));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(morgan("dev"));

/* -------- ROOT ROUTE ADD KIYA HAI -------- */
app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    message: "Cryptiva Backend API Running",
    endpoints: {
      health: "/health",
      apiHealth: "/api/health",
      auth: "/api/auth",
      users: "/api/users",
      wallet: "/api/wallet",
    },
  });
});
/* ---------------------------------------- */

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "cryptiva-api" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", ok: true, service: "cryptiva-api" });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/deposit", depositRoutes);
app.use("/api/withdrawals", withdrawalRoutes);
app.use("/api/withdraw", withdrawalRoutes);
app.use("/api/referrals", referralRoutes);
app.use("/api/referral", referralRoutes);
app.use("/api/salary-progress", salaryRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/trade", tradeRoutes);
app.use("/api/p2p", p2pRoutes);
app.use("/api/admin", adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

mongoose
  .connect(MONGO_URI)
  .then(() => {
    startTradeEngine();
    startSalaryScheduler();

    settleActiveTrades().catch((error) => {
      console.error("Initial trade settlement failed", error);
    });

    app.listen(PORT, () => {
      console.log(`Cryptiva backend running on port ${PORT}`);
      startKeepAliveScheduler({
        port: PORT,
        intervalMs: Number(process.env.KEEP_ALIVE_INTERVAL_MS) || 300000,
      });
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed", error);
    process.exit(1);
  });

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB disconnected. Stopping trade engine until reconnection.");
  stopTradeEngine();
});

mongoose.connection.on("connected", () => {
  startTradeEngine();
});

process.on("SIGINT", () => {
  stopKeepAliveScheduler();
});

process.on("SIGTERM", () => {
  stopKeepAliveScheduler();
});
