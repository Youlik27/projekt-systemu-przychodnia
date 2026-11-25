// =====================================================================
// Panel pracownika przychodni / rejestratora (dokumentacja 4.2 „Moduł Harmonogramu
// i Administracji”). Wszystkie endpointy wymagają tokenu z rolą "staff" (WNF-03).
//
//   WF-10 – harmonogram: podgląd, dodawanie terminów, blokowanie, usuwanie,
//   WF-11 – rezerwacje: lista, szczegóły, zapis pacjenta, anulowanie, przeniesienie,
//           oznaczenie wizyty jako odbytej / nieobecności,
//   WF-12 – ręczne uruchomienie przypomnień SMS.
//
// Kontroler tylko sprawdza dane wejściowe i formatuje odpowiedź;
// logika biznesowa jest w services/schedule.service.ts i services/reservation.service.ts.
// =====================================================================

import type { Request, Response } from "express";
import { config } from "../config.js";
import type { ReservationStatus } from "../models.js";
import {
  cancelReservation,
  getReservation,
  listReservations,
  rescheduleReservation,
  setVisitOutcome,
  staffCreateReservation,
  type Actor,
  type ReservationFilters
} from "../services/reservation.service.js";
import {
  createSlots,
  daysBetween,
  deleteTerm,
  getDoctorSchedule,
  listAllDoctors,
  setTermAvailability,
  timeToMinutes
} from "../services/schedule.service.js";
import { sendDueReminders } from "../services/reminder.service.js";
import { parseReservationId, parseTermId } from "./reservation.controller.js";
import {
  type FieldErrors,
  isPositiveInt,
  isPositiveIntString,
  isValidIsoDate,
  isValidName,
  isValidPhone,
  isValidTime
} from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

const RESERVATION_STATUSES: ReservationStatus[] = ["active", "cancelled", "completed", "no_show"];

/** Zalogowany pracownik jako „aktor” operacji (trasa ma już requireRole("staff")). */
const staffActor = (req: Request): Actor => ({ role: "staff", userId: req.user!.id });

const badRequest = (res: Response, message: string, errors?: FieldErrors): void => {
  res.status(400).json({ success: false, message, ...(errors && { errors }) });
};

/** ID terminu z adresu (/staff/terms/:id); null = odpowiedź 400 już wysłana. */
const parseTermIdParam = (req: Request, res: Response): number | null => {
  const { id } = req.params;

  if (!isPositiveIntString(id)) {
    badRequest(res, "Nieprawidłowy identyfikator terminu.");
    return null;
  }

  return Number(id);
};

// ===========================================================================
// WF-10: harmonogram
// ===========================================================================

// GET /api/staff/doctors – wszyscy lekarze (także nieaktywni)
export const getStaffDoctors = async (_req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({ success: true, doctors: await listAllDoctors() });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff doctors error", "Nie udało się pobrać listy lekarzy.");
  }
};

// GET /api/staff/schedule?doctorId=1&from=2026-11-23&to=2026-11-27
export const getSchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { doctorId, from } = req.query;
    // Brak "to" = jeden dzień
    const to = req.query.to ?? from;

    if (!isPositiveIntString(doctorId)) {
      badRequest(res, "Wybierz lekarza (parametr doctorId).");
      return;
    }

    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      badRequest(res, "Podaj zakres dat w formacie RRRR-MM-DD (parametry from i to).");
      return;
    }

    const range = daysBetween(from, to);

    if (range < 0 || range >= config.maxScheduleRangeDays) {
      badRequest(res, `Zakres dat musi mieć od 1 do ${config.maxScheduleRangeDays} dni.`);
      return;
    }

    const schedule = await getDoctorSchedule(Number(doctorId), from, to);

    res.status(200).json({ success: true, from, to, ...schedule });
  } catch (error) {
    sendUnexpectedError(res, error, "Get schedule error", "Nie udało się pobrać harmonogramu.");
  }
};

// POST /api/staff/terms – dodanie terminów (generowanie slotów)
// body: { doctorId, dateFrom, dateTo?, startTime, endTime, slotMinutes, cabinet?, skipWeekends? }
export const postTerms = async (req: Request, res: Response): Promise<void> => {
  try {
    const body = req.body ?? {};
    const dateTo = body.dateTo ?? body.dateFrom;
    const errors: FieldErrors = {};

    if (!isPositiveInt(body.doctorId)) errors.doctorId = "Wybierz lekarza.";
    if (!isValidIsoDate(body.dateFrom)) errors.dateFrom = "Podaj datę w formacie RRRR-MM-DD.";
    if (!isValidIsoDate(dateTo)) errors.dateTo = "Podaj datę w formacie RRRR-MM-DD.";
    if (!isValidTime(body.startTime)) errors.startTime = "Podaj godzinę w formacie GG:MM.";
    if (!isValidTime(body.endTime)) errors.endTime = "Podaj godzinę w formacie GG:MM.";

    if (
      typeof body.slotMinutes !== "number" ||
      !Number.isInteger(body.slotMinutes) ||
      body.slotMinutes < 5 ||
      body.slotMinutes > 240
    ) {
      errors.slotMinutes = "Długość wizyty: od 5 do 240 minut.";
    }

    if (
      body.cabinet !== undefined &&
      body.cabinet !== null &&
      (typeof body.cabinet !== "string" || body.cabinet.trim().length === 0 || body.cabinet.trim().length > 20)
    ) {
      errors.cabinet = "Numer gabinetu: maks. 20 znaków.";
    }

    if (body.skipWeekends !== undefined && typeof body.skipWeekends !== "boolean") {
      errors.skipWeekends = "Wartość musi być true albo false.";
    }

    // Sprawdzenia zależne od kilku pól – tylko gdy pojedyncze pola są poprawne
    if (!errors.startTime && !errors.endTime && timeToMinutes(body.endTime) <= timeToMinutes(body.startTime)) {
      errors.endTime = "Godzina końca musi być późniejsza niż godzina początku.";
    }

    if (!errors.dateFrom && !errors.dateTo) {
      const range = daysBetween(body.dateFrom, dateTo);
      if (range < 0) errors.dateTo = "Data końcowa nie może być wcześniejsza niż początkowa.";
      else if (range >= config.maxScheduleRangeDays)
        errors.dateTo = `Zakres może mieć maksymalnie ${config.maxScheduleRangeDays} dni.`;
    }

    if (Object.keys(errors).length > 0) {
      badRequest(res, "Nieprawidłowe dane terminów.", errors);
      return;
    }

    const result = await createSlots({
      doctorId: body.doctorId,
      dateFrom: body.dateFrom,
      dateTo,
      startTime: body.startTime,
      endTime: body.endTime,
      slotMinutes: body.slotMinutes,
      cabinet: typeof body.cabinet === "string" ? body.cabinet.trim() : null,
      skipWeekends: body.skipWeekends ?? true
    });

    res.status(201).json({
      success: true,
      message: `Dodano terminów: ${result.created.length}. Pominięto: ${result.skipped.length}.`,
      ...result
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Create terms error", "Nie udało się dodać terminów.");
  }
};

// PATCH /api/staff/terms/:id – body: { status: "blocked" | "free" }
export const patchTerm = async (req: Request, res: Response): Promise<void> => {
  try {
    const termId = parseTermIdParam(req, res);
    if (termId === null) return;

    const { status } = req.body ?? {};

    if (status !== "free" && status !== "blocked") {
      badRequest(res, 'Status terminu musi mieć wartość "free" (wolny) lub "blocked" (zablokowany).');
      return;
    }

    const term = await setTermAvailability(termId, status);

    res.status(200).json({
      success: true,
      message: status === "blocked" ? "Termin został zablokowany." : "Termin jest znowu dostępny.",
      term
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Update term error", "Nie udało się zmienić terminu.");
  }
};

// DELETE /api/staff/terms/:id
export const removeTerm = async (req: Request, res: Response): Promise<void> => {
  try {
    const termId = parseTermIdParam(req, res);
    if (termId === null) return;

    await deleteTerm(termId);

    res.status(200).json({ success: true, message: "Termin został usunięty." });
  } catch (error) {
    sendUnexpectedError(res, error, "Delete term error", "Nie udało się usunąć terminu.");
  }
};

// ===========================================================================
// WF-11: rezerwacje pacjentów
// ===========================================================================

// GET /api/staff/reservations?from=&to=&doctorId=&status=&patient=
export const getStaffReservations = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, doctorId, status, patient } = req.query;
    const filters: ReservationFilters = {};

    if (from !== undefined) {
      if (!isValidIsoDate(from)) return badRequest(res, "Nieprawidłowa data from (RRRR-MM-DD).");
      filters.from = from;
    }

    if (to !== undefined) {
      if (!isValidIsoDate(to)) return badRequest(res, "Nieprawidłowa data to (RRRR-MM-DD).");
      filters.to = to;
    }

    if (doctorId !== undefined) {
      if (!isPositiveIntString(doctorId)) return badRequest(res, "Nieprawidłowe ID lekarza.");
      filters.doctorId = Number(doctorId);
    }

    if (status !== undefined) {
      if (!RESERVATION_STATUSES.includes(status as ReservationStatus))
        return badRequest(res, `Status musi być jednym z: ${RESERVATION_STATUSES.join(", ")}.`);
      filters.status = status as ReservationStatus;
    }

    if (patient !== undefined) {
      if (typeof patient !== "string" || patient.trim().length < 2 || patient.length > 50)
        return badRequest(res, "Wyszukiwanie pacjenta: od 2 do 50 znaków (telefon lub nazwisko).");
      filters.patient = patient.trim();
    }

    const reservations = await listReservations(filters);

    res.status(200).json({ success: true, reservations });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff reservations error", "Nie udało się pobrać rezerwacji.");
  }
};

// GET /api/staff/reservations/:id
export const getStaffReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await getReservation(staffActor(req), reservationId);

    res.status(200).json({ success: true, reservation });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff reservation error", "Nie udało się pobrać rezerwacji.");
  }
};

// POST /api/staff/reservations – zapis pacjenta przez rejestrację
// body: { termId, phoneNumber, firstName, lastName }
export const postStaffReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { termId, phoneNumber, firstName, lastName } = req.body ?? {};
    const errors: FieldErrors = {};

    if (!isPositiveInt(termId)) errors.termId = "Wybierz termin.";
    if (!isValidPhone(phoneNumber)) errors.phoneNumber = "Podaj numer telefonu w formacie +48XXXXXXXXX.";
    if (!isValidName(firstName)) errors.firstName = "Podaj poprawne imię.";
    if (!isValidName(lastName)) errors.lastName = "Podaj poprawne nazwisko.";

    if (Object.keys(errors).length > 0) {
      badRequest(res, "Nieprawidłowe dane pacjenta lub terminu.", errors);
      return;
    }

    const result = await staffCreateReservation({
      termId,
      phoneNumber,
      firstName: firstName.trim(),
      lastName: lastName.trim()
    });

    res.status(201).json({
      success: true,
      message: result.patientCreated
        ? "Wizyta została zarezerwowana. Utworzono nowe konto pacjenta."
        : "Wizyta została zarezerwowana.",
      ...result
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff create reservation error", "Nie udało się zarezerwować wizyty.");
  }
};

// PATCH /api/staff/reservations/:id/cancel
export const patchStaffCancel = async (req: Request, res: Response): Promise<void> => {
  try {
    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const reservation = await cancelReservation(staffActor(req), reservationId);

    res.status(200).json({
      success: true,
      message: "Wizyta została anulowana. Pacjent otrzyma SMS z informacją.",
      reservation
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff cancel error", "Nie udało się anulować wizyty.");
  }
};

// PATCH /api/staff/reservations/:id/reschedule – body: { termId }
export const patchStaffReschedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const termId = parseTermId(req, res);
    if (termId === null) return;

    const reservation = await rescheduleReservation(staffActor(req), reservationId, termId);

    res.status(200).json({
      success: true,
      message: "Wizyta została przeniesiona. Pacjent otrzyma SMS z nowym terminem.",
      reservation
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Staff reschedule error", "Nie udało się przenieść wizyty.");
  }
};

// PATCH /api/staff/reservations/:id/status – body: { status: "completed" | "no_show" }
export const patchVisitOutcome = async (req: Request, res: Response): Promise<void> => {
  try {
    const reservationId = parseReservationId(req, res);
    if (reservationId === null) return;

    const { status } = req.body ?? {};

    if (status !== "completed" && status !== "no_show") {
      badRequest(res, 'Status musi mieć wartość "completed" (odbyta) lub "no_show" (nieobecność).');
      return;
    }

    const reservation = await setVisitOutcome(reservationId, status);

    res.status(200).json({
      success: true,
      message: status === "completed" ? "Wizyta oznaczona jako odbyta." : "Oznaczono nieobecność pacjenta.",
      reservation
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Visit outcome error", "Nie udało się zmienić statusu wizyty.");
  }
};

// ===========================================================================
// WF-12: ręczne uruchomienie przypomnień SMS
// ===========================================================================

// POST /api/staff/reminders/run
export const postRunReminders = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await sendDueReminders();

    res.status(200).json({
      success: true,
      message: `Wysłano przypomnień: ${result.sent}.`,
      ...result
    });
  } catch (error) {
    sendUnexpectedError(res, error, "Run reminders error", "Nie udało się wysłać przypomnień.");
  }
};
