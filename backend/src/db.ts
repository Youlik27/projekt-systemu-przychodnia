import "dotenv/config";
import mysql from "mysql2/promise";
import type { RowDataPacket } from "mysql2/promise";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("Brak DATABASE_URL w pliku .env");
}

const parsedUrl = new URL(databaseUrl);

if (parsedUrl.protocol !== "mysql:") {
  throw new Error("Nieprawidłowy protokół DATABASE_URL");
}

const databaseName = parsedUrl.pathname.slice(1);

if (!databaseName) {
  throw new Error("Brak nazwy bazy danych w DATABASE_URL");
}

export const pool = mysql.createPool({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port) || 3306,
  user: decodeURIComponent(parsedUrl.username),
  password: decodeURIComponent(parsedUrl.password),
  database: databaseName,

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
