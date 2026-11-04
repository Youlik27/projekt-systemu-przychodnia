import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "../models.js";
import { verifyToken } from "../services/auth.service.js";

export const authenticateToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      message: "Wymagane jest zalogowanie."
    });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Brak tokenu autoryzacyjnego."
    });
    return;
  }

  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Nieprawidłowy lub wygasły token."
    });
  }
};

export const requireRole = (...roles: UserRole[]) => {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: "Brak uprawnień do wykonania tej operacji."
      });
      return;
    }

    next();
  };
};