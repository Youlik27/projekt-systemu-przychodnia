import { Router } from "express";

import {
  postSendVerificationCode,
  postVerifyPhoneCode
} from "../controllers/phoneVerification.controller.js";

import {
  otpIpLimiter,
  otpPhoneLimiter
} from "../middleware/rateLimit.middleware.js";

const router = Router();

// Надсилання SMS із двома обмеженнями
router.post(
  "/phone-verification/send",
  otpIpLimiter,
  otpPhoneLimiter,
  postSendVerificationCode
);

// Перевірка SMS-коду
router.post(
  "/phone-verification/verify",
  otpIpLimiter,
  postVerifyPhoneCode
);

export default router;