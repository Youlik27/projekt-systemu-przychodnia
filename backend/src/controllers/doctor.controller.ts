import { pool } from "../db.js";
import type { Doctor } from "../models.js";
import type { Rows } from "../db.js";
import type { Request, Response } from "express";
import { sendUnexpectedError } from "../utils/errors.js";

// WF-01: lista aktywnych lekarzy, opcjonalnie dla jednej specjalizacji.
// GET /api/doctors?specialization=Kardiolog
export const getDoctors = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { specialization } = req.query;
    const params: string[] = [];
    let filter = "";

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

      filter = "AND Specialization = ?";
      params.push(specialization.trim());
    }

    const [doctors] = await pool.execute<Rows<Doctor>>(
      `SELECT ID, FirstName, LastName, IsActive, Specialization
       FROM Doctor
       WHERE IsActive = TRUE ${filter}
       ORDER BY LastName, FirstName`,
      params
    );

    res.status(200).json(doctors);
  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Error fetching doctors",
      "Nie udało się pobrać listy lekarzy."
    );
  }
};

export const getSpecializations = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const [rows] = await pool.execute<Rows<{ Specialization: string }>>(
      `SELECT DISTINCT Specialization
       FROM Doctor
       WHERE IsActive = TRUE
       ORDER BY Specialization`
    );

    res.status(200).json(rows.map((row) => row.Specialization));
  } catch (error) {
    sendUnexpectedError(
      res,
      error,
      "Error fetching specializations",
      "Nie udało się pobrać specjalizacji."
    );
  }
};
