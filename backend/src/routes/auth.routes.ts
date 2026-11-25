import { Router } from "express";
import { getMe, postRegister } from "../controllers/auth.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// WF-04: założenie konta pacjenta po weryfikacji numeru telefonu
router.post("/auth/register", postRegister);

// Dane zalogowanego użytkownika (pacjenta lub pracownika)
router.get("/auth/me", authenticateToken, getMe);

export default router;
