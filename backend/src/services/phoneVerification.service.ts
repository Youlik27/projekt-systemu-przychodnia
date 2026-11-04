import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { pool, type Rows } from "../db.js";
import { sendSms } from "./sms.service.js";

const OTP_EXPIRATION_MINUTES = 5;
const MAX_ATTEMPTS = 5;

export class PhoneVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneVerificationError";
  }
}

const hashCode = (code: string): string => {
  const secret = process.env.OTP_SECRET;

  if (!secret) {
    throw new PhoneVerificationError(
      "Brak konfiguracji OTP_SECRET."
    );
  }

  return createHmac("sha256", secret)
    .update(code)
    .digest("hex");
};

// Генерація та надсилання коду
export type VerificationPurpose = "register" | "login";

export const sendVerificationCode = async (
  phoneNumber: string,
  purpose: VerificationPurpose
): Promise<void> => {
  const code = randomInt(100000, 1000000).toString();
  const codeHash = hashCode(code);

  await pool.execute(
    `INSERT INTO PhoneVerification
  (PhoneNumber, CodeHash, ExpiresAt, Attempts, Purpose)
VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MINUTE), 0, ?)
ON DUPLICATE KEY UPDATE
  CodeHash = VALUES(CodeHash),
  ExpiresAt = VALUES(ExpiresAt),
  Attempts = 0,
  VerifiedAt = NULL,
  Purpose = VALUES(Purpose),
  CreatedAt = CURRENT_TIMESTAMP`,
    [phoneNumber, codeHash, OTP_EXPIRATION_MINUTES, purpose]
  );

  try {
    await sendSms({
      phoneNumber,
      message: `Twoj kod weryfikacyjny: ${code}. Kod jest wazny przez 5 minut.`
    });
  } catch (error) {
    // Видаляємо код, якщо надсилання SMS завершилося помилкою
    await pool.execute(
      `DELETE FROM PhoneVerification
       WHERE PhoneNumber = ? AND CodeHash = ?`,
      [phoneNumber, codeHash]
    );

    throw error;
  }
};

// Перевірка введеного коду
export const verifyPhoneCode = async (
  phoneNumber: string,
  enteredCode: string,
  purpose: VerificationPurpose
): Promise<{ verified: boolean; userId?: number }> => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [records] = await connection.execute<
      Rows<{
        CodeHash: string;
        Attempts: number;
        IsExpired: number;
        VerifiedAt: Date | null;
      }>
    >(
      `SELECT
  CodeHash,
  Attempts,
  VerifiedAt,
  (ExpiresAt <= NOW()) AS IsExpired
FROM PhoneVerification
WHERE PhoneNumber = ?
  AND Purpose = ?
FOR UPDATE`,
      [phoneNumber, purpose]
    );

    if (records.length === 0) {
  await connection.commit();
  return { verified: false };
}

    const verification = records[0];

    if (verification.VerifiedAt !== null) {
  await connection.commit();
  return { verified: false };
}

    if (
      verification.IsExpired === 1 ||
      verification.Attempts >= MAX_ATTEMPTS
    ) {
      await connection.execute(
        `DELETE FROM PhoneVerification
         WHERE PhoneNumber = ?
            AND Purpose = ?`,
        [phoneNumber, purpose]
      );

      await connection.commit();
      return { verified: false };
    }

    const enteredHash = hashCode(enteredCode);

    const isCorrect = timingSafeEqual(
      Buffer.from(verification.CodeHash, "hex"),
      Buffer.from(enteredHash, "hex")
    );

    if (!isCorrect) {
      await connection.execute(
        `UPDATE PhoneVerification
         SET Attempts = Attempts + 1
         WHERE PhoneNumber = ?
            AND Purpose = ?`,
        [phoneNumber, purpose]
      );

      await connection.commit();
      return { verified: false };
    }

   // Під час входу шукаємо пацієнта в тій самій транзакції
let userId: number | undefined;

if (purpose === "login") {
  const [users] = await connection.execute<
    Rows<{ ID: number }>
  >(
    `SELECT ID
     FROM \`User\`
     WHERE PhoneNumber = ?
       AND Role = 'patient'
     FOR UPDATE`,
    [phoneNumber]
  );

  if (users.length === 0) {
    await connection.execute(
      `DELETE FROM PhoneVerification
       WHERE PhoneNumber = ?
         AND Purpose = ?`,
      [phoneNumber, purpose]
    );

    await connection.commit();

    return { verified: false };
  }

  userId = users[0].ID;
}

// Позначаємо код як використаний
await connection.execute(
  `UPDATE PhoneVerification
   SET VerifiedAt = NOW()
   WHERE PhoneNumber = ?
     AND Purpose = ?
     AND VerifiedAt IS NULL`,
  [phoneNumber, purpose]
);

await connection.commit();

return {
  verified: true,
  ...(userId !== undefined && { userId })
};

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
};