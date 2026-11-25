import express from "express";
import cors from "cors";
import { config } from "./config.js";
import termRoutes from "./routes/term.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import phoneVerificationRoutes from "./routes/phoneVerification.routes.js";
import authRoutes from "./routes/auth.routes.js";
import staffRoutes from "./routes/staff.routes.js";
import {
  errorHandler,
  notFoundHandler
} from "./middleware/error.middleware.js";

// Aplikacja jest tworzona osobno od uruchomienia serwera,
// dzięki czemu testy mogą ją startować na losowym porcie.
export const createApp = () => {
  const app = express();

  app.disable("x-powered-by");
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api", doctorRoutes);
  app.use("/api", termRoutes);
  app.use("/api", reservationRoutes);
  app.use("/api", phoneVerificationRoutes);
  app.use("/api", authRoutes);
  // Panel pracownika przychodni (WF-10, WF-11, WF-12) – tylko rola "staff"
  app.use("/api", staffRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
