import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import { sendSms } from "./sms.service.js";
import type { UserRole } from "../models.js";

export type VerificationPurpose = "register" | "login";

/** Błąd bramki SMS (UC.B03) – kontroler zamienia go na czytelny komunikat. */
export class SmsDeliveryError extends Error {
  constructor(cause: unknown) {
    super("SMS delivery failed", { cause });
    this.name = "SmsDeliveryError";
  }
}

export const hashCode = (code: string): string =>
  createHmac("sha256", config.otpSecret)
    .update(code)
    .digest("hex");

export const generateCode = (): string => {
  const min = 10 ** (config.otpLength - 1);
  const max = 10 ** config.otpLength;
  return randomInt(min, max).toString();
};

// Generowanie i wysyłanie kodu
export const sendVerificationCode = async (
  phoneNumber: string,
  purpose: VerificationPurpose
): Promise<void> => {
  const code = generateCode();
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
    [phoneNumber, codeHash, config.otpExpirationMinutes, purpose]
  );

  try {
    await sendSms({
      phoneNumber,
      message: `Twoj kod weryfikacyjny: ${code}. Kod jest wazny przez ${config.otpExpirationMinutes} minut.`
    });
  } catch (error) {
    // Usuwamy kod, jeśli wysyłka SMS się nie powiodła
    await pool.execute(
      `DELETE FROM PhoneVerification
       WHERE PhoneNumber = ? AND CodeHash = ?`,
      [phoneNumber, codeHash]
    );

    throw new SmsDeliveryError(error);
  }
};

// Weryfikacja wprowadzonego kodu
// `role` ma znaczenie tylko przy logowaniu: pacjent loguje się do „Moje wizyty”,
// pracownik przychodni – do panelu pracownika (WF-10, WF-11).
export const verifyPhoneCode = async (
  phoneNumber: string,
  enteredCode: string,
  purpose: VerificationPurpose,
  role: UserRole = "patient"
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

    // Kod już wykorzystany – nie może zostać użyty ponownie (WNF-04)
    if (verification.VerifiedAt !== null) {
      await connection.commit();
      return { verified: false };
    }

    if (
      verification.IsExpired === 1 ||
      verification.Attempts >= config.otpMaxAttempts
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

    const isCorrect = timingSafeEqual(
      Buffer.from(verification.CodeHash, "hex"),
      Buffer.from(hashCode(enteredCode), "hex")
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

    // Przy logowaniu szukamy użytkownika o wskazanej roli w tej samej transakcji
    let userId: number | undefined;

    if (purpose === "login") {
      const [users] = await connection.execute<Rows<{ ID: number }>>(
        `SELECT ID
         FROM \`User\`
         WHERE PhoneNumber = ?
           AND Role = ?
         FOR UPDATE`,
        [phoneNumber, role]
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

    // Oznaczamy kod jako wykorzystany
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
