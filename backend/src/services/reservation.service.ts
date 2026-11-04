
import type { ResultSetHeader } from "mysql2/promise";
import { pool, type Rows } from "../db.js";
import type { Term, UserRole } from "../models.js";

export class ReservationError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "ReservationError";
  }
}

export const createReservation = async (
  userId: number,
  termId: number
): Promise<{ reservationId: number }> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [users] = await connection.execute<
      Rows<{ ID: number; Role: UserRole }>
    >(
      `SELECT ID, Role
       FROM \`User\`
       WHERE ID = ?`,
      [userId]
    );

    if (users.length === 0 || users[0].Role !== "patient") {
      throw new ReservationError(
        "Nie znaleziono pacjenta.",
        404
      );
    }

    const [terms] = await connection.execute<Rows<Term>>(
      `SELECT TermID, StartDate, EndDate, Status, Cabinet, DoctorID
       FROM Terms
       WHERE TermID = ?
       FOR UPDATE`,
      [termId]
    );

    if (terms.length === 0) {
      throw new ReservationError(
        "Nie znaleziono wybranego terminu.",
        404
      );
    }

    const term = terms[0];

const [doctors] = await connection.execute<
  Rows<{ IsActive: boolean }>
>(
  `SELECT IsActive
   FROM Doctor
   WHERE ID = ?
   FOR UPDATE`,
  [term.DoctorID]
);

if (doctors.length === 0 || !doctors[0].IsActive) {
  throw new ReservationError(
    "Wybrany lekarz jest nieaktywny.",
    409
  );
}

    if (term.Status !== "free") {
      throw new ReservationError(
        "Wybrany termin nie jest już dostępny.",
        409
      );
    }

    if (new Date(term.StartDate).getTime() <= Date.now()) {
      throw new ReservationError(
        "Nie można zarezerwować terminu z przeszłości.",
        400
      );
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
      throw new ReservationError(
        "Ten termin posiada już aktywną rezerwację.",
        409
      );
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
  throw new ReservationError(
    "Nie udało się zarezerwować wybranego terminu.",
    409
  );
}

    await connection.commit();

    return {
      reservationId: result.insertId
    };

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};
