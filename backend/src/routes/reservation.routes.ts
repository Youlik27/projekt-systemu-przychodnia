import { Router } from "express";
import {
  authenticateToken,
  requireRole
} from "../middleware/auth.middleware.js";
import { postReservation } from "../controllers/reservation.controller.js";

const router = Router();

router.post(
  "/reservations",
  authenticateToken,
  requireRole("patient"),
  postReservation
);

export default router;