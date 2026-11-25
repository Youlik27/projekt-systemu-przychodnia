// =====================================================================
// WF-10: zarządzanie harmonogramem wizyt (panel pracownika przychodni).
//
//  - podgląd harmonogramu lekarza: wszystkie terminy w zakresie dat
//    wraz ze statusem i danymi pacjenta,
//  - dodawanie terminów: generowanie slotów (np. 9:00–12:00 co 30 min)
//    dla jednego dnia lub zakresu dni,
//  - blokowanie / odblokowanie wolnego terminu (np. urlop, szkolenie),
//  - usuwanie terminu dodanego przez pomyłkę.
//
// Kryterium akceptacji WF-10: termin zarezerwowany NIE może zostać
// udostępniony innym jako wolny bez wcześniejszego rozwiązania rezerwacji
// (anulowania lub przeniesienia – WF-11).
// =====================================================================

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import type { Doctor, ReservationStatus, TermStatus } from "../models.js";
import { AppError } from "../utils/errors.js";

/** Jeden termin w harmonogramie lekarza */
export interface ScheduleTerm {
  termId: number;
  doctorId: number;
  startDate: Date;
  endDate: Date;
  status: TermStatus;
  cabinet: string | null;
  isPast: boolean;
  /** Aktywna / zakończona rezerwacja tego terminu (anulowanych nie pokazujemy) */
  reservation: {
    id: number;
    status: ReservationStatus;
    patient: {
      id: number;
      firstName: string;
      lastName: string;
      phoneNumber: string;
    };
  } | null;
}

interface ScheduleRow {
  TermID: number;
  DoctorID: number;
  StartDate: Date;
  EndDate: Date;
  Status: TermStatus;
  Cabinet: string | null;
  IsPast: number;
  ReservationID: number | null;
  ReservationStatus: ReservationStatus | null;
  PatientID: number | null;
  PatientFirstName: string | null;
  PatientLastName: string | null;
  PatientPhone: string | null;
}

const toScheduleTerm = (row: ScheduleRow): ScheduleTerm => ({
  termId: row.TermID,
  doctorId: row.DoctorID,
  startDate: row.StartDate,
  endDate: row.EndDate,
  status: row.Status,
  cabinet: row.Cabinet,
  isPast: row.IsPast === 1,
  reservation:
    row.ReservationID === null
      ? null
      : {
          id: row.ReservationID,
          status: row.ReservationStatus!,
          patient: {
            id: row.PatientID!,
            firstName: row.PatientFirstName!,
            lastName: row.PatientLastName!,
            phoneNumber: row.PatientPhone!
          }
        }
});

// Rezerwacja „nieanulowana” – na jednym terminie może być co najwyżej jedna
const SCHEDULE_SELECT = `
  SELECT
    t.TermID,
    t.DoctorID,
    t.StartDate,
    t.EndDate,
    t.Status,
    t.Cabinet,
    (t.StartDate <= NOW()) AS IsPast,
    r.ID AS ReservationID,
    r.Status AS ReservationStatus,
    u.ID AS PatientID,
    u.FirstName AS PatientFirstName,
    u.LastName AS PatientLastName,
    u.PhoneNumber AS PatientPhone
  FROM Terms t
  LEFT JOIN Reservation r
    ON r.TermsTermID = t.TermID
   AND r.TermsDoctorID = t.DoctorID
   AND r.Status <> 'cancelled'
  LEFT JOIN \`User\` u ON u.ID = r.UserID
`;

// ---------------------------------------------------------------------------
// Pomocnicze: daty i godziny jako tekst (bez stref czasowych)
//
// Terminy w bazie to DATETIME w czasie lokalnym przychodni. Sloty liczymy
// na napisach „RRRR-MM-DD” i minutach od północy, a do bazy wysyłamy
// „RRRR-MM-DD HH:MM:00” – dzięki temu strefa czasowa serwera Node nie ma znaczenia.
// ---------------------------------------------------------------------------

/** "09:30" → 570 */
export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** Kolejne dni od `from` do `to` włącznie, jako "RRRR-MM-DD" (obliczenia w UTC = bez przesunięć). */
const eachDay = (from: string, to: string): string[] => {
  const days: string[] = [];
  const current = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (current <= end) {
    days.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return days;
};

const isWeekend = (day: string): boolean => {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
};

export const daysBetween = (from: string, to: string): number =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000
  );

const getDoctor = async (
  executor: PoolConnection | typeof pool,
  doctorId: number
): Promise<Doctor> => {
  const [doctors] = await executor.execute<Rows<Doctor>>(
    `SELECT ID, FirstName, LastName, IsActive, Specialization
     FROM Doctor
     WHERE ID = ?`,
    [doctorId]
  );

  if (doctors.length === 0) {
    throw new AppError("Nie znaleziono lekarza.", 404);
  }

  return doctors[0];
};

// ---------------------------------------------------------------------------
// Lista wszystkich lekarzy (także nieaktywnych) – do wyboru w panelu pracownika
// ---------------------------------------------------------------------------
export const listAllDoctors = async (): Promise<Doctor[]> => {
  const [doctors] = await pool.execute<Rows<Doctor>>(
    `SELECT ID, FirstName, LastName, IsActive, Specialization
     FROM Doctor
     ORDER BY IsActive DESC, LastName, FirstName`
  );

  return doctors;
};

// ---------------------------------------------------------------------------
// Podgląd harmonogramu lekarza
// ---------------------------------------------------------------------------
export const getDoctorSchedule = async (
  doctorId: number,
  from: string,
  to: string
): Promise<{ doctor: Doctor; terms: ScheduleTerm[] }> => {
  const doctor = await getDoctor(pool, doctorId);

  const [rows] = await pool.execute<Rows<ScheduleRow>>(
    `${SCHEDULE_SELECT}
     WHERE t.DoctorID = ?
       AND t.StartDate >= ?
       AND t.StartDate < DATE_ADD(?, INTERVAL 1 DAY)
     ORDER BY t.StartDate ASC`,
    [doctorId, from, to]
  );

  return { doctor, terms: rows.map(toScheduleTerm) };
};

// ---------------------------------------------------------------------------
// Dodawanie terminów (generowanie slotów)
// ---------------------------------------------------------------------------
export interface CreateSlotsData {
  doctorId: number;
  /** Pierwszy dzień "RRRR-MM-DD" */
  dateFrom: string;
  /** Ostatni dzień "RRRR-MM-DD" (włącznie) */
  dateTo: string;
  /** Początek przyjęć "HH:MM" */
  startTime: string;
  /** Koniec przyjęć "HH:MM" – ostatni slot musi się skończyć najpóźniej o tej godzinie */
  endTime: string;
  /** Długość jednej wizyty w minutach */
  slotMinutes: number;
  cabinet: string | null;
  /** Pomijać soboty i niedziele (domyślnie tak) */
  skipWeekends: boolean;
}

export interface SkippedSlot {
  startDate: string;
  reason: string;
}

export const createSlots = async (
  data: CreateSlotsData
): Promise<{ created: ScheduleTerm[]; skipped: SkippedSlot[] }> => {
  const start = timeToMinutes(data.startTime);
  const end = timeToMinutes(data.endTime);

  // Lista slotów do utworzenia: [początek, koniec] jako "RRRR-MM-DD HH:MM:00"
  const planned: { start: string; end: string }[] = [];

  for (const day of eachDay(data.dateFrom, data.dateTo)) {
    if (data.skipWeekends && isWeekend(day)) continue;

    for (let m = start; m + data.slotMinutes <= end; m += data.slotMinutes) {
      planned.push({
        start: `${day} ${minutesToTime(m)}:00`,
        end: `${day} ${minutesToTime(m + data.slotMinutes)}:00`
      });
    }
  }

  if (planned.length === 0) {
    throw new AppError("W podanym zakresie nie mieści się żaden termin.", 400);
  }

  if (planned.length > config.maxSlotsPerRequest) {
    throw new AppError(
      `Za dużo terminów naraz (${planned.length}). Maksymalnie ${config.maxSlotsPerRequest} – podziel zakres dat.`,
      400
    );
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Blokada wiersza lekarza – dwa równoczesne żądania nie utworzą nakładających się terminów
    const [doctors] = await connection.execute<Rows<Doctor>>(
      `SELECT ID, IsActive FROM Doctor WHERE ID = ? FOR UPDATE`,
      [data.doctorId]
    );

    if (doctors.length === 0) {
      throw new AppError("Nie znaleziono lekarza.", 404);
    }

    if (!doctors[0].IsActive) {
      throw new AppError("Nie można dodać terminów nieaktywnemu lekarzowi.", 409);
    }

    const createdIds: number[] = [];
    const skipped: SkippedSlot[] = [];

    for (const slot of planned) {
      // Termin z przeszłości – pomijamy (np. dzisiejsze godziny, które już minęły)
      const [past] = await connection.execute<Rows<{ IsPast: number }>>(
        `SELECT (CAST(? AS DATETIME) <= NOW()) AS IsPast`,
        [slot.start]
      );

      if (past[0].IsPast === 1) {
        skipped.push({ startDate: slot.start, reason: "Termin z przeszłości." });
        continue;
      }

      // Lekarz ma już termin nachodzący na ten przedział
      const [doctorOverlap] = await connection.execute<Rows<{ TermID: number }>>(
        `SELECT TermID FROM Terms
         WHERE DoctorID = ? AND StartDate < ? AND EndDate > ?
         LIMIT 1`,
        [data.doctorId, slot.end, slot.start]
      );

      if (doctorOverlap.length > 0) {
        skipped.push({ startDate: slot.start, reason: "Lekarz ma już termin w tym czasie." });
        continue;
      }

      // Gabinet zajęty w tym czasie przez innego lekarza
      if (data.cabinet) {
        const [cabinetOverlap] = await connection.execute<Rows<{ TermID: number }>>(
          `SELECT TermID FROM Terms
           WHERE Cabinet = ? AND DoctorID <> ? AND StartDate < ? AND EndDate > ?
           LIMIT 1`,
          [data.cabinet, data.doctorId, slot.end, slot.start]
        );

        if (cabinetOverlap.length > 0) {
          skipped.push({
            startDate: slot.start,
            reason: `Gabinet ${data.cabinet} jest w tym czasie zajęty przez innego lekarza.`
          });
          continue;
        }
      }

      const [insert] = await connection.execute<ResultSetHeader>(
        `INSERT INTO Terms (StartDate, EndDate, Status, Cabinet, DoctorID)
         VALUES (?, ?, 'free', ?, ?)`,
        [slot.start, slot.end, data.cabinet, data.doctorId]
      );

      createdIds.push(insert.insertId);
    }

    await connection.commit();

    let created: ScheduleTerm[] = [];

    if (createdIds.length > 0) {
      const placeholders = createdIds.map(() => "?").join(", ");
      const [rows] = await pool.execute<Rows<ScheduleRow>>(
        `${SCHEDULE_SELECT}
         WHERE t.TermID IN (${placeholders})
         ORDER BY t.StartDate ASC`,
        createdIds
      );
      created = rows.map(toScheduleTerm);
    }

    return { created, skipped };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};

// ---------------------------------------------------------------------------
// Blokowanie / odblokowanie terminu
// ---------------------------------------------------------------------------
export const setTermAvailability = async (
  termId: number,
  status: "free" | "blocked"
): Promise<ScheduleTerm> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [terms] = await connection.execute<
      Rows<{ Status: TermStatus; IsPast: number }>
    >(
      `SELECT Status, (StartDate <= NOW()) AS IsPast
       FROM Terms
       WHERE TermID = ?
       FOR UPDATE`,
      [termId]
    );

    if (terms.length === 0) {
      throw new AppError("Nie znaleziono terminu.", 404);
    }

    // Kryterium akceptacji WF-10
    if (terms[0].Status === "reserved") {
      throw new AppError(
        "Ten termin jest zarezerwowany przez pacjenta. Najpierw anuluj lub przenieś rezerwację.",
        409
      );
    }

    if (terms[0].IsPast === 1) {
      throw new AppError("Nie można zmieniać terminów z przeszłości.", 409);
    }

    await connection.execute(
      `UPDATE Terms SET Status = ? WHERE TermID = ?`,
      [status, termId]
    );

    const [rows] = await connection.execute<Rows<ScheduleRow>>(
      `${SCHEDULE_SELECT} WHERE t.TermID = ?`,
      [termId]
    );

    await connection.commit();

    return toScheduleTerm(rows[0]);

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};

// ---------------------------------------------------------------------------
// Usuwanie terminu (np. dodanego przez pomyłkę)
// ---------------------------------------------------------------------------
export const deleteTerm = async (termId: number): Promise<void> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [terms] = await connection.execute<Rows<{ Status: TermStatus }>>(
      `SELECT Status FROM Terms WHERE TermID = ? FOR UPDATE`,
      [termId]
    );

    if (terms.length === 0) {
      throw new AppError("Nie znaleziono terminu.", 404);
    }

    if (terms[0].Status === "reserved") {
      throw new AppError(
        "Ten termin jest zarezerwowany przez pacjenta. Najpierw anuluj lub przenieś rezerwację.",
        409
      );
    }

    // Termin z historią rezerwacji (np. anulowanych) zostaje w bazie dla porządku danych –
    // zamiast usuwać, można go zablokować.
    const [history] = await connection.execute<Rows<{ ID: number }>>(
      `SELECT ID FROM Reservation WHERE TermsTermID = ? LIMIT 1`,
      [termId]
    );

    if (history.length > 0) {
      throw new AppError(
        "Tego terminu nie można usunąć, bo ma historię rezerwacji. Zablokuj go zamiast usuwać.",
        409
      );
    }

    await connection.execute(`DELETE FROM Terms WHERE TermID = ?`, [termId]);
    await connection.commit();

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};
