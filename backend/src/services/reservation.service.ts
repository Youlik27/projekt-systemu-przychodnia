import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import type { ReservationStatus, Term, UserRole } from "../models.js";
import { AppError } from "../utils/errors.js";

// Zachowane dla zgodności z istniejącym kodem.
export { AppError as ReservationError };

// Komunikat z dokumentacji (UC.Wizyta.Alt04)
export const TERM_TAKEN_MESSAGE =
  "Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta.";

const RESERVATION_NOT_FOUND_MESSAGE = "Nie znaleziono rezerwacji.";

/** Dane rezerwacji zwracane do frontendu (potwierdzenie, lista „Moje wizyty”). */
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
  canCancel: boolean;
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
}

// Porównania czasu wykonujemy w bazie (NOW()), żeby nie zależeć od strefy czasowej Node.
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
    (t.StartDate > DATE_ADD(NOW(), INTERVAL ? HOUR)) AS IsBeforeCancelDeadline
  FROM Reservation r
  INNER JOIN Terms t
    ON t.TermID = r.TermsTermID
   AND t.DoctorID = r.TermsDoctorID
  INNER JOIN Doctor d ON d.ID = t.DoctorID
`;

const toDetails = (row: ReservationRow): ReservationDetails => ({
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
  canCancel: row.Status === "active" && row.IsBeforeCancelDeadline === 1
});

const fetchReservation = async (
  executor: PoolConnection | typeof pool,
  reservationId: number,
  userId: number
): Promise<ReservationDetails | null> => {
  const [rows] = await executor.execute<Rows<ReservationRow>>(
    `${RESERVATION_SELECT}
     WHERE r.ID = ? AND r.UserID = ?`,
    [config.cancelDeadlineHours, reservationId, userId]
  );

  return rows.length > 0 ? toDetails(rows[0]) : null;
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

// ---------------------------------------------------------------------------
// WF-03 + WF-09: rezerwacja wizyty i dane do potwierdzenia
// ---------------------------------------------------------------------------
export const createReservation = async (
  userId: number,
  termId: number
): Promise<ReservationDetails> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await assertPatient(connection, userId);

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

    if (term.Status === "reserved") {
      throw new AppError(TERM_TAKEN_MESSAGE, 409);
    }

    if (term.Status !== "free") {
      throw new AppError("Wybrany termin nie jest już dostępny.", 409);
    }

    if (term.IsPast === 1) {
      throw new AppError("Nie można zarezerwować terminu z przeszłości.", 400);
    }

    const [existingReservations] = await connection.execute<
      Rows<{ ID: number }>
    >(
      `SELECT ID
       FROM Reservation
       WHERE TermsTermID = ?
         AND TermsDoctorID = ?
         AND Status = 'active'`,
      [term.TermID, term.DoctorID]
    );

    if (existingReservations.length > 0) {
      throw new AppError(TERM_TAKEN_MESSAGE, 409);
    }

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

    const details = await fetchReservation(
      connection,
      result.insertId,
      userId
    );

    await connection.commit();

    if (!details) {
      throw new Error("Reservation created but could not be read back.");
    }

    return details;

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
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

  return rows.map(toDetails);
};

export const getPatientReservation = async (
  userId: number,
  reservationId: number
): Promise<ReservationDetails> => {
  const details = await fetchReservation(pool, reservationId, userId);

  // Cudza rezerwacja = 404, żeby nie ujawniać, że taki identyfikator istnieje (WNF-03)
  if (!details) {
    throw new AppError(RESERVATION_NOT_FOUND_MESSAGE, 404);
  }

  return details;
};

// ---------------------------------------------------------------------------
// WF-07: anulowanie rezerwacji zgodnie z zasadami przychodni
// ---------------------------------------------------------------------------
export const cancelReservation = async (
  userId: number,
  reservationId: number
): Promise<ReservationDetails> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [reservations] = await connection.execute<
      Rows<{
        ID: number;
        Status: ReservationStatus;
        TermsTermID: number;
        TermsDoctorID: number;
      }>
    >(
      `SELECT ID, Status, TermsTermID, TermsDoctorID
       FROM Reservation
       WHERE ID = ? AND UserID = ?
       FOR UPDATE`,
      [reservationId, userId]
    );

    if (reservations.length === 0) {
      throw new AppError(RESERVATION_NOT_FOUND_MESSAGE, 404);
    }

    const reservation = reservations[0];

    if (reservation.Status !== "active") {
      throw new AppError(
        "Tej rezerwacji nie można już anulować – nie jest aktywna.",
        409
      );
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
      [
        config.cancelDeadlineHours,
        reservation.TermsTermID,
        reservation.TermsDoctorID
      ]
    );

    if (terms.length === 0) {
      throw new Error(`Term for reservation ${reservationId} is missing.`);
    }

    if (terms[0].IsUpcoming !== 1) {
      throw new AppError("Nie można anulować wizyty, która już się odbyła.", 409);
    }

    if (terms[0].IsBeforeCancelDeadline !== 1) {
      throw new AppError(
        `Wizytę można anulować najpóźniej ${config.cancelDeadlineHours} godz. przed jej rozpoczęciem. Skontaktuj się z rejestracją przychodni.`,
        409
      );
    }

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

    const details = await fetchReservation(connection, reservationId, userId);

    await connection.commit();

    if (!details) {
      throw new Error("Reservation cancelled but could not be read back.");
    }

    return details;

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};
