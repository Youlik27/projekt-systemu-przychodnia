import { useEffect, useMemo, useRef, useState } from 'react';
import AddTermsForm from './AddTermsForm';
import BookPatientForm from './BookPatientForm';
import ReservationActions from './ReservationActions';
import RescheduleVisit from '../components/RescheduleVisit';
import { RESERVATION_STATUS, TERM_STATUS } from './labels';
import { ApiError, addDays, dayKey, formatDay, formatTime, toIsoDate } from '../api';
import {
  deleteTerm,
  getSchedule,
  setTermStatus,
  staffReschedule,
  type ScheduleTerm,
  type StaffDoctor,
} from '../staffApi';
import { formatPhone } from '../utils/phone';

// =====================================================================
// Harmonogram lekarza (WF-10) z obsługą rezerwacji (WF-11).
//
// Pracownik wybiera lekarza i dzień (albo tydzień) i widzi wszystkie terminy:
//   - wolny:          zapisz pacjenta / zablokuj / usuń,
//   - zablokowany:    odblokuj / usuń,
//   - zarezerwowany:  dane pacjenta + przenieś / anuluj (lub „odbyta” / „nieobecność”).
// Kryterium WF-10: zarezerwowanego terminu nie da się zablokować ani usunąć –
// takich przycisków po prostu nie pokazujemy (backend i tak by odmówił, 409).
// =====================================================================

type Result = { type: 'success' | 'error'; text: string };

interface Props {
  token: string;
  doctors: StaffDoctor[];
}

export default function ScheduleTab({ token, doctors }: Props) {
  const [doctorId, setDoctorId] = useState(() => (doctors.find((d) => d.IsActive) ?? doctors[0])?.ID ?? 0);
  const [from, setFrom] = useState(() => toIsoDate(new Date()));
  /** Widok jednego dnia albo 7 dni */
  const [range, setRange] = useState<'day' | 'week'>('week');
  const to = range === 'day' ? from : addDays(from, 6);

  const [terms, setTerms] = useState<ScheduleTerm[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  /** Co jest otwarte: formularz dodawania terminów, zapis pacjenta na termin, przeniesienie wizyty */
  const [addingTerms, setAddingTerms] = useState(false);
  const [bookingTermId, setBookingTermId] = useState<number | null>(null);
  const [moving, setMoving] = useState<ScheduleTerm | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [busyTermId, setBusyTermId] = useState<number | null>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);

  const doctor = doctors.find((d) => d.ID === doctorId);

  useEffect(() => {
    if (!doctorId) return;
    let active = true;
    getSchedule(token, doctorId, from, to)
      .then((res) => {
        if (!active) return;
        setTerms(res.terms);
        setLoadError('');
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof ApiError ? e.message : 'Nie udało się pobrać harmonogramu.');
      });
    return () => {
      active = false;
    };
  }, [token, doctorId, from, to, reloadKey]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  /** Wynik dowolnej operacji: komunikat, zamknięcie formularzy, odświeżenie harmonogramu */
  const finish = (r: Result) => {
    setResult(r);
    setBookingTermId(null);
    setMoving(null);
    setConfirmDeleteId(null);
    if (r.type === 'success') setAddingTerms(false);
    setReloadKey((k) => k + 1);
  };

  const termAction = async (termId: number, action: () => Promise<{ message: string }>) => {
    setBusyTermId(termId);
    try {
      const res = await action();
      finish({ type: 'success', text: res.message });
    } catch (e) {
      finish({ type: 'error', text: e instanceof ApiError ? e.message : 'Operacja się nie udała.' });
    } finally {
      setBusyTermId(null);
    }
  };

  const changeFilter = (fn: () => void) => {
    fn();
    setTerms(null);
    setResult(null);
  };

  // Terminy pogrupowane po dniach – każdy dzień to osobna sekcja z nagłówkiem
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleTerm[]>();
    for (const t of terms ?? []) {
      const k = dayKey(t.startDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [terms]);

  const counts = useMemo(() => {
    const c = { free: 0, reserved: 0, blocked: 0 };
    for (const t of terms ?? []) c[t.status]++;
    return c;
  }, [terms]);

  if (moving?.reservation && doctor) {
    const patient = moving.reservation.patient;
    return (
      <RescheduleVisit
        specialization={doctor.Specialization}
        currentStart={moving.startDate}
        heading={`Przeniesienie wizyty: ${patient.firstName} ${patient.lastName}`}
        onConfirm={async (term) => {
          const res = await staffReschedule(token, moving.reservation!.id, term.TermID);
          finish({ type: 'success', text: res.message });
        }}
        onClose={() => setMoving(null)}
      />
    );
  }

  return (
    <div className="staff-tab">
      <form className="card filters" onSubmit={(e) => e.preventDefault()} aria-label="Wybór harmonogramu">
        <div className="field filters__wide">
          <label htmlFor="sch-doctor" className="field__label">Lekarz</label>
          <select id="sch-doctor" className="field__control field__control--select" value={doctorId}
            onChange={(e) => changeFilter(() => setDoctorId(Number(e.target.value)))}>
            {doctors.map((d) => (
              <option key={d.ID} value={d.ID}>
                {d.Specialization} – dr {d.FirstName} {d.LastName}{d.IsActive ? '' : ' (nieaktywny)'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sch-from" className="field__label">{range === 'day' ? 'Dzień' : 'Tydzień od'}</label>
          <input id="sch-from" type="date" className="field__control" value={from}
            onChange={(e) => e.target.value && changeFilter(() => setFrom(e.target.value))} />
        </div>
        <fieldset className="field segmented">
          <legend className="field__label">Zakres</legend>
          <div className="segmented__options">
            <button type="button" className="segmented__btn" aria-pressed={range === 'day'}
              onClick={() => changeFilter(() => setRange('day'))}>Dzień</button>
            <button type="button" className="segmented__btn" aria-pressed={range === 'week'}
              onClick={() => changeFilter(() => setRange('week'))}>7 dni</button>
          </div>
        </fieldset>
        <div className="actions actions--start filters__nav">
          <button type="button" className="btn btn--secondary btn--small"
            onClick={() => changeFilter(() => setFrom(addDays(from, range === 'day' ? -1 : -7)))}>← Wcześniej</button>
          <button type="button" className="btn btn--secondary btn--small"
            onClick={() => changeFilter(() => setFrom(toIsoDate(new Date())))}>Dziś</button>
          <button type="button" className="btn btn--secondary btn--small"
            onClick={() => changeFilter(() => setFrom(addDays(from, range === 'day' ? 1 : 7)))}>Później →</button>
          <button type="button" className="btn btn--primary btn--small" onClick={() => setAddingTerms(true)}>
            + Dodaj terminy
          </button>
        </div>
      </form>

      {result && (
        <p ref={resultRef} tabIndex={-1} className={`alert alert--${result.type}`}
          role={result.type === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{result.type === 'success' ? '✓ ' : '⚠ '}</span>{result.text}
        </p>
      )}

      {addingTerms && (
        <AddTermsForm token={token} doctors={doctors} doctorId={doctorId}
          onDone={finish} onClose={() => setAddingTerms(false)} />
      )}

      {loadError && <p className="alert alert--error" role="alert">{loadError}</p>}
      {!terms && !loadError && <p className="loading" role="status">Wczytywanie harmonogramu…</p>}

      {terms && (
        <section className="card" aria-labelledby="schedule-title">
          <h2 id="schedule-title" className="section-title">
            {doctor ? `dr ${doctor.FirstName} ${doctor.LastName}` : 'Harmonogram'}
            {' – '}{range === 'day' ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`}
          </h2>
          <p className="schedule-summary">
            Wolne: <strong>{counts.free}</strong> · Zarezerwowane: <strong>{counts.reserved}</strong> ·
            Zablokowane: <strong>{counts.blocked}</strong>
          </p>

          {terms.length === 0 && (
            <p className="alert alert--info">Brak terminów w tym okresie. Użyj przycisku „Dodaj terminy”.</p>
          )}

          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="schedule-day">
              <h3 className="schedule-day__title">{formatDay(list[0].startDate)}</h3>
              <ul className="term-list">
                {list.map((t) => {
                  const st = TERM_STATUS[t.status];
                  const busy = busyTermId === t.termId;
                  const label = `${formatDay(t.startDate)}, ${formatTime(t.startDate)}`;
                  const res = t.reservation;
                  return (
                    <li key={t.termId} className={`term-row term-row--${t.status}${t.isPast ? ' term-row--past' : ''}`}>
                      <div className="term-row__main">
                        <span className="term-row__time">
                          {formatTime(t.startDate)}–{formatTime(t.endDate)}
                        </span>
                        <span className={`badge badge--term-${t.status}`}>
                          <span aria-hidden="true">{st.icon} </span>{st.text}
                        </span>
                        {t.cabinet && <span className="term-row__meta">gab. {t.cabinet}</span>}
                        {t.isPast && <span className="term-row__meta">(minął)</span>}
                      </div>

                      {res && (
                        <div className="term-row__patient">
                          <strong>{res.patient.firstName} {res.patient.lastName}</strong>
                          {' · '}{formatPhone(res.patient.phoneNumber)}
                          {res.status !== 'active' && (
                            <span className={`badge badge--${res.status}`}>
                              <span aria-hidden="true">{RESERVATION_STATUS[res.status].icon} </span>
                              {RESERVATION_STATUS[res.status].text}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Akcje dla rezerwacji */}
                      {res && (
                        <ReservationActions token={token} reservationId={res.id} status={res.status}
                          started={t.isPast}
                          label={`${res.patient.firstName} ${res.patient.lastName}, ${label}`}
                          onDone={finish} onReschedule={() => setMoving(t)} />
                      )}

                      {/* Akcje dla wolnego / zablokowanego terminu */}
                      {!res && confirmDeleteId === t.termId && (
                        <div className="confirm-box">
                          <p className="confirm-box__question">Usunąć termin {label} z harmonogramu?</p>
                          <div className="actions actions--start">
                            <button type="button" className="btn btn--danger btn--small" disabled={busy}
                              onClick={() => termAction(t.termId, () => deleteTerm(token, t.termId))}>
                              Tak, usuń
                            </button>
                            <button type="button" className="btn btn--secondary btn--small" disabled={busy}
                              onClick={() => setConfirmDeleteId(null)}>Nie</button>
                          </div>
                        </div>
                      )}

                      {!res && confirmDeleteId !== t.termId && bookingTermId !== t.termId && (
                        <div className="actions actions--start">
                          {t.status === 'free' && !t.isPast && (
                            <button type="button" className="btn btn--primary btn--small" disabled={busy}
                              aria-label={`Zapisz pacjenta na ${label}`}
                              onClick={() => setBookingTermId(t.termId)}>Zapisz pacjenta</button>
                          )}
                          {t.status === 'free' && !t.isPast && (
                            <button type="button" className="btn btn--secondary btn--small" disabled={busy}
                              aria-label={`Zablokuj termin ${label}`}
                              onClick={() => termAction(t.termId, () => setTermStatus(token, t.termId, 'blocked'))}>
                              Zablokuj
                            </button>
                          )}
                          {t.status === 'blocked' && !t.isPast && (
                            <button type="button" className="btn btn--secondary btn--small" disabled={busy}
                              aria-label={`Odblokuj termin ${label}`}
                              onClick={() => termAction(t.termId, () => setTermStatus(token, t.termId, 'free'))}>
                              Odblokuj
                            </button>
                          )}
                          {t.status !== 'reserved' && (
                            <button type="button" className="btn btn--secondary btn--small" disabled={busy}
                              aria-label={`Usuń termin ${label}`}
                              onClick={() => setConfirmDeleteId(t.termId)}>Usuń</button>
                          )}
                        </div>
                      )}

                      {bookingTermId === t.termId && (
                        <BookPatientForm token={token} termId={t.termId} termLabel={label}
                          onDone={finish} onClose={() => setBookingTermId(null)} />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
