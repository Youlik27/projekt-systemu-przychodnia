import type { UserRole } from "../models.js";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: UserRole;
      };
    }
  }
}

export {};