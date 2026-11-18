import { Router } from "express";
import {
  authenticateToken,
  requireRole
} from "../middleware/auth.middleware.js";
import {
  getMyReservations,
  getReservation,
  patchCancelReservation,
  postReservation
} from "../controllers/reservation.controller.js";

const router = Router();

const patientOnly = [authenticateToken, requireRole("patient")];

// WF-03: rezerwacja wizyty
router.post("/reservations", ...patientOnly, postReservation);

// WF-06: lista własnych wizyt („Moje wizyty”)
router.get("/reservations/me", ...patientOnly, getMyReservations);

// Szczegóły jednej własnej wizyty
router.get("/reservations/:id", ...patientOnly, getReservation);

// WF-07: anulowanie własnej wizyty
router.patch("/reservations/:id/cancel", ...patientOnly, patchCancelReservation);

export default router;
