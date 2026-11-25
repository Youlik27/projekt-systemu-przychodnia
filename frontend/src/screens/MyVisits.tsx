import { useCallback, useEffect, useRef, useState } from 'react';
import VisitCard from '../components/VisitCard';
import RescheduleVisit from '../components/RescheduleVisit';
import VisitsLogin from './VisitsLogin';
import {
  ApiError,
  cancelReservation,
  formatDay,
  formatTime,
  getMyReservations,
  rescheduleReservation,
  type Reservation,
  type Term,
} from '../api';
import { clearSession, useSession, type Session } from '../session';
import { formatPhone } from '../utils/phone';

// =====================================================================
// Ekran „Moje wizyty” – druga funkcjonalność systemu.
//   WF-06: przeglądanie własnych rezerwacji,
//   WF-07: anulowanie rezerwacji zgodnie z zasadami przychodni,
//   WF-08: zmiana terminu wizyty.
//
// Niezalogowany pacjent widzi formularz logowania kodem SMS (VisitsLogin),
// zalogowany – listę wizyt podzieloną na „Nadchodzące” i „Historia”.
// =====================================================================

interface Props {
  /** Przejście do rezerwacji nowej wizyty (zakładka „Umów wizytę”) */
  onBook: () => void;
}

export default function MyVisits({ onBook }: Props) {
  const session = useSession();
  // Komunikat dla formularza logowania, gdy sesja wygasła w trakcie pracy
  const [loginNotice, setLoginNotice] = useState('');

  // useCallback – stała referencja funkcji, żeby lista nie wczytywała się ponownie przy każdym renderze
  const handleSessionExpired = useCallback(
    () => setLoginNotice('Ze względów bezpieczeństwa sesja wygasła. Zaloguj się ponownie.'),
    [],
  );

  if (!session) {
    // Po ponownym zalogowaniu komunikat o wygaśnięciu sesji jest już nieaktualny
    return <VisitsLogin onBook={onBook} notice={loginNotice} onLoggedIn={() => setLoginNotice('')} />;
  }

  return <VisitsList session={session} onBook={onBook} onSessionExpired={handleSessionExpired} />;
}

// ---------------------------------------------------------------------
// Lista wizyt zalogowanego pacjenta
// ---------------------------------------------------------------------

interface ListProps {
  session: Session;
  onBook: () => void;
  onSessionExpired: () => void;
}

function VisitsList({ session, onBook, onSessionExpired }: ListProps) {
  /** null = trwa wczytywanie */
  const [visits, setVisits] = useState<Reservation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  /** Wynik ostatniej operacji (np. „Wizyta została anulowana”) */
  const [result, setResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  /** ID wizyty, którą właśnie anulujemy */
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  /** Wizyta, której termin pacjent właśnie zmienia (WF-08); null = widok listy */
  const [rescheduling, setRescheduling] = useState<Reservation | null>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);

  /** Obsługa błędu wspólna dla wczytywania i anulowania. Zwraca tekst do pokazania. */
  const describeError = useCallback(
    (e: unknown): string => {
      if (e instanceof ApiError && e.status === 401) {
        // api.ts już usunął sesję – MyVisits pokaże formularz logowania
        onSessionExpired();
      }
      return e instanceof ApiError ? e.message : 'Wystąpił problem techniczny. Spróbuj ponownie za chwilę.';
    },
    [onSessionExpired],
  );

  /** Zwiększenie licznika = ponowne pobranie listy (po anulowaniu, „Spróbuj ponownie”) */
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // Wczytanie listy: po wejściu na ekran, po zmianie pacjenta i po każdym reload().
  // Stan zmieniamy dopiero po odpowiedzi serwera; `active` chroni przed spóźnioną odpowiedzią.
  useEffect(() => {
    let active = true;
    getMyReservations(session.token)
      .then((list) => {
        if (!active) return;
        setVisits(list);
        setLoadError('');
      })
      .catch((e) => {
        if (active) setLoadError(describeError(e));
      });
    return () => {
      active = false;
    };
  }, [session.token, describeError, reloadKey]);

  /** „Spróbuj ponownie” po błędzie wczytywania */
  const retry = () => {
    setLoadError('');
    reload();
  };

  // Po anulowaniu przenosimy fokus na komunikat – czytnik ekranu go odczyta,
  // a pacjent korzystający z klawiatury nie „zgubi się” na stronie.
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const handleCancel = async (visit: Reservation) => {
    setCancellingId(visit.id);
    setResult(null);
    try {
      await cancelReservation(session.token, visit.id);
      setResult({
        type: 'success',
        text: `Wizyta ${formatDay(visit.startDate)} o godz. ${formatTime(visit.startDate)} została anulowana.`,
      });
    } catch (e) {
      // np. 409 – minął termin na odwołanie przez internet
      setResult({ type: 'error', text: describeError(e) });
    } finally {
      setCancellingId(null);
      // Odświeżamy listę, żeby status i przyciski odpowiadały stanowi w bazie
      reload();
    }
  };

  /** Zapis nowego terminu – błędy (np. 409 zajęty termin) pokazuje RescheduleVisit */
  const handleReschedule = async (visit: Reservation, term: Term) => {
    try {
      const updated = await rescheduleReservation(session.token, visit.id, term.TermID);
      setRescheduling(null);
      setResult({
        type: 'success',
        text: `Termin zmieniony. Nowy termin: ${formatDay(updated.startDate)}, godz. ${formatTime(updated.startDate)}.`,
      });
      reload();
    } catch (e) {
      describeError(e); // 401 → wylogowanie i formularz logowania
      throw e;
    }
  };

  // Podział na nadchodzące (zaplanowane) i historię (odbyte, anulowane, nieobecności)
  const upcoming = visits?.filter((v) => v.isUpcoming && v.status === 'active') ?? [];
  const history = visits?.filter((v) => !(v.isUpcoming && v.status === 'active')) ?? [];

  return (
    <div className="visits">
      {/* Kto jest zalogowany + szybkie akcje */}
      <div className="card session-bar">
        <p>
          Zalogowano numerem <strong>{formatPhone(session.phoneNumber)}</strong>
        </p>
        <div className="actions">
          <button type="button" className="btn btn--primary" onClick={onBook}>Umów nową wizytę</button>
          <button type="button" className="btn btn--secondary" onClick={clearSession}>Wyloguj się</button>
        </div>
      </div>

      {result && (
        <p ref={resultRef} tabIndex={-1} className={`alert alert--${result.type}`}
          role={result.type === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{result.type === 'success' ? '✓ ' : '⚠ '}</span>
          {result.text}
        </p>
      )}

      {loadError && (
        <div className="alert alert--error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn--secondary" onClick={retry}>Spróbuj ponownie</button>
        </div>
      )}

      {!visits && !loadError && <p className="loading" role="status">Wczytywanie wizyt…</p>}

      {rescheduling && (
        <RescheduleVisit
          specialization={rescheduling.doctor.specialization}
          currentStart={rescheduling.startDate}
          heading="Zmiana terminu wizyty"
          onConfirm={(term) => handleReschedule(rescheduling, term)}
          onClose={() => setRescheduling(null)}
        />
      )}

      {visits && !rescheduling && (
        <>
          <section aria-labelledby="upcoming-title" className="visits__section">
            <h2 id="upcoming-title" className="section-title">Nadchodzące wizyty ({upcoming.length})</h2>
            {upcoming.length === 0 ? (
              <div className="alert alert--info">
                <p>Nie masz zaplanowanych wizyt.</p>
                <button type="button" className="btn btn--secondary" onClick={onBook}>Umów wizytę</button>
              </div>
            ) : (
              <ul className="visit-list">
                {upcoming.map((v) => (
                  <li key={v.id}>
                    <VisitCard visit={v} busy={cancellingId === v.id} onCancel={handleCancel}
                      onReschedule={(visit) => { setResult(null); setRescheduling(visit); }} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {history.length > 0 && (
            <section aria-labelledby="history-title" className="visits__section">
              <h2 id="history-title" className="section-title">Historia wizyt ({history.length})</h2>
              <ul className="visit-list">
                {history.map((v) => (
                  <li key={v.id}>
                    <VisitCard visit={v} busy={false} onCancel={handleCancel} onReschedule={setRescheduling} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
