// =====================================================================
// Endpointy rezerwacji dla PACJENTA (wymagają tokenu z rolą "patient").
// Pacjent ma dostęp wyłącznie do własnych wizyt – cudza wizyta zwraca 404.
// =====================================================================

import type { Request, Response } from "express";
import {
  cancelReservation,
  createReservation,
  getPatientReservation,
  getPatientReservations,
  rescheduleReservation,
  type Actor
} from "../services/reservation.service.js";
import { isPositiveInt, isPositiveIntString } from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

/** Zalogowany pacjent jako „aktor” operacji; null = odpowiedź 401 już wysłana. */
export const requirePatientActor = (req: Request, res: Response): Actor | null => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: "Wymagane jest zalogowanie."
    });
    return null;
  }

  return { role: "patient", userId: req.user.id };
};

/** ID rezerwacji z adresu (/reservations/:id); null = odpowiedź 400 już wysłana. */
export const parseReservationId = (req: Request, res: Response): number | null => {
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

/** termId z treści żądania; null = odpowiedź 400 już wysłana. */
export const parseTermId = (req: Request, res: Response): number | null => {
  const { termId } = req.body ?? {};

  if (!isPositiveInt(termId)) {
    res.status(400).json({
      success: false,
      message: "Nieprawidłowy identyfikator terminu.",
      errors: { termId: "Wybierz termin z listy dostępnych terminów." }
    });
    return null;
  }

  return termId;
};

// POST /api/reservations – WF-03, odpowiedź zawiera dane do potwierdzenia (WF-09)
export const postReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const actor = requirePatientActor(req, res);
    if (!actor) return;

    const termId = parseTermId(req, res);
    if (termId === null) return;

    const reservation = await createReservation(actor.userId, termId);

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
    const actor = requirePatientActor(req, res);
    if (!actor) return;

    const reservations = await getPatientReservations(actor.userId);

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
    const actor = requirePatientActor(req, res);
    if (!actor) return;

    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await getPatientReservation(actor.userId, reservationId);

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
    const actor = requirePatientActor(req, res);
    if (!actor) return;

    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await cancelReservation(actor, reservationId);

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

// PATCH /api/reservations/:id/reschedule  { termId } – WF-08
export const patchRescheduleReservation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const actor = requirePatientActor(req, res);
    if (!actor) return;

    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const termId = parseTermId(req, res);
    if (termId === null) return;

    const reservation = await rescheduleReservation(actor, reservationId, termId);

    res.status(200).json({
      success: true,
      message: "Termin wizyty został zmieniony.",
      reservation
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Reschedule reservation error",
      "Wystąpił błąd podczas zmiany terminu wizyty."
    );
  }
};
