import type { Request, Response } from "express";
import {
  cancelReservation,
  createReservation,
  getPatientReservation,
  getPatientReservations
} from "../services/reservation.service.js";
import { isPositiveInt, isPositiveIntString } from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

const requireUserId = (req: Request, res: Response): number | null => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Wymagane jest zalogowanie."
    });
    return null;
  }

  return req.user.id;
};

const parseReservationId = (req: Request, res: Response): number | null => {
  const { id } = req.params;

  if (!isPositiveIntString(id)) {
    res.status(400).json({
      success: false,
      message: "Nieprawidłowy identyfikator rezerwacji."
    });
    return null;
  }

  return Number(id);
};

// POST /api/reservations – WF-03, odpowiedź zawiera dane do potwierdzenia (WF-09)
export const postReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (userId === null) return;

    const { termId } = req.body ?? {};

    if (!isPositiveInt(termId)) {
      res.status(400).json({
        success: false,
        message: "Nieprawidłowy identyfikator terminu.",
        errors: { termId: "Wybierz termin z listy dostępnych terminów." }
      });
      return;
    }

    const reservation = await createReservation(userId, termId);

    res.status(201).json({
      success: true,
      message: "Wizyta została zarezerwowana!",
      reservationId: reservation.id,
      reservation
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Create reservation error",
      "Wystąpił błąd podczas rezerwacji wizyty."
    );
  }
};

// GET /api/reservations/me – WF-06
export const getMyReservations = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (userId === null) return;

    const reservations = await getPatientReservations(userId);

    res.status(200).json({
      success: true,
      reservations
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Get patient reservations error",
      "Nie udało się pobrać listy wizyt."
    );
  }
};

// GET /api/reservations/:id – szczegóły jednej własnej rezerwacji
export const getReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (userId === null) return;

    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await getPatientReservation(userId, reservationId);

    res.status(200).json({
      success: true,
      reservation
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Get reservation error",
      "Nie udało się pobrać szczegółów wizyty."
    );
  }
};

// PATCH /api/reservations/:id/cancel – WF-07
export const patchCancelReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (userId === null) return;

    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await cancelReservation(userId, reservationId);

    res.status(200).json({
      success: true,
      message: "Wizyta została anulowana.",
      reservation
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Cancel reservation error",
      "Wystąpił błąd podczas anulowania wizyty."
    );
  }
};
