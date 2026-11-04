
import { pool } from "../db.js";
import type { Term } from "../models.js";
import type { Rows } from "../db.js";
import type { Request, Response } from "express";

interface AvailableTerm extends Term {
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
}

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

    const doctorId = req.query.doctorId;

    if (doctorId !== undefined) {
      if (
        typeof doctorId !== "string" ||
        !/^[1-9]\d*$/.test(doctorId) ||
        !Number.isSafeInteger(Number(doctorId))
      ) {
        res.status(400).json({
          success: false,
          message: "Nieprawidłowe ID lekarza."
        });
        return;
      }

      conditions.push("t.DoctorID = ?");
      params.push(Number(doctorId));
    }

    const date = req.query.date;

    if (date !== undefined) {
      if (
        typeof date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(date)
      ) {
        res.status(400).json({
          success: false,
          message: "Nieprawidłowy format daty. Wymagany format: YYYY-MM-DD."
        });
        return;
      }

      const parsedDate = new Date(`${date}T00:00:00Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
        res.status(400).json({
          success: false,
          message: "Podana data nie jest prawidłowa."
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
      ORDER BY t.StartDate ASC
    `;

    const [terms] = await pool.execute<Rows<AvailableTerm>>(
      sql,
      params
    );

    res.status(200).json(terms);

  } catch (error) {
    console.error("Error fetching available terms:", error);

    res.status(500).json({
      success: false,
      message: "Nie udało się pobrać dostępnych terminów."
    });
  }
};
