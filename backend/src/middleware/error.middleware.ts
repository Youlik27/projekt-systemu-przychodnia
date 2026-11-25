import type { NextFunction, Request, Response } from "express";
import { sendUnexpectedError } from "../utils/errors.js";

// Nieznany endpoint – odpowiedź JSON zamiast domyślnej strony HTML Expressa.
export const notFoundHandler = (_req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: "Nie znaleziono zasobu.",
  });
};

// Globalna obsługa błędów (m.in. niepoprawny JSON w treści żądania).
export const errorHandler = (
  error: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const err = error as { type?: string; status?: number };

  if (err?.type === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      message: "Nieprawidłowy format danych (JSON).",
    });
    return;
  }

  if (err?.type === "entity.too.large") {
    res.status(413).json({
      success: false,
      message: "Przesłane dane są zbyt duże.",
    });
    return;
  }

  sendUnexpectedError(
    res,
    error,
    "Unhandled error",
    "Wystąpił nieoczekiwany błąd."
  );
};
