import type { Request, Response } from "express";
import {
  createReservation,
  ReservationError
} from "../services/reservation.service.js";

export const postReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Wymagane jest zalogowanie."
      });
      return;
    }

    const { termId } = req.body ?? {};

    if (
      typeof termId !== "number" ||
      !Number.isSafeInteger(termId) ||
      termId <= 0
    ) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy identyfikator terminu."
      });
      return;
    }

    const result = await createReservation(
      req.user.id,
      termId
    );

    res.status(201).json({
      success: true,
      message: "Wizyta została pomyślnie zarezerwowana.",
      reservationId: result.reservationId
    });

  } catch (error) {
    if (error instanceof ReservationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message
      });
      return;
    }

    console.error("Create reservation error:", error);

    res.status(500).json({
      success: false,
      message: "Wystąpił błąd podczas rezerwacji wizyty."
    });
  }
};