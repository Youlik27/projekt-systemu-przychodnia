// =====================================================================
// API panelu pracownika przychodni (rola "staff", ścieżki /api/staff/...).
//
// WF-10: harmonogram lekarzy i dostępność terminów,
// WF-11: obsługa rezerwacji pacjentów,
// WF-12: ręczne wysłanie przypomnień SMS.
//
// Każde zapytanie wymaga tokenu pracownika (nagłówek Authorization).
// Panel nie ma trybu demonstracyjnego – gdy backend nie działa, pokazujemy komunikat.
// =====================================================================

import { ApiError, STAFF_NEEDS_SERVER, request, type Reservation, type ReservationStatus } from './api';

export type TermStatus = 'free' | 'reserved' | 'blocked';

/** Lekarz – GET /api/staff/doctors (nazwy pól jak w bazie danych) */
export interface StaffDoctor {
  ID: number;
  FirstName: string;
  LastName: string;
  IsActive: boolean | number;
  Specialization: string;
}

/** Termin w harmonogramie lekarza – razem z rezerwacją i danymi pacjenta (jeśli jest). */
export interface ScheduleTerm {
  termId: number;
  doctorId: number;
  startDate: string;
  endDate: string;
  status: TermStatus;
  cabinet: string | null;
  /** Czy termin już się rozpoczął */
  isPast: boolean;
  reservation: {
    id: number;
    status: ReservationStatus;
    patient: { id: number; firstName: string; lastName: string; phoneNumber: string };
  } | null;
}

/** Rezerwacja widziana przez pracownika – zawiera dane pacjenta. */
export type StaffReservation = Reservation & {
  patient: { id: number; firstName: string; lastName: string; phoneNumber: string };
};

export interface CreateTermsData {
  doctorId: number;
  dateFrom: string;
  dateTo: string;
  startTime: string;
  endTime: string;
  slotMinutes: number;
  cabinet: string | null;
  skipWeekends: boolean;
}

export interface CreateTermsResult {
  message: string;
  created: ScheduleTerm[];
  skipped: { startDate: string; reason: string }[];
}

export interface ReservationFilters {
  from?: string;
  to?: string;
  doctorId?: number;
  status?: ReservationStatus;
  /** Fragment numeru telefonu lub nazwiska */
  patient?: string;
}

/** Zapytanie z tokenem pracownika. Brak serwera → czytelny komunikat zamiast trybu demo. */
async function staffRequest<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  try {
    return await request<T>(path, { ...init, token });
  } catch (e) {
    if (e instanceof ApiError && e.serverUnreachable) throw new ApiError(e.status, STAFF_NEEDS_SERVER, {}, true);
    throw e;
  }
}

const query = (params: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
};

// ---------- WF-10: lekarze i harmonogram ----------

export async function getStaffDoctors(token: string): Promise<StaffDoctor[]> {
  const res = await staffRequest<{ doctors: StaffDoctor[] }>(token, '/staff/doctors');
  return res.doctors;
}

export async function getSchedule(
  token: string,
  doctorId: number,
  from: string,
  to: string,
): Promise<{ doctor: StaffDoctor; terms: ScheduleTerm[] }> {
  return staffRequest(token, `/staff/schedule${query({ doctorId, from, to })}`);
}

export function createTerms(token: string, data: CreateTermsData): Promise<CreateTermsResult> {
  return staffRequest(token, '/staff/terms', { method: 'POST', body: JSON.stringify(data) });
}

/** Blokada ("blocked") lub odblokowanie ("free") terminu. Zarezerwowanego nie można zablokować (409). */
export function setTermStatus(token: string, termId: number, status: 'free' | 'blocked'): Promise<{ message: string }> {
  return staffRequest(token, `/staff/terms/${termId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
}

/** Usunięcie terminu bez historii rezerwacji. */
export function deleteTerm(token: string, termId: number): Promise<{ message: string }> {
  return staffRequest(token, `/staff/terms/${termId}`, { method: 'DELETE' });
}

// ---------- WF-11: rezerwacje ----------

export async function getStaffReservations(token: string, filters: ReservationFilters): Promise<StaffReservation[]> {
  const res = await staffRequest<{ reservations: StaffReservation[] }>(
    token,
    `/staff/reservations${query({ ...filters })}`,
  );
  return res.reservations;
}

/** Zapis pacjenta przez rejestrację (np. telefonicznie). Konto pacjenta zakłada się samo. */
export function staffBook(
  token: string,
  data: { termId: number; phoneNumber: string; firstName: string; lastName: string },
): Promise<{ message: string; reservation: StaffReservation; patientCreated: boolean }> {
  return staffRequest(token, '/staff/reservations', { method: 'POST', body: JSON.stringify(data) });
}

export function staffCancel(token: string, reservationId: number): Promise<{ message: string }> {
  return staffRequest(token, `/staff/reservations/${reservationId}/cancel`, { method: 'PATCH' });
}

/** Przeniesienie wizyty na inny termin tej samej specjalizacji (pacjent dostaje SMS). */
export function staffReschedule(token: string, reservationId: number, termId: number): Promise<{ message: string }> {
  return staffRequest(token, `/staff/reservations/${reservationId}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ termId }),
  });
}

/** Wynik wizyty po jej rozpoczęciu: odbyta albo nieobecność pacjenta. */
export function setVisitOutcome(
  token: string,
  reservationId: number,
  status: 'completed' | 'no_show',
): Promise<{ message: string }> {
  return staffRequest(token, `/staff/reservations/${reservationId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// ---------- WF-12: przypomnienia ----------

export function runReminders(token: string): Promise<{ message: string }> {
  return staffRequest(token, '/staff/reminders/run', { method: 'POST' });
}

export interface StaffReportSummary {
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

export interface StaffDoctorReport {
  doctorId: number;
  firstName: string;
  lastName: string;
  specialization: string;
  total: number;
  active: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

export interface StaffReport {
  success: boolean;
  from: string;
  to: string;
  summary: StaffReportSummary;
  doctors: StaffDoctorReport[];
}

export async function getStaffReport(
  token: string,
  from: string,
  to: string
): Promise<StaffReport> {
  return staffRequest(
    token,
    `/staff/reports?${new URLSearchParams({ from, to }).toString()}`
  );
}
