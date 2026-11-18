import type { Request, Response } from "express";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import type { UserRole } from "../models.js";
import {
  sendVerificationCode,
  SmsDeliveryError,
  verifyPhoneCode,
  type VerificationPurpose
} from "../services/phoneVerification.service.js";
import { generateToken } from "../services/auth.service.js";
import { isValidPhone } from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

const isValidPurpose = (purpose: unknown): purpose is VerificationPurpose =>
  purpose === "register" || purpose === "login";

const INVALID_PHONE_MESSAGE =
  "Nieprawidłowy numer telefonu. Podaj numer w formacie +48XXXXXXXXX.";

// Komunikat z dokumentacji (UC.Wizyta.Alt02)
const INVALID_CODE_MESSAGE = "Wprowadzony kod jest nieprawidłowy lub wygasł.";

// Wysyłanie kodu SMS
export const postSendVerificationCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phoneNumber, purpose } = req.body ?? {};

    if (!isValidPhone(phoneNumber)) {
      res.status(400).json({
        success: false,
        message: INVALID_PHONE_MESSAGE,
        errors: { phoneNumber: INVALID_PHONE_MESSAGE }
      });
      return;
    }

    if (!isValidPurpose(purpose)) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy cel weryfikacji."
      });
      return;
    }

    const [users] = await pool.execute<
      Rows<{ ID: number; Role: UserRole }>
    >(
      `SELECT ID, Role FROM \`User\` WHERE PhoneNumber = ?`,
      [phoneNumber]
    );

    if (purpose === "register" && users.length > 0) {
      res.status(409).json({
        success: false,
        message: "Użytkownik z tym numerem telefonu już istnieje."
      });
      return;
    }

    if (
      purpose === "login" &&
      (users.length === 0 || users[0].Role !== "patient")
    ) {
      res.status(404).json({
        success: false,
        message: "Nie znaleziono pacjenta."
      });
      return;
    }

    await sendVerificationCode(phoneNumber, purpose);

    res.status(200).json({
      success: true,
      message: "Kod weryfikacyjny został wysłany.",
      codeLength: config.otpLength,
      expiresInMinutes: config.otpExpirationMinutes
    });

  } catch (error) {
    // UC.B03 – błąd wysyłania SMS: pacjent może ponowić próbę
    if (error instanceof SmsDeliveryError) {
      console.error("SMS delivery error:", error.cause);

      res.status(503).json({
        success: false,
        message:
          "Nie udało się wysłać kodu SMS. Spróbuj ponownie za chwilę – wiadomość może też dotrzeć z opóźnieniem."
      });
      return;
    }

    sendUnexpectedError(
      res,
      error,
      "Send verification code error",
      "Nie udało się wysłać kodu weryfikacyjnego."
    );
  }
};

// Weryfikacja kodu SMS
export const postVerifyPhoneCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phoneNumber, code, purpose } = req.body ?? {};

    if (!isValidPhone(phoneNumber)) {
      res.status(400).json({
        success: false,
        message: INVALID_PHONE_MESSAGE,
        errors: { phoneNumber: INVALID_PHONE_MESSAGE }
      });
      return;
    }

    const codePattern = new RegExp(`^\\d{${config.otpLength}}$`);

    if (typeof code !== "string" || !codePattern.test(code)) {
      const message = `Kod musi składać się z ${config.otpLength} cyfr.`;

      res.status(400).json({
        success: false,
        message,
        errors: { code: message }
      });
      return;
    }

    if (!isValidPurpose(purpose)) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy cel weryfikacji."
      });
      return;
    }

    const verification = await verifyPhoneCode(phoneNumber, code, purpose);

    if (!verification.verified) {
      res.status(400).json({
        success: false,
        verified: false,
        message: INVALID_CODE_MESSAGE,
        errors: { code: INVALID_CODE_MESSAGE }
      });
      return;
    }

    if (purpose === "login") {
      if (verification.userId === undefined) {
        res.status(404).json({
          success: false,
          message: "Nie znaleziono pacjenta."
        });
        return;
      }

      const token = generateToken({
        id: verification.userId,
        role: "patient"
      });

      res.status(200).json({
        success: true,
        verified: true,
        token,
        user: {
          id: verification.userId,
          role: "patient"
        }
      });
      return;
    }

    // Przy rejestracji tylko potwierdzamy numer – konto tworzy /auth/register
    res.status(200).json({
      success: true,
      verified: true,
      message: "Numer telefonu został zweryfikowany."
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Verify phone code error",
      "Wystąpił błąd podczas weryfikacji numeru telefonu."
    );
  }
};
