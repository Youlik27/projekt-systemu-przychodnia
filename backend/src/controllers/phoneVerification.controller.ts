import type { Request, Response } from "express";
import { pool, type Rows } from "../db.js";
import type { UserRole } from "../models.js";
import {
  sendVerificationCode,
  verifyPhoneCode,
} from "../services/phoneVerification.service.js";
import { generateToken } from "../services/auth.service.js";

const isValidPhone = (phone: unknown): phone is string =>
  typeof phone === "string" &&
  /^\+[1-9]\d{7,14}$/.test(phone);

// Надсилання SMS
export const postSendVerificationCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phoneNumber, purpose } = req.body ?? {};

    if (!isValidPhone(phoneNumber)) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy numer telefonu."
      });
      return;
    }

    if (purpose !== "register" && purpose !== "login") {
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

    await sendVerificationCode(
      phoneNumber,
      purpose 
    );

    res.status(200).json({
      success: true,
      message: "Kod weryfikacyjny został wysłany."
    });

  } catch (error) {
    console.error("Send verification code error:", error);

    res.status(500).json({
      success: false,
      message: "Nie udało się wysłać kodu weryfikacyjnego."
    });
  }
};

// Перевірка SMS
export const postVerifyPhoneCode = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { phoneNumber, code, purpose } = req.body ?? {};

    if (!isValidPhone(phoneNumber)) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy numer telefonu."
      });
      return;
    }

    if (typeof code !== "string" || !/^\d{6}$/.test(code)) {
      res.status(400).json({
        success: false,
        message: "Kod musi składać się z 6 cyfr."
      });
      return;
    }

    if (purpose !== "register" && purpose !== "login") {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy cel weryfikacji."
      });
      return;
    }

    const verification = await verifyPhoneCode(
  phoneNumber,
  code,
  purpose
);

if (!verification.verified) {
  res.status(400).json({
    success: false,
    verified: false,
    message: "Nieprawidłowy lub wygasły kod."
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

    // Під час реєстрації поки лише підтверджуємо номер
    res.status(200).json({
      success: true,
      verified: true,
      message: "Numer telefonu został zweryfikowany."
    });

  } catch (error) {
    console.error("Verify phone code error:", error);

    res.status(500).json({
      success: false,
      message: "Wystąpił błąd podczas weryfikacji numeru telefonu."
    });
  }
};