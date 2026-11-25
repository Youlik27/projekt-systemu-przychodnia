import { useEffect, useRef, useState, type FormEvent } from 'react';
import Field from '../components/Field';
import { ApiError, addDays, formatDay, formatTime, toIsoDate } from '../api';
import { createTerms, type StaffDoctor } from '../staffApi';

// =====================================================================
// Dodawanie terminów do harmonogramu lekarza (WF-10).
//
// Pracownik podaje zakres dni, godziny pracy i długość wizyty – backend tworzy
// z tego sloty (np. 9:00, 9:30, …). Terminy kolidujące z istniejącymi
// i terminy z przeszłości backend pomija i podaje powód.
// =====================================================================

interface Props {
  token: string;
  doctors: StaffDoctor[];
  /** Lekarz wybrany w harmonogramie – domyślny w formularzu */
  doctorId: number;
  onDone: (result: { type: 'success' | 'error'; text: string }) => void;
  onClose: () => void;
}

export default function AddTermsForm({ token, doctors, doctorId, onDone, onClose }: Props) {
  // Domyślnie: od jutra przez 5 dni, 9:00–12:00 co 30 minut
  const [form, setForm] = useState(() => {
    const tomorrow = addDays(toIsoDate(new Date()), 1);
    return {
      doctorId: String(doctorId),
      dateFrom: tomorrow,
      dateTo: addDays(tomorrow, 4),
      startTime: '09:00',
      endTime: '12:00',
      slotMinutes: '30',
      cabinet: '',
      skipWeekends: true,
    };
  });
  /** Błędy pól z backendu (UC.B02) */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<{ startDate: string; reason: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const set = (key: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    setBusy(true);
    setErrors({});
    setSkipped([]);
    try {
      const res = await createTerms(token, {
        doctorId: Number(form.doctorId),
        dateFrom: form.dateFrom,
        dateTo: form.dateTo,
        startTime: form.startTime,
        endTime: form.endTime,
        slotMinutes: Number(form.slotMinutes),
        cabinet: form.cabinet.trim() || null,
        skipWeekends: form.skipWeekends,
      });
      setSkipped(res.skipped);
      onDone({ type: res.created.length ? 'success' : 'error', text: res.message });
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fieldErrors);
      onDone({ type: 'error', text: e instanceof ApiError ? e.message : 'Nie udało się dodać terminów.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} noValidate aria-labelledby="add-terms-title">
      <h2 id="add-terms-title" ref={titleRef} tabIndex={-1} className="section-title">Dodaj terminy</h2>

      <Field id="add-doctor" label="Lekarz" error={errors.doctorId}>
        {(aria) => (
          <select id="add-doctor" className="field__control field__control--select"
            value={form.doctorId} onChange={set('doctorId')} {...aria}>
            {doctors.map((d) => (
              <option key={d.ID} value={d.ID}>
                {d.Specialization} – dr {d.FirstName} {d.LastName}{d.IsActive ? '' : ' (nieaktywny)'}
              </option>
            ))}
          </select>
        )}
      </Field>

      <div className="field-row">
        <Field id="add-from" label="Od dnia" error={errors.dateFrom}>
          {(aria) => <input id="add-from" type="date" className="field__control"
            value={form.dateFrom} onChange={set('dateFrom')} {...aria} />}
        </Field>
        <Field id="add-to" label="Do dnia" error={errors.dateTo}>
          {(aria) => <input id="add-to" type="date" className="field__control"
            value={form.dateTo} onChange={set('dateTo')} {...aria} />}
        </Field>
      </div>

      <div className="field-row">
        <Field id="add-start" label="Od godziny" error={errors.startTime}>
          {(aria) => <input id="add-start" type="time" className="field__control"
            value={form.startTime} onChange={set('startTime')} {...aria} />}
        </Field>
        <Field id="add-end" label="Do godziny" error={errors.endTime}>
          {(aria) => <input id="add-end" type="time" className="field__control"
            value={form.endTime} onChange={set('endTime')} {...aria} />}
        </Field>
      </div>

      <div className="field-row">
        <Field id="add-slot" label="Długość wizyty (minuty)" error={errors.slotMinutes}>
          {(aria) => <input id="add-slot" type="number" min={5} max={240} step={5} className="field__control"
            value={form.slotMinutes} onChange={set('slotMinutes')} {...aria} />}
        </Field>
        <Field id="add-cabinet" label="Gabinet (opcjonalnie)" error={errors.cabinet}>
          {(aria) => <input id="add-cabinet" className="field__control" maxLength={20}
            value={form.cabinet} onChange={set('cabinet')} {...aria} />}
        </Field>
      </div>

      <label className="check">
        <input type="checkbox" checked={form.skipWeekends}
          onChange={(e) => setForm((f) => ({ ...f, skipWeekends: e.target.checked }))} />
        Pomiń soboty i niedziele
      </label>

      {skipped.length > 0 && (
        <details className="skipped">
          <summary>Pominięte terminy ({skipped.length})</summary>
          <ul>
            {skipped.map((s) => (
              <li key={s.startDate}>{formatDay(s.startDate)}, {formatTime(s.startDate)} – {s.reason}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="actions actions--start">
        <button type="submit" className="btn btn--primary" disabled={busy}>
          {busy ? 'Dodawanie…' : 'Dodaj terminy'}
        </button>
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={onClose}>Zamknij</button>
      </div>
    </form>
  );
}
