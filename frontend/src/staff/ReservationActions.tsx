import { useEffect, useRef, useState } from 'react';
import { ApiError, type ReservationStatus } from '../api';
import { setVisitOutcome, staffCancel } from '../staffApi';

// =====================================================================
// Przyciski obsługi jednej rezerwacji przez pracownika (WF-11).
//
//   - wizyta zaplanowana, przed rozpoczęciem: „Przenieś” i „Anuluj”,
//   - wizyta zaplanowana, już rozpoczęta: „Odbyta” i „Nieobecność”,
//   - pozostałe statusy: brak akcji.
//
// Anulowanie jest dwuetapowe (pytanie „Czy na pewno…?” w tym samym miejscu).
// Pacjent dostaje SMS o anulowaniu / przeniesieniu – wysyła go backend.
// =====================================================================

interface Props {
  token: string;
  reservationId: number;
  status: ReservationStatus;
  /** Czy wizyta już się rozpoczęła */
  started: boolean;
  /** Opis do pytania, np. „Jan Kowalski, piątek 20 listopada, 10:00” */
  label: string;
  /** Wynik operacji – rodzic pokazuje komunikat i odświeża listę */
  onDone: (result: { type: 'success' | 'error'; text: string }) => void;
  /** Otwiera wybór nowego terminu (RescheduleVisit) */
  onReschedule: () => void;
}

export default function ReservationActions({ token, reservationId, status, started, label, onDone, onReschedule }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const questionRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (confirming) questionRef.current?.focus();
  }, [confirming]);

  if (status !== 'active') return null;

  const run = async (action: () => Promise<{ message: string }>) => {
    setBusy(true);
    try {
      const res = await action();
      onDone({ type: 'success', text: res.message });
    } catch (e) {
      onDone({ type: 'error', text: e instanceof ApiError ? e.message : 'Operacja się nie udała.' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  if (started) {
    return (
      <div className="actions actions--start">
        <button type="button" className="btn btn--primary btn--small" disabled={busy}
          aria-label={`Wizyta odbyta: ${label}`}
          onClick={() => run(() => setVisitOutcome(token, reservationId, 'completed'))}>
          ✓ Odbyta
        </button>
        <button type="button" className="btn btn--secondary btn--small" disabled={busy}
          aria-label={`Nieobecność pacjenta: ${label}`}
          onClick={() => run(() => setVisitOutcome(token, reservationId, 'no_show'))}>
          Nieobecność
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="confirm-box">
        <p ref={questionRef} tabIndex={-1} className="confirm-box__question">
          Anulować wizytę: {label}? Pacjent dostanie SMS, a termin wróci do puli wolnych.
        </p>
        <div className="actions actions--start">
          <button type="button" className="btn btn--danger btn--small" disabled={busy}
            onClick={() => run(() => staffCancel(token, reservationId))}>
            {busy ? 'Anulowanie…' : 'Tak, anuluj'}
          </button>
          <button type="button" className="btn btn--secondary btn--small" disabled={busy}
            onClick={() => setConfirming(false)}>
            Nie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="actions actions--start">
      <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={onReschedule}
        aria-label={`Przenieś wizytę: ${label}`}>
        Przenieś
      </button>
      <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={() => setConfirming(true)}
        aria-label={`Anuluj wizytę: ${label}`}>
        Anuluj wizytę
      </button>
    </div>
  );
}
