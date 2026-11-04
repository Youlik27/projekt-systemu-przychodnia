import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

// Обмеження за IP-адресою
export const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Zbyt wiele prób. Spróbuj ponownie za 15 minut."
  }
});

// Обмеження за номером телефону
export const otpPhoneLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  keyGenerator: (req: Request) => {
    const phoneNumber = req.body?.phoneNumber;

    if (
      typeof phoneNumber === "string" &&
      /^\+[1-9]\d{7,14}$/.test(phoneNumber)
    ) {
      return `phone:${phoneNumber}`;
    }

    return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },

  message: {
    success: false,
    message: "Limit wysyłania kodów został osiągnięty. Spróbuj ponownie za 15 minut."
  }
});