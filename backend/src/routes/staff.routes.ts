import { Router } from "express";
import { authenticateToken, requireRole } from "../middleware/auth.middleware.js";
import {
  getSchedule,
  getStaffDoctors,
  getStaffReservation,
  getStaffReservations,
  patchStaffCancel,
  patchStaffReschedule,
  patchTerm,
  patchVisitOutcome,
  postRunReminders,
  postStaffReservation,
  postTerms,
  removeTerm
} from "../controllers/staff.controller.js";

// =====================================================================
// Panel pracownika przychodni – wszystkie trasy /api/staff/* wymagają
// zalogowania kodem SMS z rolą "staff" (POST /api/phone-verification/verify
// z polem "role": "staff"). Pacjent dostaje 403 (WNF-03).
// =====================================================================
const router = Router();

router.use("/staff", authenticateToken, requireRole("staff"));

// ----- WF-10: harmonogram -----
router.get("/staff/doctors", getStaffDoctors);
router.get("/staff/schedule", getSchedule);           // ?doctorId=&from=&to=
router.post("/staff/terms", postTerms);               // dodanie terminów
router.patch("/staff/terms/:id", patchTerm);          // { status: "blocked" | "free" }
router.delete("/staff/terms/:id", removeTerm);

// ----- WF-11: rezerwacje -----
router.get("/staff/reservations", getStaffReservations);       // ?from=&to=&doctorId=&status=&patient=
router.post("/staff/reservations", postStaffReservation);      // zapis pacjenta przez rejestrację
router.get("/staff/reservations/:id", getStaffReservation);
router.patch("/staff/reservations/:id/cancel", patchStaffCancel);
router.patch("/staff/reservations/:id/reschedule", patchStaffReschedule); // { termId }
router.patch("/staff/reservations/:id/status", patchVisitOutcome);        // { status }

// ----- WF-12: przypomnienia SMS -----
router.post("/staff/reminders/run", postRunReminders);

export default router;
