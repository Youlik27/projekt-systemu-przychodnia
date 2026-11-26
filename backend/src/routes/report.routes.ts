
import { Router } from "express";
import {
  authenticateToken,
  requireRole
} from "../middleware/auth.middleware.js";

import {
  getStaffReport
} from "../controllers/report.controller.js";

const router = Router();

router.get(
  "/staff/reports",
  authenticateToken,
  requireRole("staff"),
  getStaffReport
);

export default router;
