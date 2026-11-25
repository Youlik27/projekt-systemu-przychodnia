// =====================================================================
// Logika rezerwacji wizyt.
//
// Pacjent (role "patient"):
//   WF-03 rezerwacja, WF-06 lista własnych wizyt, WF-07 anulowanie,
//   WF-08 zmiana terminu – wyłącznie WŁASNYCH wizyt i z zachowaniem
//   terminu na odwołanie (config.cancelDeadlineHours).
//
// Pracownik przychodni (role "staff"), WF-11:
//   lista wszystkich rezerwacji, rezerwacja w imieniu pacjenta (np. przez telefon),
//   anulowanie i przeniesienie dowolnej wizyty (do chwili jej rozpoczęcia),
//   oznaczenie wizyty jako odbytej / nieobecności. Pacjent dostaje o tym SMS.
//
// Wszystkie zmiany odbywają się w transakcjach z blokadą wierszy (SELECT ... FOR UPDATE),
// dzięki czemu ten sam termin nigdy nie trafi do dwóch pacjentów (UC.Wizyta.Alt04).
// =====================================================================

import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import type { ReservationStatus, Term, TermStatus, UserRole } from "../models.js";
import { AppError, isDuplicateEntryError } from "../utils/errors.js";
import { messages, notifyPatient, type VisitInfo } from "./notification.service.js";

// Zachowane dla zgodności z istniejącym kodem.
export { AppError as ReservationError };

/** Kto wykonuje operację – od tego zależą uprawnienia i zasady. */
export type Actor =
  | { role: "patient"; userId: number }
  | { role: "staff"; userId: number };

// Komunikat z dokumentacji (UC.Wizyta.Alt04)
export const TERM_TAKEN_MESSAGE =
  "Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta.";

const RESERVATION_NOT_FOUND_MESSAGE = "Nie znaleziono rezerwacji.";

/** Dane rezerwacji zwracane do frontendu (potwierdzenie, „Moje wizyty”, panel pracownika). */
export interface ReservationDetails {
  id: number;
  status: ReservationStatus;
  createdAt: Date;
  startDate: Date;
  endDate: Date;
  cabinet: string | null;
  termId: number;
  doctor: {
    id: number;
    firstName: string;
    lastName: string;
    specialization: string;
  };
  clinicAddress: string;
  isUpcoming: boolean;
  /** Czy PACJENT może sam anulować / przenieść wizytę (termin na odwołanie) */
  canCancel: boolean;
  /** Dane pacjenta – tylko w odpowiedziach dla pracownika przychodni (WNF-03) */
  patient?: {
    id: number;
    firstName: string;
    lastName: string;
    phoneNumber: string;
  };
}

interface ReservationRow {
  ID: number;
  Status: ReservationStatus;
  CreatedAt: Date;
  TermID: number;
  StartDate: Date;
  EndDate: Date;
  Cabinet: string | null;
  DoctorID: number;
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
  IsUpcoming: number;
  IsBeforeCancelDeadline: number;
  UserID: number;
  PatientFirstName: string;
  PatientLastName: string;
  PatientPhone: string;
}

// Porównania czasu wykonujemy w bazie (NOW()), żeby nie zależeć od strefy czasowej Node.
// Pierwszy parametr „?” to liczba godzin terminu na odwołanie.
const RESERVATION_SELECT = `
  SELECT
    r.ID,
    r.Status,
    r.CreatedAt,
    t.TermID,
    t.StartDate,
    t.EndDate,
    t.Cabinet,
    d.ID AS DoctorID,
    d.FirstName AS DoctorFirstName,
    d.LastName AS DoctorLastName,
    d.Specialization,
    (t.StartDate > NOW()) AS IsUpcoming,
    (t.StartDate > DATE_ADD(NOW(), INTERVAL ? HOUR)) AS IsBeforeCancelDeadline,
    u.ID AS UserID,
    u.FirstName AS PatientFirstName,
    u.LastName AS PatientLastName,
    u.PhoneNumber AS PatientPhone
  FROM Reservation r
  INNER JOIN Terms t
    ON t.TermID = r.TermsTermID
   AND t.DoctorID = r.TermsDoctorID
  INNER JOIN Doctor d ON d.ID = t.DoctorID
  INNER JOIN \`User\` u ON u.ID = r.UserID
`;

const toDetails = (row: ReservationRow, includePatient: boolean): ReservationDetails => ({
  id: row.ID,
  status: row.Status,
  createdAt: row.CreatedAt,
  startDate: row.StartDate,
  endDate: row.EndDate,
  cabinet: row.Cabinet,
  termId: row.TermID,
  doctor: {
    id: row.DoctorID,
    firstName: row.DoctorFirstName,
    lastName: row.DoctorLastName,
    specialization: row.Specialization
  },
  clinicAddress: config.clinicAddress,
  isUpcoming: row.IsUpcoming === 1,
  canCancel: row.Status === "active" && row.IsBeforeCancelDeadline === 1,
  ...(includePatient && {
    patient: {
      id: row.UserID,
      firstName: row.PatientFirstName,
      lastName: row.PatientLastName,
      phoneNumber: row.PatientPhone
    }
  })
});

/** Dane wizyty potrzebne do treści SMS-a */
const toVisitInfo = (details: ReservationDetails): VisitInfo => ({
  startDate: new Date(details.startDate),
  doctorFirstName: details.doctor.firstName,
  doctorLastName: details.doctor.lastName,
  specialization: details.doctor.specialization,
  cabinet: details.cabinet
});

/**
 * Odczyt jednej rezerwacji.
 * userId !== null → tylko jeśli należy do tego pacjenta (cudza = brak, WNF-03).
 */
const fetchReservation = async (
  executor: PoolConnection | typeof pool,
  reservationId: number,
  userId: number | null,
  includePatient: boolean
): Promise<ReservationDetails | null> => {
  const params: number[] = [config.cancelDeadlineHours, reservationId];
  let ownerFilter = "";

  if (userId !== null) {
    ownerFilter = "AND r.UserID = ?";
    params.push(userId);
  }

  const [rows] = await executor.execute<Rows<ReservationRow>>(
    `${RESERVATION_SELECT}
     WHERE r.ID = ? ${ownerFilter}`,
    params
  );

  return rows.length > 0 ? toDetails(rows[0], includePatient) : null;
};

const fetchOrFail = async (
  executor: PoolConnection | typeof pool,
  reservationId: number,
  actor: Actor
): Promise<ReservationDetails> => {
  const details = await fetchReservation(
    executor,
    reservationId,
    actor.role === "patient" ? actor.userId : null,
    actor.role === "staff"
  );

  if (!details) {
    throw new AppError(RESERVATION_NOT_FOUND_MESSAGE, 404);
  }

  return details;
};

/** Uruchamia `work` w transakcji; przy błędzie wycofuje zmiany. */
const inTransaction = async <T>(
  work: (connection: PoolConnection) => Promise<T>
): Promise<T> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const assertPatient = async (
  connection: PoolConnection,
  userId: number
): Promise<void> => {
  const [users] = await connection.execute<
    Rows<{ ID: number; Role: UserRole }>
  >(
    `SELECT ID, Role
     FROM \`User\`
     WHERE ID = ?`,
    [userId]
  );

  if (users.length === 0 || users[0].Role !== "patient") {
    throw new AppError("Nie znaleziono pacjenta.", 404);
  }
};

/** Sprawdza, czy w nowym terminie nie ma już aktywnej rezerwacji (zabezpieczenie dodatkowe). */
const assertNoActiveReservation = async (
  connection: PoolConnection,
  termId: number,
  doctorId: number
): Promise<void> => {
  const [rows] = await connection.execute<Rows<{ ID: number }>>(
    `SELECT ID
     FROM Reservation
     WHERE TermsTermID = ?
       AND TermsDoctorID = ?
       AND Status = 'active'`,
    [termId, doctorId]
  );

  if (rows.length > 0) {
    throw new AppError(TERM_TAKEN_MESSAGE, 409);
  }
};

/** Komunikat dla terminu, który nie jest wolny. */
const assertTermFree = (status: TermStatus): void => {
  if (status === "reserved") {
    throw new AppError(TERM_TAKEN_MESSAGE, 409);
  }

  if (status !== "free") {
    throw new AppError("Wybrany termin nie jest już dostępny.", 409);
  }
};

/**
 * Rdzeń rezerwacji – wywoływany WEWNĄTRZ transakcji.
 * Blokuje wiersz terminu, sprawdza dostępność, zapisuje rezerwację
 * i oznacza termin jako zarezerwowany. Zwraca ID nowej rezerwacji.
 */
const reserveTermInTransaction = async (
  connection: PoolConnection,
  userId: number,
  termId: number
): Promise<number> => {
  // Blokada wiersza terminu – chroni przed równoczesną rezerwacją (UC.Wizyta.Alt04)
  const [terms] = await connection.execute<
    Rows<Term & { IsPast: number }>
  >(
    `SELECT TermID, StartDate, EndDate, Status, Cabinet, DoctorID,
            (StartDate <= NOW()) AS IsPast
     FROM Terms
     WHERE TermID = ?
     FOR UPDATE`,
    [termId]
  );

  if (terms.length === 0) {
    throw new AppError("Nie znaleziono wybranego terminu.", 404);
  }

  const term = terms[0];

  const [doctors] = await connection.execute<Rows<{ IsActive: boolean }>>(
    `SELECT IsActive
     FROM Doctor
     WHERE ID = ?`,
    [term.DoctorID]
  );

  if (doctors.length === 0 || !doctors[0].IsActive) {
    throw new AppError("Wybrany lekarz jest nieaktywny.", 409);
  }

  assertTermFree(term.Status);

  if (term.IsPast === 1) {
    throw new AppError("Nie można zarezerwować terminu z przeszłości.", 400);
  }

  await assertNoActiveReservation(connection, term.TermID, term.DoctorID);

  const [result] = await connection.execute<ResultSetHeader>(
    `INSERT INTO Reservation
       (UserID, TermsTermID, TermsDoctorID, Status)
     VALUES (?, ?, ?, 'active')`,
    [userId, term.TermID, term.DoctorID]
  );

  const [updateResult] = await connection.execute<ResultSetHeader>(
    `UPDATE Terms
     SET Status = 'reserved'
     WHERE TermID = ?
       AND DoctorID = ?
       AND Status = 'free'`,
    [term.TermID, term.DoctorID]
  );

  if (updateResult.affectedRows !== 1) {
    throw new AppError(TERM_TAKEN_MESSAGE, 409);
  }

  return result.insertId;
};

// ---------------------------------------------------------------------------
// WF-03 + WF-09: rezerwacja wizyty przez pacjenta i dane do potwierdzenia
// ---------------------------------------------------------------------------
export const createReservation = (
  userId: number,
  termId: number
): Promise<ReservationDetails> =>
  inTransaction(async (connection) => {
    await assertPatient(connection, userId);
    const reservationId = await reserveTermInTransaction(connection, userId, termId);
    return fetchOrFail(connection, reservationId, { role: "patient", userId });
  });

// ---------------------------------------------------------------------------
// WF-11: rezerwacja w imieniu pacjenta (rejestracja telefoniczna / w okienku).
// Jeśli pacjenta z tym numerem nie ma – konto tworzy się automatycznie (WF-04).
// Tożsamość pacjenta potwierdza pracownik, więc kod SMS nie jest potrzebny.
// ---------------------------------------------------------------------------
export interface StaffBookingData {
  termId: number;
  phoneNumber: string;
  firstName: string;
  lastName: string;
}

export const staffCreateReservation = async (
  data: StaffBookingData
): Promise<{ reservation: ReservationDetails; patientCreated: boolean }> => {
  let result: { reservation: ReservationDetails; patientCreated: boolean };

  try {
    result = await inTransaction(async (connection) => {
      const [users] = await connection.execute<Rows<{ ID: number; Role: UserRole }>>(
        `SELECT ID, Role
         FROM \`User\`
         WHERE PhoneNumber = ?
         FOR UPDATE`,
        [data.phoneNumber]
      );

      let userId: number;
      let patientCreated = false;

      if (users.length > 0) {
        if (users[0].Role !== "patient") {
          throw new AppError("Ten numer telefonu należy do konta pracownika przychodni.", 409);
        }
        // Istniejący pacjent – nie nadpisujemy jego danych
        userId = users[0].ID;
      } else {
        const [insert] = await connection.execute<ResultSetHeader>(
          `INSERT INTO \`User\` (FirstName, LastName, PhoneNumber, Role)
           VALUES (?, ?, ?, 'patient')`,
          [data.firstName, data.lastName, data.phoneNumber]
        );
        userId = insert.insertId;
        patientCreated = true;
      }

      const reservationId = await reserveTermInTransaction(connection, userId, data.termId);
      const reservation = await fetchOrFail(connection, reservationId, { role: "staff", userId: 0 });

      return { reservation, patientCreated };
    });
  } catch (error) {
    // Równoczesne utworzenie konta dla tego samego numeru – UNIQUE w bazie
    if (isDuplicateEntryError(error)) {
      throw new AppError("Konto pacjenta z tym numerem właśnie powstało. Spróbuj ponownie.", 409);
    }
    throw error;
  }

  void notifyPatient(data.phoneNumber, messages.bookedByClinic(toVisitInfo(result.reservation)));
  return result;
};

// ---------------------------------------------------------------------------
// WF-06: przeglądanie własnych rezerwacji
// ---------------------------------------------------------------------------
export const getPatientReservations = async (
  userId: number
): Promise<ReservationDetails[]> => {
  // Najpierw nadchodzące wizyty (od najbliższej), potem historia (od najnowszej).
  const [rows] = await pool.execute<Rows<ReservationRow>>(
    `${RESERVATION_SELECT}
     WHERE r.UserID = ?
     ORDER BY
       (t.StartDate > NOW()) DESC,
       CASE WHEN t.StartDate > NOW() THEN t.StartDate END ASC,
       t.StartDate DESC`,
    [config.cancelDeadlineHours, userId]
  );

  return rows.map((row) => toDetails(row, false));
};

/** Szczegóły jednej wizyty – pacjent widzi tylko swoje, pracownik wszystkie. */
export const getReservation = (
  actor: Actor,
  reservationId: number
): Promise<ReservationDetails> => fetchOrFail(pool, reservationId, actor);

/** Zachowane dla zgodności – szczegóły własnej wizyty pacjenta. */
export const getPatientReservation = (
  userId: number,
  reservationId: number
): Promise<ReservationDetails> =>
  getReservation({ role: "patient", userId }, reservationId);

// ---------------------------------------------------------------------------
// WF-11: lista rezerwacji dla pracownika przychodni (z filtrami)
// ---------------------------------------------------------------------------
export interface ReservationFilters {
  /** RRRR-MM-DD – wizyty od tego dnia (włącznie) */
  from?: string;
  /** RRRR-MM-DD – wizyty do tego dnia (włącznie) */
  to?: string;
  doctorId?: number;
  status?: ReservationStatus;
  /** Fragment numeru telefonu lub nazwiska pacjenta */
  patient?: string;
}

const MAX_LIST_RESULTS = 200;

/** Znaki specjalne LIKE (% i _) traktujemy dosłownie. */
const escapeLike = (text: string): string => text.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export const listReservations = async (
  filters: ReservationFilters
): Promise<ReservationDetails[]> => {
  const conditions: string[] = [];
  const params: (string | number)[] = [config.cancelDeadlineHours];

  if (filters.from) {
    conditions.push("t.StartDate >= ?");
    params.push(filters.from);
  }

  if (filters.to) {
    conditions.push("t.StartDate < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(filters.to);
  }

  if (filters.doctorId !== undefined) {
    conditions.push("t.DoctorID = ?");
    params.push(filters.doctorId);
  }

  if (filters.status) {
    conditions.push("r.Status = ?");
    params.push(filters.status);
  }

  if (filters.patient) {
    const pattern = `%${escapeLike(filters.patient)}%`;
    conditions.push("(u.PhoneNumber LIKE ? OR u.LastName LIKE ?)");
    params.push(pattern, pattern);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const [rows] = await pool.execute<Rows<ReservationRow>>(
    `${RESERVATION_SELECT}
     ${where}
     ORDER BY t.StartDate ASC, d.LastName ASC
     LIMIT ${MAX_LIST_RESULTS}`,
    params
  );

  return rows.map((row) => toDetails(row, true));
};

// ---------------------------------------------------------------------------
// Wspólne sprawdzenia dla anulowania i przeniesienia wizyty
// ---------------------------------------------------------------------------

interface LockedReservation {
  ID: number;
  Status: ReservationStatus;
  UserID: number;
  TermsTermID: number;
  TermsDoctorID: number;
}

/** Blokuje rezerwację do zmiany. Pacjent może zmieniać tylko swoje (cudza = 404). */
const lockReservation = async (
  connection: PoolConnection,
  reservationId: number,
  actor: Actor
): Promise<LockedReservation> => {
  const params: number[] = [reservationId];
  let ownerFilter = "";

  if (actor.role === "patient") {
    ownerFilter = "AND UserID = ?";
    params.push(actor.userId);
  }

  const [rows] = await connection.execute<Rows<LockedReservation>>(
    `SELECT ID, Status, UserID, TermsTermID, TermsDoctorID
     FROM Reservation
     WHERE ID = ? ${ownerFilter}
     FOR UPDATE`,
    params
  );

  if (rows.length === 0) {
    throw new AppError(RESERVATION_NOT_FOUND_MESSAGE, 404);
  }

  return rows[0];
};

/**
 * Czy obecny termin wizyty można jeszcze zmienić:
 *  - nikt nie zmienia wizyty, która już się zaczęła,
 *  - pacjent – najpóźniej config.cancelDeadlineHours przed wizytą (zasady przychodni),
 *  - pracownik – bez tego ograniczenia (np. lekarz zachorował rano).
 */
const assertCanChangeVisit = (
  term: { IsUpcoming: number; IsBeforeCancelDeadline: number },
  actor: Actor,
  action: "anulować" | "przenieść"
): void => {
  if (term.IsUpcoming !== 1) {
    throw new AppError(`Nie można ${action} wizyty, która już się odbyła lub trwa.`, 409);
  }

  if (actor.role === "patient" && term.IsBeforeCancelDeadline !== 1) {
    throw new AppError(
      `Wizytę można ${action} najpóźniej ${config.cancelDeadlineHours} godz. przed jej rozpoczęciem. Skontaktuj się z rejestracją przychodni.`,
      409
    );
  }
};

// ---------------------------------------------------------------------------
// WF-07 / WF-11: anulowanie rezerwacji
// ---------------------------------------------------------------------------
export const cancelReservation = async (
  actor: Actor,
  reservationId: number
): Promise<ReservationDetails> => {
  const details = await inTransaction(async (connection) => {
    const reservation = await lockReservation(connection, reservationId, actor);

    if (reservation.Status !== "active") {
      throw new AppError("Tej rezerwacji nie można już anulować – nie jest aktywna.", 409);
    }

    const [terms] = await connection.execute<
      Rows<{ IsBeforeCancelDeadline: number; IsUpcoming: number }>
    >(
      `SELECT
         (StartDate > NOW()) AS IsUpcoming,
         (StartDate > DATE_ADD(NOW(), INTERVAL ? HOUR)) AS IsBeforeCancelDeadline
       FROM Terms
       WHERE TermID = ? AND DoctorID = ?
       FOR UPDATE`,
      [config.cancelDeadlineHours, reservation.TermsTermID, reservation.TermsDoctorID]
    );

    if (terms.length === 0) {
      throw new Error(`Term for reservation ${reservationId} is missing.`);
    }

    assertCanChangeVisit(terms[0], actor, "anulować");

    await connection.execute(
      `UPDATE Reservation
       SET Status = 'cancelled'
       WHERE ID = ?`,
      [reservationId]
    );

    // Zwolniony termin wraca do puli wolnych terminów
    // (o ile pracownik w międzyczasie go nie zablokował).
    await connection.execute(
      `UPDATE Terms
       SET Status = 'free'
       WHERE TermID = ?
         AND DoctorID = ?
         AND Status = 'reserved'`,
      [reservation.TermsTermID, reservation.TermsDoctorID]
    );

    return fetchOrFail(connection, reservationId, actor);
  });

  // Wizytę odwołała przychodnia → pacjent musi się o tym dowiedzieć
  if (actor.role === "staff" && details.patient) {
    void notifyPatient(details.patient.phoneNumber, messages.cancelledByClinic(toVisitInfo(details)));
  }

  return details;
};

// ---------------------------------------------------------------------------
// WF-08 / WF-11: zmiana terminu wizyty
//
// Rezerwacja zostaje ta sama (ten sam numer), zmienia się tylko termin:
// stary termin wraca do puli wolnych, nowy zostaje zarezerwowany – w jednej transakcji.
// Nowy termin musi dotyczyć tej samej specjalizacji (to zmiana daty wizyty,
// a nie zapis do innego lekarza – do tego służy nowa rezerwacja).
// ---------------------------------------------------------------------------
interface LockedTerm {
  TermID: number;
  DoctorID: number;
  Status: TermStatus;
  IsUpcoming: number;
  IsBeforeCancelDeadline: number;
  DoctorIsActive: boolean;
  Specialization: string;
}

export const rescheduleReservation = async (
  actor: Actor,
  reservationId: number,
  newTermId: number
): Promise<ReservationDetails> => {
  const details = await inTransaction(async (connection) => {
    const reservation = await lockReservation(connection, reservationId, actor);

    if (reservation.Status !== "active") {
      throw new AppError("Można zmienić termin tylko aktywnej wizyty.", 409);
    }

    if (reservation.TermsTermID === newTermId) {
      throw new AppError("Wybrany termin jest obecnym terminem tej wizyty.", 400);
    }

    // Blokujemy oba terminy jednym zapytaniem, w stałej kolejności (ORDER BY TermID) –
    // dwie równoczesne zmiany terminów nie zakleszczą się (deadlock).
    const [terms] = await connection.execute<Rows<LockedTerm>>(
      `SELECT
         t.TermID,
         t.DoctorID,
         t.Status,
         (t.StartDate > NOW()) AS IsUpcoming,
         (t.StartDate > DATE_ADD(NOW(), INTERVAL ? HOUR)) AS IsBeforeCancelDeadline,
         d.IsActive AS DoctorIsActive,
         d.Specialization
       FROM Terms t
       INNER JOIN Doctor d ON d.ID = t.DoctorID
       WHERE t.TermID IN (?, ?)
       ORDER BY t.TermID
       FOR UPDATE OF t`,
      [config.cancelDeadlineHours, reservation.TermsTermID, newTermId]
    );

    const oldTerm = terms.find((t) => t.TermID === reservation.TermsTermID);
    const newTerm = terms.find((t) => t.TermID === newTermId);

    if (!oldTerm) {
      throw new Error(`Term for reservation ${reservationId} is missing.`);
    }

    if (!newTerm) {
      throw new AppError("Nie znaleziono wybranego terminu.", 404);
    }

    assertCanChangeVisit(oldTerm, actor, "przenieść");

    if (!newTerm.DoctorIsActive) {
      throw new AppError("Wybrany lekarz jest nieaktywny.", 409);
    }

    assertTermFree(newTerm.Status);

    if (newTerm.IsUpcoming !== 1) {
      throw new AppError("Nie można przenieść wizyty na termin z przeszłości.", 400);
    }

    if (newTerm.Specialization !== oldTerm.Specialization) {
      throw new AppError(
        `Nowy termin musi dotyczyć tej samej specjalizacji (${oldTerm.Specialization}). Aby zapisać się do innego lekarza, umów nową wizytę.`,
        400
      );
    }

    await assertNoActiveReservation(connection, newTerm.TermID, newTerm.DoctorID);

    await connection.execute(
      `UPDATE Reservation
       SET TermsTermID = ?, TermsDoctorID = ?
       WHERE ID = ?`,
      [newTerm.TermID, newTerm.DoctorID, reservationId]
    );

    // Stary termin – znowu wolny
    await connection.execute(
      `UPDATE Terms
       SET Status = 'free'
       WHERE TermID = ?
         AND Status = 'reserved'`,
      [oldTerm.TermID]
    );

    // Nowy termin – zarezerwowany
    const [updateResult] = await connection.execute<ResultSetHeader>(
      `UPDATE Terms
       SET Status = 'reserved'
       WHERE TermID = ?
         AND Status = 'free'`,
      [newTerm.TermID]
    );

    if (updateResult.affectedRows !== 1) {
      throw new AppError(TERM_TAKEN_MESSAGE, 409);
    }

    return fetchOrFail(connection, reservationId, actor);
  });

  if (actor.role === "staff" && details.patient) {
    void notifyPatient(details.patient.phoneNumber, messages.rescheduledByClinic(toVisitInfo(details)));
  }

  return details;
};

// ---------------------------------------------------------------------------
// WF-11: oznaczenie przebiegu wizyty – odbyta / nieobecność pacjenta
// ---------------------------------------------------------------------------
export type VisitOutcome = "completed" | "no_show";

export const setVisitOutcome = (
  reservationId: number,
  outcome: VisitOutcome
): Promise<ReservationDetails> =>
  inTransaction(async (connection) => {
    const staff: Actor = { role: "staff", userId: 0 };
    const reservation = await lockReservation(connection, reservationId, staff);

    if (reservation.Status === "cancelled") {
      throw new AppError("Nie można zmienić statusu anulowanej wizyty.", 409);
    }

    const [terms] = await connection.execute<Rows<{ HasStarted: number }>>(
      `SELECT (StartDate <= NOW()) AS HasStarted
       FROM Terms
       WHERE TermID = ? AND DoctorID = ?`,
      [reservation.TermsTermID, reservation.TermsDoctorID]
    );

    if (terms.length === 0 || terms[0].HasStarted !== 1) {
      throw new AppError(
        "Wizytę można oznaczyć jako odbytą lub nieobecność dopiero po jej rozpoczęciu.",
        409
      );
    }

    await connection.execute(
      `UPDATE Reservation
       SET Status = ?
       WHERE ID = ?`,
      [outcome, reservationId]
    );

    return fetchOrFail(connection, reservationId, staff);
  });
