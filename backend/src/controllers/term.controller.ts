import { pool } from "../db.js";
import type { Term } from "../models.js";
import type { Rows } from "../db.js";
import type { Request, Response } from "express";
import { isPositiveIntString, isValidIsoDate } from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

interface AvailableTerm extends Term {
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
}

// WF-02: wolne terminy, opcjonalnie filtrowane po lekarzu, specjalizacji i dniu.
// GET /api/terms?doctorId=1&specialization=Kardiolog&date=2026-11-20
export const getAvailableTerms = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const conditions: string[] = [
      "t.Status = 'free'",
      "t.StartDate >= NOW()",
      "d.IsActive = TRUE"
    ];

    const params: (string | number)[] = [];

    const { doctorId, specialization, date } = req.query;

    if (doctorId !== undefined) {
      if (!isPositiveIntString(doctorId)) {
        res.status(400).json({
          success: false,
          message: "Nieprawidłowe ID lekarza."
        });
        return;
      }

      conditions.push("t.DoctorID = ?");
      params.push(Number(doctorId));
    }

    if (specialization !== undefined) {
      if (
        typeof specialization !== "string" ||
        !specialization.trim() ||
        specialization.length > 255
      ) {
        res.status(400).json({
          success: false,
          message: "Nieprawidłowa specjalizacja."
        });
        return;
      }

      conditions.push("d.Specialization = ?");
      params.push(specialization.trim());
    }

    if (date !== undefined) {
      if (!isValidIsoDate(date)) {
        res.status(400).json({
          success: false,
          message: "Nieprawidłowa data. Wymagany format: RRRR-MM-DD."
        });
        return;
      }

      conditions.push(
        "t.StartDate >= ? AND t.StartDate < DATE_ADD(?, INTERVAL 1 DAY)"
      );
      params.push(date, date);
    }

    const sql = `
      SELECT
        t.TermID,
        t.StartDate,
        t.EndDate,
        t.Status,
        t.Cabinet,
        t.DoctorID,
        d.FirstName AS DoctorFirstName,
        d.LastName AS DoctorLastName,
        d.Specialization
      FROM Terms t
      INNER JOIN Doctor d ON t.DoctorID = d.ID
      WHERE ${conditions.join(" AND ")}
      ORDER BY t.StartDate ASC, d.LastName ASC
    `;

    const [terms] = await pool.execute<Rows<AvailableTerm>>(sql, params);

    res.status(200).json(terms);

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Error fetching available terms",
      "Nie udało się pobrać dostępnych terminów."
    );
  }
};
