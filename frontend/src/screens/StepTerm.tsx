import { useEffect, useMemo, useState } from 'react';
import { dayKey, formatDay, formatTime, getTermsForSpecialization, type Term } from '../api';

// Ekran 2: kafelki dni + siatka godzin (dokumentacja 4.6).

interface Props {
  specialization: string;
  notice?: string;
  onBack: () => void;
  onNext: (term: Term) => void;
}

export default function StepTerm({ specialization, notice, onBack, onNext }: Props) {
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [error, setError] = useState('');
  const [day, setDay] = useState<string>('');

  const fetchTerms = () =>
    getTermsForSpecialization(specialization)
      .then((t) => {
        setTerms(t);
        if (t.length) setDay(dayKey(t[0].StartDate));
      })
      .catch(() => setError('Nie udało się pobrać terminów. Sprawdź połączenie i spróbuj ponownie.'));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void fetchTerms(), [specialization]);

  const load = () => {
    setError('');
    setTerms(null);
    fetchTerms();
  };

  const days = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of terms ?? []) {
      const k = dayKey(t.StartDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [terms]);

  const slots = days.get(day) ?? [];
  const manyDoctors = new Set(terms?.map((t) => t.DoctorID)).size > 1;

  return (
    <div className="card">
      {notice && <p className="alert alert--warning" role="alert">{notice}</p>}

      <p className="lead">
        Lekarz: <strong>{specialization}</strong>{' '}
        <button type="button" className="link-btn" onClick={onBack}>zmień</button>
      </p>

      {error && (
        <div className="alert alert--error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--secondary" onClick={load}>Spróbuj ponownie</button>
        </div>
      )}

      {!terms && !error && <p className="loading" role="status">Szukam wolnych terminów…</p>}

      {terms && terms.length === 0 && (
        <div className="alert alert--info" role="status">
          <p>Brak wolnych terminów u tego lekarza w najbliższym czasie.</p>
          <button type="button" className="btn btn--secondary" onClick={onBack}>Wybierz innego lekarza</button>
        </div>
      )}

      {terms && terms.length > 0 && (
        <>
          <fieldset className="group">
            <legend className="field__label">1. Wybierz dzień</legend>
            <div className="day-grid">
              {[...days.entries()].map(([k, list]) => {
                const [weekday, ...rest] = formatDay(list[0].StartDate).split(' ');
                return (
                  <button
                    key={k}
                    type="button"
                    className="tile"
                    aria-pressed={k === day}
                    onClick={() => setDay(k)}
                  >
                    <span className="tile__weekday">{weekday.replace(',', '')}</span>
                    <span className="tile__date">{rest.join(' ')}</span>
                    <span className="tile__meta">{list.length} wolnych</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="group">
            <legend className="field__label">2. Wybierz godzinę – {formatDay(slots[0]?.StartDate ?? '')}</legend>
            <div className="time-grid">
              {slots.map((t) => (
                <button key={t.TermID} type="button" className="slot" onClick={() => onNext(t)}>
                  <span className="slot__time">{formatTime(t.StartDate)}</span>
                  {manyDoctors && (
                    <span className="slot__doc">dr {t.DoctorFirstName[0]}. {t.DoctorLastName}</span>
                  )}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={onBack}>← Wstecz</button>
      </div>
    </div>
  );
}
