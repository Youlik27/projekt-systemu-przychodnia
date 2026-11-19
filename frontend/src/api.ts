// =====================================================================
// Komunikacja z backendem (Express, ścieżki /api/...).
//
// Wszystkie zapytania idą przez proxy Vite (vite.config.ts) na http://localhost:3000.
//
// TRYB DEMONSTRACYJNY
// Jeśli backend w ogóle nie odpowiada (nie jest uruchomiony), aplikacja przechodzi
// w tryb demonstracyjny z danymi testowymi, żeby dało się przeklikać cały proces
// bez serwera. Na górze strony pojawia się wtedy wyraźny baner (App.tsx).
//
// WAŻNE: tryb demo włączamy TYLKO, gdy serwer jest nieosiągalny. Jeśli backend
// działa i zwraca błąd (np. 503 „problem techniczny”, gdy baza nie działa),
// pokazujemy ten błąd pacjentowi – nie udajemy, że rezerwacja się udała.
// =====================================================================

import { clearSession } from './session';

// ---------- Typy danych zwracanych przez backend ----------

/** Wolny termin – GET /api/terms (nazwy pól jak w bazie danych). */
export interface Term {
  TermID: number;
  StartDate: string; // ISO, np. "2026-11-20T08:00:00.000Z"
  EndDate: string;
  Cabinet: string | null;
  DoctorID: number;
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
}

/** Cel kodu SMS: logowanie istniejącego pacjenta albo założenie nowego konta. */
export type Purpose = 'login' | 'register';

export type ReservationStatus = 'active' | 'cancelled' | 'completed' | 'no_show';

/** Rezerwacja – odpowiedź POST /api/reservations, GET /api/reservations/me itd. */
export interface Reservation {
  id: number;
  status: ReservationStatus;
  createdAt: string;
  startDate: string;
  endDate: string;
  cabinet: string | null;
  termId: number;
  doctor: {
    id: number;
    firstName: string;
    lastName: string;
    specialization: string;
  };
  clinicAddress: string;
  /** Czy wizyta jeszcze się nie odbyła */
  isUpcoming: boolean;
  /** Czy pacjent może ją sam anulować (zasady przychodni sprawdza backend) */
  canCancel: boolean;
}

/** Błędy konkretnych pól formularza, np. { phoneNumber: "Podaj numer..." } */
export type FieldErrors = Record<string, string>;

/**
 * Błąd zwrócony przez API.
 * - status: kod HTTP (0 = brak połączenia),
 * - message: komunikat z backendu – jest po polsku i nadaje się do pokazania pacjentowi,
 * - fieldErrors: które pola formularza trzeba poprawić (UC.B02),
 * - serverUnreachable: backend w ogóle nie odpowiedział.
 */
export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;
  serverUnreachable: boolean;

  constructor(status: number, message: string, fieldErrors: FieldErrors = {}, serverUnreachable = false) {
    super(message);
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.serverUnreachable = serverUnreachable;
  }
}

/** Zapasowy adres (stopka). Adres w potwierdzeniu rezerwacji przychodzi z backendu. */
export const CLINIC_ADDRESS = 'ul. Zdrowa 12, 00-001 Warszawa';

// ---------- Tryb demonstracyjny (stan + powiadamianie komponentów) ----------

let demoMode = false;
const demoListeners = new Set<() => void>();

export const isDemoMode = () => demoMode;

/** Dla useSyncExternalStore w App.tsx – baner pojawi się od razu po przejściu w tryb demo. */
export function subscribeDemoMode(listener: () => void) {
  demoListeners.add(listener);
  return () => {
    demoListeners.delete(listener);
  };
}

function enableDemoMode() {
  if (demoMode) return;
  demoMode = true;
  demoListeners.forEach((listener) => listener());
}

// ---------- Długość kodu SMS ----------
// Dokumentacja: 4 cyfry. Backend podaje faktyczną długość w odpowiedzi na wysłanie kodu
// (pole codeLength), więc formularz zawsze sprawdza tyle cyfr, ile oczekuje serwer.

let codeLength = 4;
export const getCodeLength = () => codeLength;

/** Kod, który działa w trybie demonstracyjnym. */
export const DEMO_CODE = '1234';

// ---------- Wysyłanie zapytań ----------

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...fetchInit } = init;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...fetchInit, headers: { ...headers, ...fetchInit.headers } });
  } catch {
    // fetch rzuca wyjątek tylko przy braku połączenia (np. serwer Vite nie działa)
    throw new ApiError(0, 'Brak połączenia z serwerem.', {}, true);
  }

  const data = await res.json().catch(() => null);

  // Nasz backend ZAWSZE odpowiada JSON-em (przy błędzie – z polem "message").
  // Odpowiedź bez takiego JSON-a nie pochodzi z backendu, tylko np. z proxy Vite (5xx,
  // gdy backend nie działa) albo z serwera plików, np. GitHub Pages (strona HTML z 404
  // lub 200). Wtedy backendu nie ma, więc przechodzimy w tryb demonstracyjny.
  const fromBackend = data !== null && (res.ok || typeof data.message === 'string');
  if (!fromBackend) {
    throw new ApiError(res.status, 'Brak połączenia z serwerem.', {}, true);
  }

  if (!res.ok) {
    // 401 przy zapytaniu z tokenem = token wygasł lub jest nieprawidłowy → wylogowujemy
    if (res.status === 401 && token) clearSession();

    throw new ApiError(res.status, data?.message ?? 'Wystąpił nieoczekiwany błąd.', data?.errors ?? {});
  }

  return data as T;
}

/**
 * Wywołuje prawdziwe API; gdy serwer jest nieosiągalny – przełącza aplikację
 * w tryb demonstracyjny i używa danych testowych (funkcja `mock`).
 */
async function withFallback<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (demoMode) return mock();
  try {
    return await real();
  } catch (e) {
    if (e instanceof ApiError && e.serverUnreachable) {
      enableDemoMode();
      return mock();
    }
    throw e;
  }
}

// =====================================================================
// Dane demonstracyjne (odpowiadają db/02_seed.sql)
// =====================================================================

const MOCK_DOCTORS = [
  { ID: 1, FirstName: 'Anna', LastName: 'Kowalska', Specialization: 'Internista', Cabinet: '1' },
  { ID: 2, FirstName: 'Piotr', LastName: 'Nowak', Specialization: 'Kardiolog', Cabinet: '2' },
  { ID: 3, FirstName: 'Katarzyna', LastName: 'Wiśniewska', Specialization: 'Pediatra', Cabinet: '3A' },
  { ID: 4, FirstName: 'Tomasz', LastName: 'Wójcik', Specialization: 'Dermatolog', Cabinet: '3B' },
];

/** Pacjenci, którzy „już mają konto” w trybie demo */
const MOCK_PATIENTS = new Set(['+48600100200', '+48600300400']);

/** Terminy zajęte w trybie demo (np. po rezerwacji) */
const mockReserved = new Set<number>();

/** Ile godzin przed wizytą można ją anulować (jak domyślnie w backendzie) */
const MOCK_CANCEL_DEADLINE_HOURS = 2;

function buildMockTerms(): Term[] {
  const terms: Term[] = [];
  let id = 1;
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  let workDays = 0;
  // 5 najbliższych dni roboczych, godziny 9:00–11:30 co 30 minut
  while (workDays < 5) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    workDays++;
    for (const doc of MOCK_DOCTORS) {
      for (let m = 0; m <= 150; m += 30) {
        const start = new Date(day);
        start.setHours(9, m);
        const end = new Date(start.getTime() + 30 * 60_000);
        terms.push({
          TermID: id,
          StartDate: start.toISOString(),
          EndDate: end.toISOString(),
          Cabinet: doc.Cabinet,
          DoctorID: doc.ID,
          DoctorFirstName: doc.FirstName,
          DoctorLastName: doc.LastName,
          Specialization: doc.Specialization,
        });
        // część terminów „zajęta”, żeby kalendarz wyglądał realistycznie
        if ((id * 7 + doc.ID) % 5 === 0) mockReserved.add(id);
        id++;
      }
    }
  }
  return terms;
}
const MOCK_TERMS = buildMockTerms();

/** Rezerwacje w trybie demo; `phone` mówi, do którego pacjenta należą. */
interface MockReservation {
  phone: string;
  id: number;
  status: ReservationStatus;
  createdAt: string;
  term: Term;
}

let nextMockReservationId = 1000;

function pastMockTerm(doctorIndex: number, daysAgo: number, hour: number): Term {
  const doc = MOCK_DOCTORS[doctorIndex];
  const start = new Date();
  start.setDate(start.getDate() - daysAgo);
  start.setHours(hour, 0, 0, 0);
  return {
    TermID: 9000 + nextMockReservationId,
    StartDate: start.toISOString(),
    EndDate: new Date(start.getTime() + 30 * 60_000).toISOString(),
    Cabinet: doc.Cabinet,
    DoctorID: doc.ID,
    DoctorFirstName: doc.FirstName,
    DoctorLastName: doc.LastName,
    Specialization: doc.Specialization,
  };
}

function makeMockReservation(phone: string, term: Term, status: ReservationStatus): MockReservation {
  return { phone, id: nextMockReservationId++, status, createdAt: new Date().toISOString(), term };
}

// Przykładowe wizyty pacjentów testowych – żeby ekran „Moje wizyty” nie był pusty
const mockReservations: MockReservation[] = (() => {
  const upcoming = MOCK_TERMS.find((t) => t.DoctorID === 1 && !mockReserved.has(t.TermID))!;
  mockReserved.add(upcoming.TermID);
  return [
    makeMockReservation('+48600100200', upcoming, 'active'),
    makeMockReservation('+48600100200', pastMockTerm(0, 1, 10), 'completed'),
    makeMockReservation('+48600300400', pastMockTerm(0, 1, 11), 'no_show'),
  ];
})();

/** Zamienia rezerwację demo na taki sam kształt danych, jaki zwraca backend. */
function toReservation(r: MockReservation): Reservation {
  const start = new Date(r.term.StartDate).getTime();
  const isUpcoming = start > Date.now();
  return {
    id: r.id,
    status: r.status,
    createdAt: r.createdAt,
    startDate: r.term.StartDate,
    endDate: r.term.EndDate,
    cabinet: r.term.Cabinet,
    termId: r.term.TermID,
    doctor: {
      id: r.term.DoctorID,
      firstName: r.term.DoctorFirstName,
      lastName: r.term.DoctorLastName,
      specialization: r.term.Specialization,
    },
    clinicAddress: CLINIC_ADDRESS,
    isUpcoming,
    canCancel: r.status === 'active' && start > Date.now() + MOCK_CANCEL_DEADLINE_HOURS * 3_600_000,
  };
}

/** Token demo ma postać "demo:+48600100200" – z niego odczytujemy numer pacjenta. */
const mockToken = (phone: string) => `demo:${phone}`;
const phoneFromMockToken = (token: string) => token.replace(/^demo:/, '');

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

// =====================================================================
// Publiczne funkcje – używane przez ekrany
// =====================================================================

/** WF-01: lista specjalizacji aktywnych lekarzy. GET /api/specializations */
export function getSpecializations(): Promise<string[]> {
  return withFallback(
    () => request<string[]>('/specializations'),
    async () => {
      await delay();
      return [...new Set(MOCK_DOCTORS.map((d) => d.Specialization))].sort();
    },
  );
}

/** WF-02: wolne terminy wybranej specjalizacji. Filtrowanie odbywa się w backendzie. */
export function getTermsForSpecialization(specialization: string): Promise<Term[]> {
  return withFallback(
    () => request<Term[]>(`/terms?specialization=${encodeURIComponent(specialization)}`),
    async () => {
      await delay();
      return MOCK_TERMS.filter(
        (t) =>
          t.Specialization === specialization &&
          !mockReserved.has(t.TermID) &&
          new Date(t.StartDate).getTime() > Date.now(),
      );
    },
  );
}

/**
 * Wysyła kod SMS. POST /api/phone-verification/send
 * - purpose 'login' + brak pacjenta → ApiError 404,
 * - purpose 'register' + pacjent już istnieje → ApiError 409.
 */
export async function sendCode(phoneNumber: string, purpose: Purpose): Promise<void> {
  await withFallback(
    async () => {
      const res = await request<{ codeLength?: number }>('/phone-verification/send', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, purpose }),
      });
      if (typeof res.codeLength === 'number') codeLength = res.codeLength;
    },
    async () => {
      await delay();
      codeLength = DEMO_CODE.length;
      const exists = MOCK_PATIENTS.has(phoneNumber);
      if (purpose === 'login' && !exists) throw new ApiError(404, 'Nie znaleziono pacjenta.');
      if (purpose === 'register' && exists)
        throw new ApiError(409, 'Użytkownik z tym numerem telefonu już istnieje.');
    },
  );
}

export interface VerifyResult {
  /** Token dostajemy tylko przy logowaniu; przy rejestracji – z /auth/register */
  token?: string;
}

/** Sprawdza kod SMS. POST /api/phone-verification/verify. Błędny/wygasły kod → ApiError 400. */
export function verifyCode(phoneNumber: string, code: string, purpose: Purpose): Promise<VerifyResult> {
  return withFallback(
    () =>
      request<VerifyResult>('/phone-verification/verify', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, code, purpose }),
      }),
    async () => {
      await delay();
      if (code !== DEMO_CODE) throw new ApiError(400, 'Wprowadzony kod jest nieprawidłowy lub wygasł.');
      return purpose === 'login' ? { token: mockToken(phoneNumber) } : {};
    },
  );
}

/** Dokumentacja (4.4 krok 5): do założenia konta wystarczy imię, nazwisko i telefon. */
export interface RegisterData {
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

/** WF-04: automatyczne założenie konta po weryfikacji numeru. POST /api/auth/register */
export function registerPatient(data: RegisterData): Promise<{ token: string }> {
  return withFallback(
    () => request<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    async () => {
      await delay();
      MOCK_PATIENTS.add(data.phoneNumber);
      return { token: mockToken(data.phoneNumber) };
    },
  );
}

/**
 * WF-03 + WF-09: rezerwacja terminu. POST /api/reservations
 * Zwraca pełne dane do ekranu potwierdzenia (lekarz, data, gabinet, adres).
 * Termin zajęty w międzyczasie → ApiError 409 (UC.Wizyta.Alt04).
 */
export function createReservation(token: string, termId: number): Promise<Reservation> {
  return withFallback(
    async () => {
      const res = await request<{ reservation: Reservation }>('/reservations', {
        method: 'POST',
        token,
        body: JSON.stringify({ termId }),
      });
      return res.reservation;
    },
    async () => {
      await delay();
      const term = MOCK_TERMS.find((t) => t.TermID === termId);
      if (!term) throw new ApiError(404, 'Nie znaleziono wybranego terminu.');
      if (mockReserved.has(termId))
        throw new ApiError(409, 'Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta.');
      mockReserved.add(termId);
      const reservation = makeMockReservation(phoneFromMockToken(token), term, 'active');
      mockReservations.push(reservation);
      return toReservation(reservation);
    },
  );
}

/** WF-06: lista wizyt zalogowanego pacjenta (najpierw nadchodzące). GET /api/reservations/me */
export function getMyReservations(token: string): Promise<Reservation[]> {
  return withFallback(
    async () => {
      const res = await request<{ reservations: Reservation[] }>('/reservations/me', { token });
      return res.reservations;
    },
    async () => {
      await delay();
      const phone = phoneFromMockToken(token);
      const list = mockReservations.filter((r) => r.phone === phone).map(toReservation);
      // ta sama kolejność co w backendzie: nadchodzące od najbliższej, potem historia od najnowszej
      return list.sort((a, b) => {
        if (a.isUpcoming !== b.isUpcoming) return a.isUpcoming ? -1 : 1;
        const diff = new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
        return a.isUpcoming ? diff : -diff;
      });
    },
  );
}

/** WF-07: anulowanie własnej wizyty. PATCH /api/reservations/:id/cancel */
export function cancelReservation(token: string, reservationId: number): Promise<Reservation> {
  return withFallback(
    async () => {
      const res = await request<{ reservation: Reservation }>(`/reservations/${reservationId}/cancel`, {
        method: 'PATCH',
        token,
      });
      return res.reservation;
    },
    async () => {
      await delay();
      const r = mockReservations.find((x) => x.id === reservationId && x.phone === phoneFromMockToken(token));
      if (!r) throw new ApiError(404, 'Nie znaleziono rezerwacji.');
      if (!toReservation(r).canCancel)
        throw new ApiError(409, 'Tej wizyty nie można już anulować przez internet.');
      r.status = 'cancelled';
      mockReserved.delete(r.term.TermID); // termin wraca do puli wolnych
      return toReservation(r);
    },
  );
}

// =====================================================================
// Formatowanie dat (zawsze po polsku, w strefie czasowej przeglądarki)
// =====================================================================

/** "czwartek, 20 listopada" */
export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

/** "czwartek, 20 listopada 2026" – dla historii wizyt, gdzie rok ma znaczenie */
export const formatDayWithYear = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** "09:30" */
export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

/** Klucz dnia "2026-11-20" – do grupowania terminów w kafelki dni */
export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
