import type { Request, Response } from "express";
import {
  AuthError,
  registerPatient,
  generateToken
} from "../services/auth.service.js";

// Перевірка коректності дати народження
const isValidBirthDate = (date: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  const isRealDate =
    parsedDate.getUTCFullYear() === year &&
    parsedDate.getUTCMonth() === month - 1 &&
    parsedDate.getUTCDate() === day;

  if (!isRealDate) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const birthDate = new Date(year, month - 1, day);

  return birthDate <= today;
};

// Реєстрація нового пацієнта
export const postRegister = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      firstName,
      lastName,
      address,
      birthDate,
      phoneNumber
    } = req.body ?? {};

    if (
      typeof firstName !== "string" || !firstName.trim() ||
      typeof lastName !== "string" || !lastName.trim() ||
      typeof address !== "string" || !address.trim() ||
      typeof birthDate !== "string" ||
      !isValidBirthDate(birthDate) ||
      typeof phoneNumber !== "string" ||
      !/^\+[1-9]\d{7,14}$/.test(phoneNumber)
    ) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowe lub niekompletne dane pacjenta."
      });
      return;
    }

    const userId = await registerPatient({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      address: address.trim(),
      birthDate,
      phoneNumber
    });

    const token = generateToken({ id: userId, role: "patient" });

    res.status(201).json({
      success: true,
      message: "Rejestracja zakończona pomyślnie.",
      token,
      user: {
        id: userId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: "patient"
      }
    });

  } catch (error) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
      return;
    }

    console.error("Registration error:", error);

    res.status(500).json({
      success: false,
      message: "Wystąpił błąd podczas rejestracji."
    });
  }
};

