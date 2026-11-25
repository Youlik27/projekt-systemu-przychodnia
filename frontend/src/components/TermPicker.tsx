import { useMemo, useState } from 'react';
import { dayKey, formatDay, formatTime, type Term } from '../api';

// =====================================================================
// Wybór dnia i godziny z listy wolnych terminów (WF-02).
//
// Używany w trzech miejscach:
//   - rezerwacja (ekran 2),
//   - zmiana terminu przez pacjenta w „Moje wizyty” (WF-08),
//   - przeniesienie wizyty przez pracownika (WF-11).
//
// Górny rząd: duże kafelki dni (z liczbą wolnych terminów),
// dolny rząd: duże przyciski godzin dla wybranego dnia.
// =====================================================================

interface Props {
  /** Wolne terminy posortowane po dacie */
  terms: Term[];
  onPick: (term: Term) => void;
  /** Blokuje przyciski godzin, np. w trakcie zapisu */
  disabled?: boolean;
}

export default function TermPicker({ terms, onPick, disabled = false }: Props) {
  // Mapa: dzień → lista terminów w tym dniu (terminy przychodzą posortowane po dacie)
  const days = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of terms) {
      const k = dayKey(t.StartDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [terms]);

  /** Wybrany dzień jako klucz "RRRR-MM-DD"; domyślnie pierwszy dzień z wolnymi terminami */
  const [picked, setPicked] = useState('');
  const day = days.has(picked) ? picked : (days.keys().next().value ?? '');

  const slots = days.get(day) ?? [];
  // Jeśli specjalizację ma kilku lekarzy, przy godzinie pokazujemy też nazwisko
  const manyDoctors = new Set(terms.map((t) => t.DoctorID)).size > 1;

  return (
    <>
      <fieldset className="group">
        <legend className="field__label">1. Wybierz dzień</legend>
        <div className="day-grid">
          {[...days.entries()].map(([k, list]) => {
            // "czwartek, 20 listopada" → "czwartek" + "20 listopada"
            const [weekday, ...rest] = formatDay(list[0].StartDate).split(' ');
            return (
              <button
                key={k}
                type="button"
                className="tile"
                // aria-pressed – czytnik ekranu ogłosi, który dzień jest wybrany
                aria-pressed={k === day}
                onClick={() => setPicked(k)}
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
        <legend className="field__label">2. Wybierz godzinę – {slots[0] ? formatDay(slots[0].StartDate) : ''}</legend>
        <div className="time-grid">
          {slots.map((t) => (
            <button key={t.TermID} type="button" className="slot" disabled={disabled} onClick={() => onPick(t)}>
              <span className="slot__time">{formatTime(t.StartDate)}</span>
              {manyDoctors && <span className="slot__doc">dr {t.DoctorFirstName[0]}. {t.DoctorLastName}</span>}
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
