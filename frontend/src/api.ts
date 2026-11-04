// Komunikacja z backendem (Express, /api).
// Jeśli backend nie działa (brak Dockera / serwera), aplikacja przechodzi
// w tryb demonstracyjny z danymi testowymi, żeby dało się przeklikać cały proces.

export interface Term {
  TermID: number;
  StartDate: string;
  EndDate: string;
  Cabinet: string | null;
  DoctorID: number;
  DoctorFirstName: string;
  DoctorLastName: string;
  Specialization: string;
}

export type Purpose = 'login' | 'register';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const CLINIC_ADDRESS = 'ul. Zdrowa 12, 00-001 Warszawa';
export const DEMO_CODE = '123456';

let demoMode = false;
export const isDemoMode = () => demoMode;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch {
    throw new ApiError(0, 'Brak połączenia z serwerem.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.message ?? 'Wystąpił nieoczekiwany błąd.');
  }
  return data as T;
}

/** Wywołuje API, a gdy serwer nie odpowiada – używa danych demonstracyjnych. */
async function withFallback<T>(real: () => Promise<T>, mock: () => T | Promise<T>): Promise<T> {
  if (demoMode) return mock();
  try {
    return await real();
  } catch (e) {
    // 0 = brak połączenia, 500/502/504 = backend lub baza niedostępne (proxy Vite)
    if (e instanceof ApiError && (e.status === 0 || e.status >= 500)) {
      demoMode = true;
      return mock();
    }
    throw e;
  }
}

// ---------- Dane demonstracyjne (odpowiadają db/02_seed.sql) ----------

const MOCK_DOCTORS = [
  { ID: 1, FirstName: 'Anna', LastName: 'Kowalska', Specialization: 'Internista', Cabinet: '1' },
  { ID: 2, FirstName: 'Piotr', LastName: 'Nowak', Specialization: 'Kardiolog', Cabinet: '2' },
  { ID: 3, FirstName: 'Katarzyna', LastName: 'Wiśniewska', Specialization: 'Pediatra', Cabinet: '3A' },
  { ID: 4, FirstName: 'Tomasz', LastName: 'Wójcik', Specialization: 'Dermatolog', Cabinet: '3B' },
];
const MOCK_PATIENTS = new Set(['+48600100200', '+48600300400']);
const mockReserved = new Set<number>();

function buildMockTerms(): Term[] {
  const terms: Term[] = [];
  let id = 1;
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  let workDays = 0;
  while (workDays < 5) {
    day.setDate(day.getDate() + 1);
    if (day.getDay() === 0 || day.getDay() === 6) continue;
    workDays++;
    for (const doc of MOCK_DOCTORS) {
      for (let m = 0; m <= 150; m += 30) {
        const start = new Date(day);
        start.setHours(9, m);
        const end = new Date(start.getTime() + 30 * 60_000);
        // część terminów „zajęta”, żeby kalendarz wyglądał realistycznie
        const taken = (id * 7 + doc.ID) % 5 === 0;
        if (!taken) {
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
        }
        id++;
      }
    }
  }
  return terms;
}
const MOCK_TERMS = buildMockTerms();
const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms));

// ---------- Publiczne funkcje ----------

export function getSpecializations(): Promise<string[]> {
  return withFallback(
    () => request<string[]>('/specializations'),
    async () => {
      await delay();
      return [...new Set(MOCK_DOCTORS.map((d) => d.Specialization))].sort();
    },
  );
}

export async function getTermsForSpecialization(specialization: string): Promise<Term[]> {
  return withFallback(
    async () => {
      const all = await request<Term[]>('/terms');
      return all.filter((t) => t.Specialization === specialization);
    },
    async () => {
      await delay();
      return MOCK_TERMS.filter(
        (t) => t.Specialization === specialization && !mockReserved.has(t.TermID),
      );
    },
  );
}

/** Wysyła kod SMS. Najpierw próbuje logowania; gdy pacjenta nie ma – zwraca 'register'. */
export async function sendCode(phoneNumber: string, purpose: Purpose): Promise<void> {
  await withFallback(
    () =>
      request('/phone-verification/send', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, purpose }),
      }),
    async () => {
      await delay();
      const exists = MOCK_PATIENTS.has(phoneNumber);
      if (purpose === 'login' && !exists) throw new ApiError(404, 'Nie znaleziono pacjenta.');
      if (purpose === 'register' && exists)
        throw new ApiError(409, 'Użytkownik z tym numerem telefonu już istnieje.');
      return {};
    },
  );
}

export interface VerifyResult {
  token?: string;
}

export function verifyCode(phoneNumber: string, code: string, purpose: Purpose): Promise<VerifyResult> {
  return withFallback(
    () =>
      request<VerifyResult>('/phone-verification/verify', {
        method: 'POST',
        body: JSON.stringify({ phoneNumber, code, purpose }),
      }),
    async () => {
      await delay();
      if (code !== DEMO_CODE) throw new ApiError(400, 'Nieprawidłowy lub wygasły kod.');
      return purpose === 'login' ? { token: 'demo-token' } : {};
    },
  );
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  address: string;
  birthDate: string;
  phoneNumber: string;
}

export function registerPatient(data: RegisterData): Promise<{ token: string }> {
  return withFallback(
    () => request<{ token: string }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    async () => {
      await delay();
      MOCK_PATIENTS.add(data.phoneNumber);
      return { token: 'demo-token' };
    },
  );
}

export function createReservation(token: string, termId: number): Promise<{ reservationId: number }> {
  return withFallback(
    () =>
      request<{ reservationId: number }>('/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ termId }),
      }),
    async () => {
      await delay();
      if (mockReserved.has(termId))
        throw new ApiError(409, 'Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta.');
      mockReserved.add(termId);
      return { reservationId: Math.floor(Math.random() * 9000) + 1000 };
    },
  );
}

// ---------- Formatowanie ----------

export const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });

export const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });

export const dayKey = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
