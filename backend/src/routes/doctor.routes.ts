
import { Router } from "express";
import {
  getDoctors,
  getSpecializations
} from "../controllers/doctor.controller.js";

const router = Router();

router.get("/doctors", getDoctors);
router.get("/specializations", getSpecializations);

export default router;
