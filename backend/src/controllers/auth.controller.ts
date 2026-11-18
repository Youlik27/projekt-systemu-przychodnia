import type { Request, Response } from "express";
import {
  registerPatient,
  generateToken
} from "../services/auth.service.js";
import {
  type FieldErrors,
  isOptionalEmpty,
  isValidBirthDate,
  isValidName,
  isValidPhone
} from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

// Rejestracja nowego pacjenta (WF-04).
// Wymagane: imię, nazwisko, telefon. Adres i data urodzenia są opcjonalne.
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

    // UC.B02 – wskazujemy konkretne pola wymagające poprawy
    const errors: FieldErrors = {};

    if (!isValidName(firstName)) {
      errors.firstName = "Podaj poprawne imię.";
    }

    if (!isValidName(lastName)) {
      errors.lastName = "Podaj poprawne nazwisko.";
    }

    if (!isValidPhone(phoneNumber)) {
      errors.phoneNumber =
        "Podaj numer telefonu w formacie +48XXXXXXXXX.";
    }

    const hasAddress = !isOptionalEmpty(address);

    if (
      hasAddress &&
      (typeof address !== "string" || address.trim().length > 255)
    ) {
      errors.address = "Adres jest nieprawidłowy (maks. 255 znaków).";
    }

    const hasBirthDate = !isOptionalEmpty(birthDate);

    if (hasBirthDate && !isValidBirthDate(birthDate)) {
      errors.birthDate =
        "Podaj poprawną datę urodzenia w formacie RRRR-MM-DD.";
    }

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowe lub niekompletne dane pacjenta.",
        errors
      });
      return;
    }

    const patient = {
      firstName: (firstName as string).trim(),
      lastName: (lastName as string).trim(),
      phoneNumber: phoneNumber as string,
      address: hasAddress ? (address as string).trim() : null,
      birthDate: hasBirthDate ? (birthDate as string) : null
    };

    const userId = await registerPatient(patient);
    const token = generateToken({ id: userId, role: "patient" });

    res.status(201).json({
      success: true,
      message: "Rejestracja zakończona pomyślnie.",
      token,
      user: {
        id: userId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        role: "patient"
      }
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Registration error",
      "Wystąpił błąd podczas rejestracji."
    );
  }
};
