import { Router } from "express";

import {
  postSendVerificationCode,
  postVerifyPhoneCode
} from "../controllers/phoneVerification.controller.js";

import {
  otpSendIpLimiter,
  otpPhoneLimiter,
  otpVerifyIpLimiter
} from "../middleware/rateLimit.middleware.js";

const router = Router();

// Wysyłanie kodu SMS – limit za IP oraz za numerem telefonu
router.post(
  "/phone-verification/send",
  otpSendIpLimiter,
  otpPhoneLimiter,
  postSendVerificationCode
);

// Weryfikacja kodu SMS – osobny limit za IP
router.post(
  "/phone-verification/verify",
  otpVerifyIpLimiter,
  postVerifyPhoneCode
);

export default router;
