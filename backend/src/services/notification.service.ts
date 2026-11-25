// =====================================================================
// Moduł powiadomień (dokumentacja 4.2) – treść i wysyłka SMS-ów do pacjentów.
//
// Powiadomienia są „best effort”: błąd bramki SMS NIE cofa operacji
// (np. anulowanie wizyty przez rejestrację jest ważne, nawet jeśli SMS nie dotrze).
// Błąd trafia tylko do logu.
//
// Treść SMS-ów jest bez polskich znaków – wiadomość w alfabecie GSM mieści
// 160 znaków, a z polskimi znakami tylko 70 (i kosztuje kilka SMS-ów).
// =====================================================================

import { config } from "../config.js";
import { sendSms } from "./sms.service.js";

const POLISH_CHARS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
  Ą: "A", Ć: "C", Ę: "E", Ł: "L", Ń: "N", Ó: "O", Ś: "S", Ź: "Z", Ż: "Z"
};

/** „Wiśniewska” → „Wisniewska” (alfabet GSM) */
export const toGsm = (text: string): string =>
  text.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_CHARS[ch] ?? ch);

/** Data wizyty w SMS-ie, np. „19.11.2026 o 10:30” (czas polski). */
export const formatVisitDate = (date: Date): string => {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}.${get("month")}.${get("year")} o ${get("hour")}:${get("minute")}`;
};

export interface VisitInfo {
  startDate: Date;
  doctorFirstName: string;
  doctorLastName: string;
  specialization: string;
  cabinet: string | null;
}

const describeVisit = (visit: VisitInfo): string =>
  `${visit.specialization}, dr ${visit.doctorFirstName} ${visit.doctorLastName}, ${formatVisitDate(visit.startDate)}`;

export const messages = {
  /** WF-12 – przypomnienie przed wizytą */
  reminder: (visit: VisitInfo) =>
    toGsm(
      `Przychodnia Zdrowie: przypominamy o wizycie - ${describeVisit(visit)}` +
        (visit.cabinet ? `, gabinet ${visit.cabinet}` : "") +
        `. ${config.clinicAddress}. Odwolanie: Moje wizyty lub tel. ${config.clinicPhone}.`
    ),

  /** WF-11 – rejestracja anulowała wizytę pacjenta */
  cancelledByClinic: (visit: VisitInfo) =>
    toGsm(
      `Przychodnia Zdrowie: Twoja wizyta (${describeVisit(visit)}) zostala odwolana przez przychodnie. ` +
        `Umow nowy termin online lub zadzwon: ${config.clinicPhone}.`
    ),

  /** WF-11 – rejestracja przeniosła wizytę na inny termin */
  rescheduledByClinic: (visit: VisitInfo) =>
    toGsm(
      `Przychodnia Zdrowie: Twoja wizyta zostala przeniesiona na nowy termin: ${describeVisit(visit)}` +
        (visit.cabinet ? `, gabinet ${visit.cabinet}` : "") +
        `. Pytania: tel. ${config.clinicPhone}.`
    ),

  /** WF-11 – rejestracja zapisała pacjenta na wizytę (np. przez telefon) */
  bookedByClinic: (visit: VisitInfo) =>
    toGsm(
      `Przychodnia Zdrowie: zarezerwowano wizyte - ${describeVisit(visit)}` +
        (visit.cabinet ? `, gabinet ${visit.cabinet}` : "") +
        `. ${config.clinicAddress}.`
    )
};

/** Wysyła SMS; błąd tylko loguje (nie przerywa operacji, która go wywołała). */
export const notifyPatient = async (phoneNumber: string, message: string): Promise<boolean> => {
  try {
    await sendSms({ phoneNumber, message });
    return true;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Notification SMS failed:`, error);
    return false;
  }
};
