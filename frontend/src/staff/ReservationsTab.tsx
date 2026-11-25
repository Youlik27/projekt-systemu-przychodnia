import { useEffect, useRef, useState, type FormEvent } from 'react';
import ReservationActions from './ReservationActions';
import RescheduleVisit from '../components/RescheduleVisit';
import { RESERVATION_STATUS } from './labels';
import { ApiError, addDays, formatDay, formatTime, toIsoDate, type ReservationStatus } from '../api';
import {
  getStaffReservations,
  staffReschedule,
  type ReservationFilters,
  type StaffDoctor,
  type StaffReservation,
} from '../staffApi';
import { formatPhone } from '../utils/phone';

// =====================================================================
// Lista rezerwacji pacjentów z filtrami (WF-11).
//
// Filtry: zakres dat, lekarz, status, pacjent (fragment telefonu lub nazwiska).
// Przy każdej wizycie te same akcje co w harmonogramie (ReservationActions).
// =====================================================================

type Result = { type: 'success' | 'error'; text: string };

interface Props {
  token: string;
  doctors: StaffDoctor[];
}

export default function ReservationsTab({ token, doctors }: Props) {
  // Formularz filtrów (to, co wpisane) i filtry faktycznie użyte do wyszukiwania (po „Szukaj”).
  // Domyślnie: zaplanowane wizyty na najbliższe 2 tygodnie.
  const [form, setForm] = useState(() => {
    const today = toIsoDate(new Date());
    return { from: today, to: addDays(today, 13), doctorId: '', status: 'active', patient: '' };
  });
  const [filters, setFilters] = useState<ReservationFilters>(() => ({
    from: form.from,
    to: form.to,
    status: 'active',
  }));
  const [list, setList] = useState<StaffReservation[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [moving, setMoving] = useState<StaffReservation | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let active = true;
    getStaffReservations(token, filters)
      .then((r) => {
        if (!active) return;
        setList(r);
        setLoadError('');
      })
      .catch((e) => {
        if (active) setLoadError(e instanceof ApiError ? e.message : 'Nie udało się pobrać rezerwacji.');
      });
    return () => {
      active = false;
    };
  }, [token, filters, reloadKey]);

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const search = (e: FormEvent) => {
    e.preventDefault();
    setResult(null);
    setList(null);
    setFilters({
      from: form.from || undefined,
      to: form.to || undefined,
      doctorId: form.doctorId ? Number(form.doctorId) : undefined,
      status: (form.status || undefined) as ReservationStatus | undefined,
      patient: form.patient.trim() || undefined,
    });
  };

  const finish = (r: Result) => {
    setResult(r);
    setMoving(null);
    setReloadKey((k) => k + 1);
  };

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  if (moving) {
    return (
      <RescheduleVisit
        specialization={moving.doctor.specialization}
        currentStart={moving.startDate}
        heading={`Przeniesienie wizyty: ${moving.patient.firstName} ${moving.patient.lastName}`}
        onConfirm={async (term) => {
          const res = await staffReschedule(token, moving.id, term.TermID);
          finish({ type: 'success', text: res.message });
        }}
        onClose={() => setMoving(null)}
      />
    );
  }

  return (
    <div className="staff-tab">
      <form className="card filters" onSubmit={search} noValidate aria-label="Filtry rezerwacji">
        <div className="field">
          <label htmlFor="res-from" className="field__label">Od</label>
          <input id="res-from" type="date" className="field__control" value={form.from} onChange={set('from')} />
        </div>
        <div className="field">
          <label htmlFor="res-to" className="field__label">Do</label>
          <input id="res-to" type="date" className="field__control" value={form.to} onChange={set('to')} />
        </div>
        <div className="field">
          <label htmlFor="res-doctor" className="field__label">Lekarz</label>
          <select id="res-doctor" className="field__control field__control--select"
            value={form.doctorId} onChange={set('doctorId')}>
            <option value="">Wszyscy</option>
            {doctors.map((d) => (
              <option key={d.ID} value={d.ID}>{d.Specialization} – dr {d.LastName}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="res-status" className="field__label">Status</label>
          <select id="res-status" className="field__control field__control--select"
            value={form.status} onChange={set('status')}>
            <option value="">Wszystkie</option>
            {(Object.keys(RESERVATION_STATUS) as ReservationStatus[]).map((s) => (
              <option key={s} value={s}>{RESERVATION_STATUS[s].text}</option>
            ))}
          </select>
        </div>
        <div className="field filters__wide">
          <label htmlFor="res-patient" className="field__label">Pacjent</label>
          <p id="res-patient-hint" className="field__hint">Fragment nazwiska lub numeru telefonu (min. 2 znaki).</p>
          <input id="res-patient" className="field__control" value={form.patient} onChange={set('patient')}
            aria-describedby="res-patient-hint" />
        </div>
        <div className="actions actions--start filters__nav">
          <button type="submit" className="btn btn--primary">Szukaj</button>
        </div>
      </form>

      {result && (
        <p ref={resultRef} tabIndex={-1} className={`alert alert--${result.type}`}
          role={result.type === 'error' ? 'alert' : 'status'}>
          <span aria-hidden="true">{result.type === 'success' ? '✓ ' : '⚠ '}</span>{result.text}
        </p>
      )}

      {loadError && <p className="alert alert--error" role="alert">{loadError}</p>}
      {!list && !loadError && <p className="loading" role="status">Wczytywanie rezerwacji…</p>}

      {list && (
        <section aria-labelledby="res-title" className="visits__section">
          <h2 id="res-title" className="section-title">Znalezione wizyty ({list.length})</h2>
          {list.length === 0 && <p className="alert alert--info">Brak wizyt dla wybranych filtrów.</p>}
          <ul className="visit-list">
            {list.map((r) => {
              const st = RESERVATION_STATUS[r.status];
              const name = `${r.patient.firstName} ${r.patient.lastName}`;
              return (
                <li key={r.id}>
                  <article className={`visit visit--${r.status}`} aria-labelledby={`res-${r.id}-title`}>
                    <div className="visit__head">
                      <h3 id={`res-${r.id}-title`} className="visit__title">{name}</h3>
                      <span className={`badge badge--${r.status}`}>
                        <span aria-hidden="true">{st.icon} </span>
                        <span className="sr-only">Status: </span>{st.text}
                      </span>
                    </div>
                    <dl className="visit__details">
                      <div><dt>Telefon</dt><dd>{formatPhone(r.patient.phoneNumber)}</dd></div>
                      <div><dt>Lekarz</dt><dd>dr {r.doctor.firstName} {r.doctor.lastName} ({r.doctor.specialization})</dd></div>
                      <div><dt>Termin</dt><dd>{formatDay(r.startDate)}, {formatTime(r.startDate)}</dd></div>
                      {r.cabinet && <div><dt>Gabinet</dt><dd>nr {r.cabinet}</dd></div>}
                      <div><dt>Nr rezerwacji</dt><dd>{r.id}</dd></div>
                    </dl>
                    <ReservationActions token={token} reservationId={r.id} status={r.status}
                      started={!r.isUpcoming}
                      label={`${name}, ${formatDay(r.startDate)}, ${formatTime(r.startDate)}`}
                      onDone={finish} onReschedule={() => setMoving(r)} />
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
