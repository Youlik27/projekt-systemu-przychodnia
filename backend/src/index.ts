
import express from "express";
import cors from "cors";
import "dotenv/config";
import termRoutes from "./routes/term.routes.js";
import reservationRoutes from "./routes/reservation.routes.js";
import doctorRoutes from "./routes/doctor.routes.js";
import phoneVerificationRoutes from "./routes/phoneVerification.routes.js";
import authRoutes from "./routes/auth.routes.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json());

app.use("/api", doctorRoutes);
app.use("/api", termRoutes);
app.use("/api", reservationRoutes);
app.use("/api", phoneVerificationRoutes);
app.use("/api", authRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
