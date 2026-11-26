
import { useEffect, useRef, useState } from 'react';
import StaffLogin from './StaffLogin';
import ScheduleTab from './ScheduleTab';
import ReservationsTab from './ReservationsTab';
import ReportsTab from './ReportsTab';
import { ApiError } from '../api';
import { getStaffDoctors, runReminders, type StaffDoctor } from '../staffApi';
import { clearStaffSession, useStaffSession } from '../session';
import { formatPhone } from '../utils/phone';

// =====================================================================
// Panel pracownika przychodni.
//
// WF-10: Harmonogram lekarzy
// WF-11: Obsługa rezerwacji
// WF-12: Przypomnienia SMS
// WF-13: Raporty i statystyki
// =====================================================================

type Tab = 'schedule' | 'reservations' | 'reports';

export default function StaffApp() {
  const session = useStaffSession();
  const [tab, setTab] = useState<Tab>('schedule');
  const [doctors, setDoctors] = useState<StaffDoctor[] | null>(null);
  const [error, setError] = useState('');
  const [reminderMsg, setReminderMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Fokus na nagłówku po zalogowaniu lub zmianie zakładki.
  useEffect(() => {
    document.title = 'Panel pracownika – Przychodnia';

    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    headingRef.current?.focus();
  }, [session, tab]);

  // Pobranie listy lekarzy po zalogowaniu.
  const token = session?.token;

  useEffect(() => {
    if (!token) {
      setDoctors(null);
      return;
    }

    let active = true;

    getStaffDoctors(token)
      .then((d) => {
        if (!active) return;
        setDoctors(d);
        setError('');
      })
      .catch((e) => {
        if (active) {
          setError(
            e instanceof ApiError
              ? e.message
              : 'Nie udało się pobrać listy lekarzy.',
          );
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  // Ręczne uruchomienie przypomnień SMS.
  const sendReminders = async () => {
    if (!token) return;

    setBusy(true);
    setReminderMsg(null);

    try {
      const res = await runReminders(token);
      setReminderMsg({ type: 'success', text: res.message });
    } catch (e) {
      setReminderMsg({
        type: 'error',
        text:
          e instanceof ApiError
            ? e.message
            : 'Nie udało się wysłać przypomnień.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Wylogowanie pracownika.
  const logout = () => {
    clearStaffSession();
    setDoctors(null);
    setError('');
    setTab('schedule');
    setReminderMsg(null);
  };

  return (
    <>
      <h1
        ref={headingRef}
        tabIndex={-1}
        className="page-title"
      >
        Panel pracownika przychodni
      </h1>

      {!session && <StaffLogin />}

      {session && (
        <div className="visits">
          <div className="card session-bar">
            <p>
              Zalogowano jako pracownik:{' '}
              <strong>{formatPhone(session.phoneNumber)}</strong>
            </p>

            <div className="actions actions--start">
              <button
                type="button"
                className="btn btn--secondary btn--small"
                disabled={busy}
                onClick={sendReminders}
              >
                {busy ? 'Wysyłanie…' : 'Wyślij przypomnienia SMS'}
              </button>

              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={logout}
              >
                Wyloguj się
              </button>
            </div>

            {reminderMsg && (
              <p
                className={`alert alert--${reminderMsg.type}`}
                role="status"
              >
                {reminderMsg.text}
              </p>
            )}
          </div>

          {/* Zakładki panelu pracownika */}
          <nav aria-label="Sekcje panelu">
            <ul className="main-nav__list staff-tabs">
              <li>
                <button
                  type="button"
                  className="main-nav__btn"
                  aria-current={tab === 'schedule' ? 'page' : undefined}
                  onClick={() => setTab('schedule')}
                >
                  Harmonogram
                </button>
              </li>

              <li>
                <button
                  type="button"
                  className="main-nav__btn"
                  aria-current={tab === 'reservations' ? 'page' : undefined}
                  onClick={() => setTab('reservations')}
                >
                  Rezerwacje
                </button>
              </li>

              <li>
                <button
                  type="button"
                  className="main-nav__btn"
                  aria-current={tab === 'reports' ? 'page' : undefined}
                  onClick={() => setTab('reports')}
                >
                  Raporty
                </button>
              </li>
            </ul>
          </nav>

          {error && (
            <p className="alert alert--error" role="alert">
              {error}
            </p>
          )}

          {!doctors && !error && (
            <p className="loading" role="status">
              Wczytywanie…
            </p>
          )}

          {doctors && tab === 'schedule' && (
            <ScheduleTab
              token={session.token}
              doctors={doctors}
            />
          )}

          {doctors && tab === 'reservations' && (
            <ReservationsTab
              token={session.token}
              doctors={doctors}
            />
          )}

          {doctors && tab === 'reports' && (
            <ReportsTab token={session.token} />
          )}
        </div>
      )}
    </>
  );
}
