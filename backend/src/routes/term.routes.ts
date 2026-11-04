
import { Router } from "express";
import { getAvailableTerms } from "../controllers/term.controller.js";

const router = Router();

router.get("/terms", getAvailableTerms);

export default router;
