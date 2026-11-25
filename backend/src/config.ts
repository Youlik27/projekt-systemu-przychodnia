// Centralna konfiguracja backendu. Wartości wrażliwe (sekrety, hasła do bazy)
// pochodzą wyłącznie z pliku .env, który NIE trafia do repozytorium.
import "dotenv/config";

const PLACEHOLDER_PATTERN = /^your_random_/;

const requireSecret = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Brak ${name} w pliku .env`);
  }

  if (PLACEHOLDER_PATTERN.test(value)) {
    throw new Error(
      `${name} ma wartość przykładową z .env.example – ustaw losowy sekret.`
    );
  }

  return value;
};

const parseIntInRange = (
  name: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} musi być liczbą całkowitą z zakresu ${min}–${max}.`);
  }

  return value;
};

export const config = {
  port: parseIntInRange("PORT", 3000, 1, 65535),
  isTest: process.env.NODE_ENV === "test",

  jwtSecret: requireSecret("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "1h",
  otpSecret: requireSecret("OTP_SECRET"),

  // Dokumentacja (4.4, krok 6; 4.6, ekran 3): czterocyfrowy kod SMS.
  otpLength: parseIntInRange("OTP_LENGTH", 4, 4, 8),
  otpExpirationMinutes: 5,
  otpMaxAttempts: 5,
  // Ile minut po weryfikacji numeru można dokończyć rejestrację.
  registerWindowMinutes: 15,

  smsProvider: process.env.SMS_PROVIDER || "console",

  // Dokumentacja (4.4, krok 12): potwierdzenie zawiera adres przychodni.
  clinicAddress:
    process.env.CLINIC_ADDRESS || "ul. Zdrowa 12, 00-001 Warszawa",

  // Zasady przychodni dla WF-07: wizytę można odwołać najpóźniej
  // tyle godzin przed jej rozpoczęciem.
  cancelDeadlineHours: parseIntInRange("CANCEL_DEADLINE_HOURS", 2, 0, 168),

  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",

  // Telefon rejestracji – podawany w SMS-ach (np. przy odwołaniu wizyty przez przychodnię)
  clinicPhone: process.env.CLINIC_PHONE || "22 123 45 67",

  // WF-12: przypomnienia SMS o wizytach
  remindersEnabled: process.env.REMINDERS_ENABLED !== "false",
  // Ile godzin przed wizytą wysłać przypomnienie
  reminderHoursBefore: parseIntInRange("REMINDER_HOURS_BEFORE", 24, 1, 168),
  // Co ile minut sprawdzać, czy są wizyty do przypomnienia
  reminderIntervalMinutes: parseIntInRange("REMINDER_INTERVAL_MINUTES", 15, 1, 1440),

  // WF-10: limity przy tworzeniu terminów przez pracownika (ochrona przed pomyłką)
  maxScheduleRangeDays: 31,
  maxSlotsPerRequest: 500,
} as const;
