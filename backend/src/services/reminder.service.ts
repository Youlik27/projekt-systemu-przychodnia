// =====================================================================
// WF-12: przypomnienia SMS o zbliżających się wizytach (moduł powiadomień, 4.2).
//
// Co config.reminderIntervalMinutes minut backend szuka aktywnych wizyt,
// które zaczynają się w ciągu najbliższych config.reminderHoursBefore godzin
// i nie dostały jeszcze przypomnienia DLA TEGO TERMINU (tabela ReservationReminder,
// db/06_reservation_reminder.sql). Po zmianie terminu (WF-08) przypomnienie
// zostanie wysłane ponownie – już z nową datą.
//
// Pracownik może też uruchomić wysyłkę ręcznie: POST /api/staff/reminders/run
// =====================================================================

import type { ResultSetHeader } from "mysql2/promise";
import { pool, type Rows } from "../db.js";
import { config } from "../config.js";
import { messages, notifyPatient } from "./notification.service.js";

interface DueReminderRow {
  ReservationID: number;
  TermID: number;
  StartDate: Date;
  Cabinet: string | null;
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
  PatientPhone: string;
}

/** Ile przypomnień maksymalnie w jednym przebiegu (ochrona bramki SMS) */
const BATCH_SIZE = 100;

export interface ReminderRunResult {
  sent: number;
  failed: number;
}

/** Jeden przebieg: wysyła wszystkie zaległe przypomnienia. */
export const sendDueReminders = async (): Promise<ReminderRunResult> => {
  const [due] = await pool.execute<Rows<DueReminderRow>>(
    `SELECT
       r.ID AS ReservationID,
       t.TermID,
       t.StartDate,
       t.Cabinet,
       d.FirstName AS DoctorFirstName,
       d.LastName AS DoctorLastName,
       d.Specialization,
       u.PhoneNumber AS PatientPhone
     FROM Reservation r
     INNER JOIN Terms t
       ON t.TermID = r.TermsTermID
      AND t.DoctorID = r.TermsDoctorID
     INNER JOIN Doctor d ON d.ID = t.DoctorID
     INNER JOIN \`User\` u ON u.ID = r.UserID
     WHERE r.Status = 'active'
       AND t.StartDate > NOW()
       AND t.StartDate <= DATE_ADD(NOW(), INTERVAL ? HOUR)
       AND NOT EXISTS (
         SELECT 1 FROM ReservationReminder rr
         WHERE rr.ReservationID = r.ID AND rr.TermID = t.TermID
       )
     ORDER BY t.StartDate ASC
     LIMIT ${BATCH_SIZE}`,
    [config.reminderHoursBefore]
  );

  let sent = 0;
  let failed = 0;

  for (const row of due) {
    // Najpierw zapisujemy znacznik (INSERT IGNORE) – jeśli dwa przebiegi
    // nałożą się na siebie, tylko jeden „wygra” i wyśle SMS.
    const [claim] = await pool.execute<ResultSetHeader>(
      `INSERT IGNORE INTO ReservationReminder (ReservationID, TermID) VALUES (?, ?)`,
      [row.ReservationID, row.TermID]
    );

    if (claim.affectedRows !== 1) continue;

    const ok = await notifyPatient(
      row.PatientPhone,
      messages.reminder({
        startDate: row.StartDate,
        doctorFirstName: row.DoctorFirstName,
        doctorLastName: row.DoctorLastName,
        specialization: row.Specialization,
        cabinet: row.Cabinet
      })
    );

    if (ok) {
      sent++;
    } else {
      // SMS nie wyszedł – usuwamy znacznik, żeby spróbować w następnym przebiegu
      await pool.execute(
        `DELETE FROM ReservationReminder WHERE ReservationID = ? AND TermID = ?`,
        [row.ReservationID, row.TermID]
      );
      failed++;
    }
  }

  return { sent, failed };
};

let timer: NodeJS.Timeout | null = null;
let running = false;

/** Uruchamia cykliczne wysyłanie przypomnień (wywoływane w index.ts). */
export const startReminderScheduler = (): void => {
  if (!config.remindersEnabled || timer) return;

  const tick = async () => {
    if (running) return; // poprzedni przebieg jeszcze trwa
    running = true;
    try {
      const result = await sendDueReminders();
      if (result.sent > 0 || result.failed > 0) {
        console.log(`[reminders] wysłano: ${result.sent}, błędy: ${result.failed}`);
      }
    } catch (error) {
      // np. brak tabeli ReservationReminder (nie wykonano db/06_reservation_reminder.sql)
      console.error(`[${new Date().toISOString()}] Reminder job error:`, error);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => void tick(), config.reminderIntervalMinutes * 60_000);
  timer.unref(); // nie blokuje zamknięcia procesu
  void tick();   // pierwszy przebieg od razu po starcie

  console.log(
    `[reminders] przypomnienia SMS włączone: ${config.reminderHoursBefore} godz. przed wizytą, sprawdzanie co ${config.reminderIntervalMinutes} min`
  );
};
