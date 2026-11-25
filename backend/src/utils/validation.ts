// Wspólne reguły walidacji danych wejściowych (UC.B02 – nieprawidłowe dane pacjenta).

export type FieldErrors = Record<string, string>;

// Format E.164, np. +48600100200
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

export const isValidPhone = (phone: unknown): phone is string =>
  typeof phone === "string" && PHONE_PATTERN.test(phone);

export const isPositiveIntString = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[1-9]\d*$/.test(value) &&
  Number.isSafeInteger(Number(value));

export const isPositiveInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** Sprawdza, czy napis YYYY-MM-DD jest istniejącą datą kalendarzową. */
export const isValidIsoDate = (date: unknown): date is string => {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
};

export const isValidBirthDate = (date: unknown): date is string => {
  if (!isValidIsoDate(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const birthDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return year >= 1900 && birthDate <= today;
};

/** Godzina "HH:MM" w zakresie 00:00–23:59 */
export const isValidTime = (time: unknown): time is string =>
  typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

// Imię / nazwisko: litery (także polskie), spacje, myślnik, apostrof.
const NAME_PATTERN = /^[\p{L}][\p{L}' -]*$/u;

export const isValidName = (name: unknown): name is string =>
  typeof name === "string" &&
  name.trim().length > 0 &&
  name.trim().length <= 100 &&
  NAME_PATTERN.test(name.trim());

export const isOptionalEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");
