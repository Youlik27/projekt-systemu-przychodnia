import jwt from "jsonwebtoken";
import type { UserRole } from "../models.js";
import { pool, type Rows } from "../db.js";
import type { ResultSetHeader } from "mysql2/promise";

interface JwtPayload {
  id: number;
  role: UserRole;
}

export function generateToken(user: { id: number; role: UserRole }) {
  const secret = process.env.JWT_SECRET;
  const expiresIn = process.env.JWT_EXPIRES_IN || "1h";

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    { id: user.id, role: user.role },
    secret,
    { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] }
  );
}

export const verifyToken = (token: string): JwtPayload => {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured.");
  }

  const decoded = jwt.verify(token, secret);

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
export class AuthError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}

interface RegisterPatientData {
  firstName: string;
  lastName: string;
  address: string;
  birthDate: string;
  phoneNumber: string;
}

export const registerPatient = async (
  data: RegisterPatientData
): Promise<number> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Перевіряємо, чи номер телефону був підтверджений
    const [verifications] = await connection.execute<
      Rows<{ VerifiedAt: Date | null }>
    >(
      `SELECT VerifiedAt
       FROM PhoneVerification
       WHERE PhoneNumber = ?
        AND Purpose = 'register'
       FOR UPDATE`,
      [data.phoneNumber]
    );

    if (
      verifications.length === 0 ||
      verifications[0].VerifiedAt === null
    ) {
      throw new AuthError(
        "Numer telefonu nie został zweryfikowany.",
        403
      );
    }

    // Підтвердження має бути не старшим за 15 хвилин
    const [validations] = await connection.execute<
      Rows<{ IsValid: number }>
    >(
      `SELECT (VerifiedAt >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)) AS IsValid
       FROM PhoneVerification
       WHERE PhoneNumber = ?
            AND Purpose = 'register'`,
      [data.phoneNumber]
    );

    if (validations.length === 0 || validations[0].IsValid !== 1) {
      throw new AuthError(
        "Potwierdzenie numeru telefonu wygasło.",
        403
      );
    }

    // Перевіряємо, чи користувач уже існує
    const [existingUsers] = await connection.execute<
      Rows<{ ID: number }>
    >(
      `SELECT ID
       FROM \`User\`
       WHERE PhoneNumber = ?`,
      [data.phoneNumber]
    );

    if (existingUsers.length > 0) {
      throw new AuthError(
        "Użytkownik z tym numerem telefonu już istnieje.",
        409
      );
    }

    // Створюємо пацієнта
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

    // Споживаємо підтвердження, щоб його не можна було використати повторно
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
    throw error;

  } finally {
    connection.release();
  }
};