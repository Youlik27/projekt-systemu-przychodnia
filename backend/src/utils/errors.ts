import type { Response } from "express";

/** Błąd biznesowy z kodem HTTP – komunikat jest bezpieczny do pokazania użytkownikowi. */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

const DB_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "PROTOCOL_CONNECTION_LOST",
  "ER_CON_COUNT_ERROR",
  "ER_ACCESS_DENIED_ERROR",
  "ER_BAD_DB_ERROR",
]);

const errorCode = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : undefined;

export const isDbUnavailableError = (error: unknown): boolean => {
  const code = errorCode(error);
  return code !== undefined && DB_UNAVAILABLE_CODES.has(code);
};

export const isDuplicateEntryError = (error: unknown): boolean =>
  errorCode(error) === "ER_DUP_ENTRY";

export const TECHNICAL_PROBLEM_MESSAGE =
  "Wystąpił problem techniczny. Spróbuj ponownie za chwilę.";

/**
 * Obsługa błędów nieprzewidzianych (UC.B01.Brak_dostępu_do_BD):
 * pełny opis trafia do logu, użytkownik dostaje komunikat bez szczegółów technicznych.
 */
export const sendUnexpectedError = (
  res: Response,
  error: unknown,
  context: string,
  fallbackMessage: string
): void => {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  console.error(`[${new Date().toISOString()}] ${context}:`, error);

  if (isDbUnavailableError(error)) {
    res.status(503).json({
      success: false,
      message: TECHNICAL_PROBLEM_MESSAGE,
    });
    return;
  }

  res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};
