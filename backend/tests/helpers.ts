// Narzędzia pomocnicze dla testów API.
// Testy uruchamiają prawdziwą aplikację Express na losowym porcie
// i korzystają z bazy z docker-compose (dane z db/02_seed.sql).
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { ResultSetHeader } from "mysql2/promise";

process.env.NODE_ENV = "test";

const { createApp } = await import("../src/app.js");
const { pool } = await import("../src/db.js");
const { hashCode, generateCode } = await import(
  "../src/services/phoneVerification.service.js"
);
const { generateToken } = await import("../src/services/auth.service.js");

export { pool };

/**
 * Token podpisany sekretem z .env – do testów uprawnień i walidacji,
 * które nie potrzebują bazy (żądanie zostaje odrzucone przed zapytaniem SQL).
 */
export const fakeToken = (role: "patient" | "staff", id = 999999): string =>
  generateToken({ id, role });

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export const startServer = async (): Promise<TestServer> => {
  const app = createApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/api`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      )
  };
};

export const isDatabaseAvailable = async (): Promise<boolean> => {
  try {
    await pool.query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

// Numery testowe: +48999xxxxxx – łatwe do posprzątania po testach.
export const TEST_PHONE_PREFIX = "+48999";

export const randomTestPhone = (): string =>
  `${TEST_PHONE_PREFIX}${Math.floor(100000 + Math.random() * 900000)}`;

/**
 * Zapisuje w bazie znany kod weryfikacyjny – tak jakby SMS został wysłany.
 * Dzięki temu test nie musi czytać kodu z konsoli.
 */
export const seedVerificationCode = async (
  phoneNumber: string,
  purpose: "register" | "login"
): Promise<string> => {
  const code = generateCode();

  await pool.execute(
    `INSERT INTO PhoneVerification
       (PhoneNumber, CodeHash, ExpiresAt, Attempts, Purpose)
     VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 0, ?)
     ON DUPLICATE KEY UPDATE
       CodeHash = VALUES(CodeHash),
       ExpiresAt = VALUES(ExpiresAt),
       Attempts = 0,
       VerifiedAt = NULL,
       Purpose = VALUES(Purpose)`,
    [phoneNumber, hashCode(code), purpose]
  );

  return code;
};

/** Pracownik z db/02_seed.sql (Ewa Lewandowska, rola "staff") */
export const STAFF_PHONE = "+48500000001";

/** Gabinet oznaczający terminy utworzone przez testy – sprzątane w cleanupTestData() */
export const TEST_CABINET = "TEST-AUTO";

/** Data "RRRR-MM-DD" za `days` dni (czas lokalny). */
export const dateInDays = (days: number): string => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Wstawia termin bezpośrednio do bazy, przesunięty o `minutesFromNow` względem NOW()
 * (ujemna wartość = termin w przeszłości). Zwraca TermID.
 */
export const insertTestTerm = async (
  doctorId: number,
  minutesFromNow: number,
  status: "free" | "reserved" = "free"
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO Terms (StartDate, EndDate, Status, Cabinet, DoctorID)
     VALUES (DATE_ADD(NOW(), INTERVAL ? MINUTE), DATE_ADD(NOW(), INTERVAL ? MINUTE), ?, ?, ?)`,
    [minutesFromNow, minutesFromNow + 30, status, TEST_CABINET, doctorId]
  );
  return result.insertId;
};

/** Usuwa wszystkich użytkowników testowych, ich rezerwacje i kody, zwalniając terminy. */
export const cleanupTestData = async (): Promise<void> => {
  const like = `${TEST_PHONE_PREFIX}%`;

  await pool.execute(
    `UPDATE Terms t
     INNER JOIN Reservation r
       ON r.TermsTermID = t.TermID AND r.TermsDoctorID = t.DoctorID
     INNER JOIN \`User\` u ON u.ID = r.UserID
     SET t.Status = 'free'
     WHERE u.PhoneNumber LIKE ?
       AND r.Status = 'active'
       AND t.Status = 'reserved'`,
    [like]
  );

  await pool.execute(
    `DELETE r FROM Reservation r
     INNER JOIN \`User\` u ON u.ID = r.UserID
     WHERE u.PhoneNumber LIKE ?`,
    [like]
  );

  await pool.execute("DELETE FROM `User` WHERE PhoneNumber LIKE ?", [like]);
  await pool.execute(
    "DELETE FROM PhoneVerification WHERE PhoneNumber LIKE ? OR PhoneNumber = ?",
    [like, STAFF_PHONE]
  );

  // Terminy utworzone przez testy (ich rezerwacje zostały usunięte wyżej)
  await pool.execute("DELETE FROM Terms WHERE Cabinet = ?", [TEST_CABINET]);
};

/** Rejestruje nowego pacjenta testowego (kod SMS → weryfikacja → konto) i zwraca token. */
export const registerTestPatient = async (
  baseUrl: string,
  phoneNumber: string,
  firstName: string
): Promise<string> => {
  const code = await seedVerificationCode(phoneNumber, "register");

  const verify = await api(baseUrl, "/phone-verification/verify", {
    method: "POST",
    body: { phoneNumber, code, purpose: "register" }
  });
  if (verify.status !== 200) throw new Error(`verify failed: ${JSON.stringify(verify.body)}`);

  const register = await api(baseUrl, "/auth/register", {
    method: "POST",
    body: { firstName, lastName: "Testowy", phoneNumber }
  });
  if (register.status !== 201) throw new Error(`register failed: ${JSON.stringify(register.body)}`);

  return register.body.token as string;
};

/** Loguje pracownika z seeda (rola "staff") i zwraca token. */
export const loginAsStaff = async (baseUrl: string): Promise<string> => {
  const code = await seedVerificationCode(STAFF_PHONE, "login");

  const verify = await api(baseUrl, "/phone-verification/verify", {
    method: "POST",
    body: { phoneNumber: STAFF_PHONE, code, purpose: "login", role: "staff" }
  });
  if (verify.status !== 200) throw new Error(`staff login failed: ${JSON.stringify(verify.body)}`);

  return verify.body.token as string;
};

export interface JsonResponse {
  status: number;
  body: any;
}

export const api = async (
  baseUrl: string,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    rawBody?: string;
    token?: string;
  } = {}
): Promise<JsonResponse> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body:
      options.rawBody ??
      (options.body !== undefined ? JSON.stringify(options.body) : undefined)
  });

  const body = await res.json().catch(() => null);
  return { status: res.status, body };
};
