import { useEffect, useRef, useState } from 'react';
import { formatDay, formatDayWithYear, formatTime, type Reservation, type ReservationStatus } from '../api';

// =====================================================================
// Karta jednej wizyty na liście „Moje wizyty” (WF-06) + anulowanie (WF-07)
// + zmiana terminu (WF-08).
//
// Anulowanie jest dwuetapowe, żeby pacjent nie odwołał wizyty przypadkiem:
//   „Anuluj wizytę” → pytanie „Czy na pewno…?” → „Tak, anuluj wizytę”.
// Pytanie pojawia się w tym samym miejscu (bez okna modalnego) – to prostsze
// dla osób starszych i dla czytników ekranu. Fokus przenosimy na pytanie.
// =====================================================================

/** Status wizyty: tekst + ikona (nie tylko kolor – ważne dla daltonistów, WNF-01). */
const STATUS_LABELS: Record<ReservationStatus, { text: string; icon: string }> = {
  active: { text: 'Zaplanowana', icon: '●' },
  cancelled: { text: 'Anulowana', icon: '✕' },
  completed: { text: 'Odbyta', icon: '✓' },
  no_show: { text: 'Nieobecność', icon: '!' },
};

interface Props {
  visit: Reservation;
  /** Czy trwa anulowanie tej wizyty (przyciski są wtedy zablokowane) */
  busy: boolean;
  onCancel: (visit: Reservation) => void;
  /** Zmiana terminu (WF-08) – otwiera wybór nowej godziny */
  onReschedule: (visit: Reservation) => void;
}

export default function VisitCard({ visit, busy, onCancel, onReschedule }: Props) {
  const [confirming, setConfirming] = useState(false);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const status = STATUS_LABELS[visit.status];
  const titleId = `visit-${visit.id}-title`;

  // Po kliknięciu „Anuluj wizytę” czytnik ekranu od razu odczyta pytanie
  useEffect(() => {
    if (confirming) questionRef.current?.focus();
  }, [confirming]);

  // Wizyta zaplanowana, ale po terminie na odwołanie przez internet
  const tooLateToCancel = visit.status === 'active' && visit.isUpcoming && !visit.canCancel;
  // Dla historii pokazujemy też rok
  const day = visit.isUpcoming ? formatDay(visit.startDate) : formatDayWithYear(visit.startDate);

  return (
    <article className={`visit visit--${visit.status}`} aria-labelledby={titleId}>
      <div className="visit__head">
        <h3 id={titleId} className="visit__title">
          {visit.doctor.specialization} – dr {visit.doctor.firstName} {visit.doctor.lastName}
        </h3>
        <span className={`badge badge--${visit.status}`}>
          <span aria-hidden="true">{status.icon} </span>
          <span className="sr-only">Status: </span>
          {status.text}
        </span>
      </div>

      <dl className="visit__details">
        <div><dt>Data</dt><dd>{day}</dd></div>
        <div><dt>Godzina</dt><dd>{formatTime(visit.startDate)}</dd></div>
        {visit.cabinet && <div><dt>Gabinet</dt><dd>nr {visit.cabinet}</dd></div>}
        {visit.isUpcoming && visit.status === 'active' && (
          <div><dt>Adres</dt><dd>{visit.clinicAddress}</dd></div>
        )}
      </dl>

      {/* Zmiana terminu i anulowanie – tylko jeśli backend na to pozwala (canCancel) */}
      {visit.canCancel && !confirming && (
        <div className="actions actions--start">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => onReschedule(visit)}>
            Zmień termin
          </button>
          <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setConfirming(true)}>
            Anuluj wizytę
          </button>
        </div>
      )}

      {visit.canCancel && confirming && (
        <div className="confirm-box" role="group" aria-labelledby={`visit-${visit.id}-question`}>
          <p id={`visit-${visit.id}-question`} ref={questionRef} tabIndex={-1} className="confirm-box__question">
            Czy na pewno chcesz anulować wizytę {formatDay(visit.startDate)} o godz. {formatTime(visit.startDate)}?
            Termin zostanie zwolniony dla innych pacjentów.
          </p>
          <div className="actions">
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => onCancel(visit)}>
              {busy ? 'Anulowanie…' : 'Tak, anuluj wizytę'}
            </button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setConfirming(false)}>
              Nie, zostaw wizytę
            </button>
          </div>
        </div>
      )}

      {tooLateToCancel && (
        <p className="visit__note">
          Tej wizyty nie można już odwołać ani przenieść przez internet. Zadzwoń do rejestracji:{' '}
          <a href="tel:+48221234567">(22) 123 45 67</a>.
        </p>
      )}
    </article>
  );
}
