
import { pool } from "../db.js";
import type { Doctor } from "../models.js";
import type { Rows } from "../db.js";
import type { Request, Response } from "express";

export const getDoctors = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const [doctors] = await pool.execute<Rows<Doctor>>(
      `SELECT ID, FirstName, LastName, IsActive, Specialization
       FROM Doctor
       WHERE IsActive = TRUE
       ORDER BY LastName, FirstName`
    );

    res.status(200).json(doctors);
  } catch (error) {
    console.error("Error fetching doctors:", error);

    res.status(500).json({
      success: false,
      message: "Nie udało się pobrać listy lekarzy."
    });
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

    const specializations = rows.map(
      (row) => row.Specialization
    );

    res.status(200).json(specializations);
  } catch (error) {
    console.error("Error fetching specializations:", error);

    res.status(500).json({
      success: false,
      message: "Nie udało się pobrać specjalizacji."
    });
  }
};
