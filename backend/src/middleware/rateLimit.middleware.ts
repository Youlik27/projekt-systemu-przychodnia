import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { config } from "../config.js";
import { isValidPhone } from "../utils/validation.js";

const WINDOW_MS = 15 * 60 * 1000;

// W testach automatycznych limity są wyłączone, żeby nie blokować kolejnych scenariuszy.
const skipInTests = () => config.isTest;

// Każdy endpoint ma WŁASNY licznik – wcześniej jeden limiter był
// współdzielony przez /send i /verify, więc 10 żądań łącznie blokowało oba.

// Wysyłanie kodów: ograniczenie za adresem IP
export const otpSendIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Zbyt wiele prób. Spróbuj ponownie za 15 minut."
  }
});

// Wysyłanie kodów: ograniczenie za numerem telefonu (WNF-04)
export const otpPhoneLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 3,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,

  keyGenerator: (req: Request) => {
    const phoneNumber = req.body?.phoneNumber;

    if (isValidPhone(phoneNumber)) {
      return `phone:${phoneNumber}`;
    }

    return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
  },

  message: {
    success: false,
    message: "Limit wysyłania kodów został osiągnięty. Spróbuj ponownie za 15 minut."
  }
});

// Weryfikacja kodów: ograniczenie za adresem IP.
// Liczba prób dla pojedynczego kodu jest dodatkowo ograniczona w bazie (MAX_ATTEMPTS).
export const otpVerifyIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: "Zbyt wiele prób weryfikacji. Spróbuj ponownie za 15 minut."
  }
});
