import "dotenv/config";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  throw new Error("Brak DATABASE_URL w pliku .env");
}


export const pool = mysql.createPool({
  uri: databaseUrl,
  connectionLimit: 10,

  typeCast(field, next) {
    if (field.type === "TINY" && field.length === 1) {
      const value = field.string();
      return value === null ? null : value === "1";
    }
    return next();
  },
});


export type Rows<T> = (T & RowDataPacket)[];
