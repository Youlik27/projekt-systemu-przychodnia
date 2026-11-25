import { Router } from "express";
import {
  authenticateToken,
  requireRole
} from "../middleware/auth.middleware.js";
import {
  getMyReservations,
  getReservation,
  patchCancelReservation,
  patchRescheduleReservation,
  postReservation
} from "../controllers/reservation.controller.js";

// Endpointy pacjenta. Pracownik przychodni ma osobne endpointy w staff.routes.ts.
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

// WF-08: zmiana terminu własnej wizyty – body: { termId }
router.patch("/reservations/:id/reschedule", ...patientOnly, patchRescheduleReservation);

export default router;
