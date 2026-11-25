// Sesje zalogowanych użytkowników: pacjenta i pracownika przychodni.
//
// Po weryfikacji kodu SMS backend zwraca token JWT (ważny domyślnie 1 godzinę).
// Trzymamy go tutaj, żeby pacjent:
//   - po rezerwacji mógł od razu przejść do „Moje wizyty” bez ponownego kodu SMS,
//   - po zalogowaniu w „Moje wizyty” mógł zarezerwować kolejną wizytę bez kodu.
//
// Pracownik ma OSOBNĄ sesję (inny klucz w sessionStorage), więc zalogowanie się
// do panelu pracownika nie wyloguje pacjenta i odwrotnie.
//
// Token zapisujemy w sessionStorage – znika po zamknięciu karty przeglądarki,
// co jest bezpieczniejsze na wspólnym komputerze (np. w bibliotece, u rodziny).
//
// Komponenty React czytają sesję hookiem useSession() / useStaffSession() – po zalogowaniu
// lub wylogowaniu wszystkie zainteresowane komponenty odświeżą się same.

import { useSyncExternalStore } from 'react';

export interface Session {
  token: string;
  /** Numer w formacie E.164, np. +48600100200 */
  phoneNumber: string;
  /** Imię – znamy je tylko, jeśli użytkownik je wpisał lub backend je zwrócił */
  firstName?: string;
}

/** Odczytuje datę wygaśnięcia z tokenu JWT (pole „exp”). Token demonstracyjny nie jest JWT. */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
  } catch {
    return false; // nie JWT (tryb demo) – backend i tak sprawdzi token
  }
}

/**
 * Tworzy niezależny „magazyn” sesji zapisywany pod podanym kluczem.
 * Ten sam kod obsługuje sesję pacjenta i pracownika.
 */
function createSessionStore(storageKey: string) {
  function readFromStorage(): Session | null {
    try {
      const raw = sessionStorage.getItem(storageKey);
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
  const emit = () => listeners.forEach((listener) => listener());

  const get = (): Session | null => current;

  const set = (session: Session) => {
    current = session;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(session));
    } catch {
      /* sesja zadziała do odświeżenia strony */
    }
    emit();
  };

  const clear = () => {
    if (current === null) return;
    current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* nic do zrobienia */
    }
    emit();
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  /** Hook React: aktualna sesja (null = niezalogowany). */
  const use = (): Session | null => useSyncExternalStore(subscribe, get);

  return { get, set, clear, use };
}

// ---------- Pacjent ----------
const patientStore = createSessionStore('przychodnia-session');
export const getSession = patientStore.get;
export const setSession = patientStore.set;
export const clearSession = patientStore.clear;
export const useSession = patientStore.use;

// ---------- Pracownik przychodni (rola "staff") ----------
const staffStore = createSessionStore('przychodnia-staff-session');
export const getStaffSession = staffStore.get;
export const setStaffSession = staffStore.set;
export const clearStaffSession = staffStore.clear;
export const useStaffSession = staffStore.use;
