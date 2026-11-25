// Modele danych – odpowiadają tabelom z db/*.sql.
// Przy zmianie tabeli w SQL trzeba też zaktualizować odpowiedni interfejs tutaj.

export type UserRole = "patient" | "staff";
export type TermStatus = "free" | "reserved" | "blocked";
export type ReservationStatus = "active" | "cancelled" | "completed" | "no_show";

export interface User {
  ID: number;
  FirstName: string;
  LastName: string;
  Address: string | null;
  BirthDate: Date | null;
  PhoneNumber: string;
  Role: UserRole;
}

export interface Doctor {
  ID: number;
  FirstName: string;
  LastName: string;
  IsActive: boolean;
  Specialization: string;
}

export interface Term {
  TermID: number;
  StartDate: Date;
  EndDate: Date;
  Status: TermStatus;
  Cabinet: string | null;
  DoctorID: number;
}

export interface Reservation {
  ID: number;
  CreatedAt: Date;
  Status: ReservationStatus;
  UserID: number;
  TermsTermID: number;
  TermsDoctorID: number;
}

/** db/06_reservation_reminder.sql – wysłane przypomnienia SMS (WF-12) */
export interface ReservationReminder {
  ReservationID: number;
  TermID: number;
  SentAt: Date;
}
