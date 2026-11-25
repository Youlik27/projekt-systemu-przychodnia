import jwt from "jsonwebtoken";
import type { ResultSetHeader } from "mysql2/promise";
import type { UserRole } from "../models.js";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import { AppError, isDuplicateEntryError } from "../utils/errors.js";

interface JwtPayload {
  id: number;
  role: UserRole;
}

export function generateToken(user: { id: number; role: UserRole }) {
  return jwt.sign(
    { id: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] }
  );
}

export const verifyToken = (token: string): JwtPayload => {
  const decoded = jwt.verify(token, config.jwtSecret);

  if (
    typeof decoded === "string" ||
    typeof decoded.id !== "number" ||
    (decoded.role !== "patient" && decoded.role !== "staff")
  ) {
    throw new Error("Invalid token payload.");
  }

  return {
    id: decoded.id,
    role: decoded.role
  };
};

/** Dane zalogowanego użytkownika – GET /api/auth/me */
export interface UserProfile {
  id: number;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  role: UserRole;
}

export const getUserProfile = async (userId: number): Promise<UserProfile> => {
  const [users] = await pool.execute<
    Rows<{ ID: number; FirstName: string; LastName: string; PhoneNumber: string; Role: UserRole }>
  >(
    `SELECT ID, FirstName, LastName, PhoneNumber, Role
     FROM \`User\`
     WHERE ID = ?`,
    [userId]
  );

  // Konto usunięte po wydaniu tokenu – traktujemy jak brak zalogowania
  if (users.length === 0) {
    throw new AppError("Nie znaleziono użytkownika.", 401);
  }

  const user = users[0];

  return {
    id: user.ID,
    firstName: user.FirstName,
    lastName: user.LastName,
    phoneNumber: user.PhoneNumber,
    role: user.Role
  };
};

// Zachowane dla zgodności z istniejącym kodem – AuthError to po prostu AppError.
export { AppError as AuthError };

export interface RegisterPatientData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
  // Dokumentacja (4.4 krok 5, 4.6 ekran 3) wymaga tylko imienia, nazwiska i telefonu.
  address: string | null;
  birthDate: string | null;
}

export const registerPatient = async (
  data: RegisterPatientData
): Promise<number> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Numer telefonu musi być wcześniej potwierdzony kodem SMS
    // i potwierdzenie nie może być starsze niż registerWindowMinutes.
    const [verifications] = await connection.execute<
      Rows<{ VerifiedAt: Date | null; IsFresh: number | null }>
    >(
      `SELECT
         VerifiedAt,
         (VerifiedAt >= DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS IsFresh
       FROM PhoneVerification
       WHERE PhoneNumber = ?
         AND Purpose = 'register'
       FOR UPDATE`,
      [config.registerWindowMinutes, data.phoneNumber]
    );

    if (
      verifications.length === 0 ||
      verifications[0].VerifiedAt === null
    ) {
      throw new AppError("Numer telefonu nie został zweryfikowany.", 403);
    }

    if (verifications[0].IsFresh !== 1) {
      throw new AppError(
        "Potwierdzenie numeru telefonu wygasło. Wyślij nowy kod SMS.",
        403
      );
    }

    // WF-04: nie tworzymy drugiego konta dla tego samego numeru
    const [existingUsers] = await connection.execute<Rows<{ ID: number }>>(
      `SELECT ID
       FROM \`User\`
       WHERE PhoneNumber = ?`,
      [data.phoneNumber]
    );

    if (existingUsers.length > 0) {
      throw new AppError(
        "Użytkownik z tym numerem telefonu już istnieje.",
        409
      );
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO \`User\`
         (FirstName, LastName, Address, BirthDate, PhoneNumber, Role)
       VALUES (?, ?, ?, ?, ?, 'patient')`,
      [
        data.firstName,
        data.lastName,
        data.address,
        data.birthDate,
        data.phoneNumber
      ]
    );

    // Zużywamy potwierdzenie, żeby nie dało się go użyć ponownie
    await connection.execute(
      `DELETE FROM PhoneVerification
       WHERE PhoneNumber = ?
         AND Purpose = 'register'`,
      [data.phoneNumber]
    );

    await connection.commit();

    return result.insertId;

  } catch (error) {
    await connection.rollback();

    // Dwie równoczesne rejestracje tego samego numeru – UNIQUE w bazie
    if (isDuplicateEntryError(error)) {
      throw new AppError(
        "Użytkownik z tym numerem telefonu już istnieje.",
        409
      );
    }

    throw error;

  } finally {
    connection.release();
  }
};
