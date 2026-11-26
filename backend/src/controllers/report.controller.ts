
import type { Request, Response } from "express";
import { pool, type Rows } from "../db.js";
import { isValidIsoDate } from "../utils/validation.js";
import { sendUnexpectedError } from "../utils/errors.js";

interface SummaryRow {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

interface DoctorReportRow extends SummaryRow {
  doctorId: number;
  firstName: string;
  lastName: string;
  specialization: string;
}

export const getStaffReport = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { from, to } = req.query;

    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      res.status(400).json({
        success: false,
        message: "Podaj prawidłowy zakres dat w formacie RRRR-MM-DD."
      });
      return;
    }

    if (from > to) {
      res.status(400).json({
        success: false,
        message: "Data początkowa nie może być późniejsza niż końcowa."
      });
      return;
    }

    const [summaryRows] = await pool.execute<Rows<SummaryRow>>(
      `SELECT
        COUNT(*) AS total,
        COALESCE(SUM(r.Status = 'active'), 0) AS active,
        COALESCE(SUM(r.Status = 'completed'), 0) AS completed,
        COALESCE(SUM(r.Status = 'cancelled'), 0) AS cancelled,
        COALESCE(SUM(r.Status = 'no_show'), 0) AS no_show
      FROM Reservation r
      INNER JOIN Terms t
        ON t.TermID = r.TermsTermID
        AND t.DoctorID = r.TermsDoctorID
      WHERE t.StartDate >= ?
        AND t.StartDate < DATE_ADD(?, INTERVAL 1 DAY)`,
      [from, to]
    );

    const [doctorRows] = await pool.execute<Rows<DoctorReportRow>>(
      `SELECT
        d.ID AS doctorId,
        d.FirstName AS firstName,
        d.LastName AS lastName,
        d.Specialization AS specialization,
        COUNT(r.ID) AS total,
        COALESCE(SUM(r.Status = 'active'), 0) AS active,
        COALESCE(SUM(r.Status = 'completed'), 0) AS completed,
        COALESCE(SUM(r.Status = 'cancelled'), 0) AS cancelled,
        COALESCE(SUM(r.Status = 'no_show'), 0) AS no_show
      FROM Doctor d
      LEFT JOIN Terms t
        ON t.DoctorID = d.ID
        AND t.StartDate >= ?
        AND t.StartDate < DATE_ADD(?, INTERVAL 1 DAY)
      LEFT JOIN Reservation r
        ON r.TermsTermID = t.TermID
        AND r.TermsDoctorID = t.DoctorID
      GROUP BY
        d.ID, d.FirstName, d.LastName, d.Specialization
      ORDER BY total DESC, d.LastName ASC`,
      [from, to]
    );

    res.status(200).json({
      success: true,
      from,
      to,
      summary: summaryRows[0],
      doctors: doctorRows
    });

  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Staff report error",
      "Nie udało się wygenerować raportu."
    );
  }
};
