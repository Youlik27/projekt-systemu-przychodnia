// Sesja zalogowanego pacjenta.
//
// Po weryfikacji kodu SMS backend zwraca token JWT (ważny domyślnie 1 godzinę).
// Trzymamy go tutaj, żeby pacjent:
//   - po rezerwacji mógł od razu przejść do „Moje wizyty” bez ponownego kodu SMS,
//   - po zalogowaniu w „Moje wizyty” mógł zarezerwować kolejną wizytę bez kodu.
//
// Token zapisujemy w sessionStorage – znika po zamknięciu karty przeglądarki,
// co jest bezpieczniejsze na wspólnym komputerze (np. w bibliotece, u rodziny).
//
// Komponenty React czytają sesję hookiem useSession() – po zalogowaniu
// lub wylogowaniu wszystkie zainteresowane komponenty odświeżą się same.

import { useSyncExternalStore } from 'react';

export interface Session {
  token: string;
  /** Numer w formacie E.164, np. +48600100200 */
  phoneNumber: string;
  /** Imię – znamy je tylko, jeśli pacjent wpisał je w formularzu rezerwacji */
  firstName?: string;
}

const STORAGE_KEY = 'przychodnia-session';

/** Odczytuje datę wygaśnięcia z tokenu JWT (pole „exp”). Token demonstracyjny nie jest JWT. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false; // nie JWT (tryb demo) – backend i tak sprawdzi token
  }
}

function readFromStorage(): Session | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    // Token trybu demo ("demo:...") nie ma sensu po odświeżeniu – dane demo żyją tylko w pamięci
    if (!session.token || session.token.startsWith('demo:')) return null;
    return isTokenExpired(session.token) ? null : session;
  } catch {
    return null; // brak dostępu do sessionStorage (np. tryb prywatny) – sesja tylko w pamięci
  }
}

let current: Session | null = readFromStorage();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function getSession(): Session | null {
  return current;
}

export function setSession(session: Session) {
  current = session;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* sesja zadziała do odświeżenia strony */
  }
  emit();
}

export function clearSession() {
  if (current === null) return;
  current = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nic do zrobienia */
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Hook React: aktualna sesja (null = niezalogowany). */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSession);
}
