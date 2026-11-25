import { useEffect, useRef, useState } from 'react';
import StaffLogin from './StaffLogin';
import ScheduleTab from './ScheduleTab';
import ReservationsTab from './ReservationsTab';
import { ApiError } from '../api';
import { getStaffDoctors, runReminders, type StaffDoctor } from '../staffApi';
import { clearStaffSession, useStaffSession } from '../session';
import { formatPhone } from '../utils/phone';

// =====================================================================
// Panel pracownika przychodni (moduł „Harmonogram i Administracja”, dokumentacja 4.2).
//
// Adres: #pracownik (link w stopce strony). Niezalogowany pracownik widzi
// logowanie kodem SMS, zalogowany – dwie zakładki:
//   - Harmonogram (WF-10): terminy lekarza, dodawanie / blokowanie / usuwanie,
//   - Rezerwacje  (WF-11): lista wizyt z filtrami, anulowanie / przenoszenie / wynik wizyty.
// Dodatkowo przycisk „Wyślij przypomnienia” (WF-12).
// =====================================================================

type Tab = 'schedule' | 'reservations';

export default function StaffApp() {
  const session = useStaffSession();
  const [tab, setTab] = useState<Tab>('schedule');
  const [doctors, setDoctors] = useState<StaffDoctor[] | null>(null);
  const [error, setError] = useState('');
  const [reminderMsg, setReminderMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Po zalogowaniu lub zmianie zakładki fokus na nagłówek (czytnik ekranu)
  useEffect(() => {
    document.title = 'Panel pracownika – Przychodnia';
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [session, tab]);

  // Lista lekarzy jest potrzebna w obu zakładkach – pobieramy ją raz po zalogowaniu
  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    let active = true;
    getStaffDoctors(token)
      .then((d) => {
        if (!active) return;
        setDoctors(d);
        setError('');
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : 'Nie udało się pobrać listy lekarzy.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  const sendReminders = async () => {
    if (!token) return;
    setBusy(true);
    setReminderMsg(null);
    try {
      const res = await runReminders(token);
      setReminderMsg({ type: 'success', text: res.message });
    } catch (e) {
      setReminderMsg({ type: 'error', text: e instanceof ApiError ? e.message : 'Nie udało się wysłać przypomnień.' });
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    clearStaffSession();
    setDoctors(null);
    setError('');
  };

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="page-title">Panel pracownika przychodni</h1>

      {!session && <StaffLogin />}

      {session && (
        <div className="visits">
          <div className="card session-bar">
            <p>Zalogowano jako pracownik: <strong>{formatPhone(session.phoneNumber)}</strong></p>
            <div className="actions actions--start">
              <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={sendReminders}>
                {busy ? 'Wysyłanie…' : 'Wyślij przypomnienia SMS'}
              </button>
              <button type="button" className="btn btn--secondary btn--small" onClick={logout}>Wyloguj się</button>
            </div>
            {reminderMsg && (
              <p className={`alert alert--${reminderMsg.type}`} role="status">{reminderMsg.text}</p>
            )}
          </div>

          {/* Zakładki – aktywna ma aria-current i podkreślenie (nie tylko kolor) */}
          <nav aria-label="Sekcje panelu">
            <ul className="main-nav__list staff-tabs">
              <li>
                <button type="button" className="main-nav__btn" aria-current={tab === 'schedule' ? 'page' : undefined}
                  onClick={() => setTab('schedule')}>Harmonogram</button>
              </li>
              <li>
                <button type="button" className="main-nav__btn" aria-current={tab === 'reservations' ? 'page' : undefined}
                  onClick={() => setTab('reservations')}>Rezerwacje</button>
              </li>
            </ul>
          </nav>

          {error && <p className="alert alert--error" role="alert">{error}</p>}
          {!doctors && !error && <p className="loading" role="status">Wczytywanie…</p>}

          {doctors && tab === 'schedule' && <ScheduleTab token={session.token} doctors={doctors} />}
          {doctors && tab === 'reservations' && <ReservationsTab token={session.token} doctors={doctors} />}
        </div>
      )}
    </>
  );
}
