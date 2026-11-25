import { useEffect, useMemo, useState } from 'react';
import { dayKey, formatDay, formatTime, getTermsForSpecialization, type Term } from '../api';

// =====================================================================
// Ekran 2: wybór dnia i godziny (dokumentacja 4.6 ekran 2, WF-02).
//
// Wolne terminy wybranej specjalizacji pobieramy z backendu
// (GET /api/terms?specialization=...), a następnie grupujemy je po dniach:
//   - górny rząd: duże kafelki dni (z liczbą wolnych terminów),
//   - dolny rząd: duże przyciski godzin dla wybranego dnia.
// Kliknięcie godziny od razu przechodzi do kroku 3 – bez dodatkowego „Dalej”.
// =====================================================================

interface Props {
  specialization: string;
  /** Komunikat do pokazania na górze, np. „termin został właśnie zarezerwowany” */
  notice?: string;
  onBack: () => void;
  onNext: (term: Term) => void;
}

export default function StepTerm({ specialization, notice, onBack, onNext }: Props) {
  /** null = trwa wczytywanie */
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [error, setError] = useState('');
  /** Wybrany dzień jako klucz "RRRR-MM-DD" */
  const [day, setDay] = useState<string>('');

  /** Zwiększenie licznika = ponowne pobranie terminów (przycisk „Spróbuj ponownie”) */
  const [reloadKey, setReloadKey] = useState(0);

  // Pobranie terminów po wejściu na ekran, po zmianie specjalizacji i po „Spróbuj ponownie”.
  // Stan ustawiamy dopiero po odpowiedzi serwera; flaga `active` sprawia, że spóźniona
  // odpowiedź jest ignorowana, jeśli pacjent zdążył już opuścić ekran.
  useEffect(() => {
    let active = true;
    getTermsForSpecialization(specialization)
      .then((list) => {
        if (!active) return;
        setTerms(list);
        // domyślnie zaznaczamy pierwszy dzień z wolnymi terminami
        if (list.length) setDay(dayKey(list[0].StartDate));
      })
      .catch(() => {
        if (active) setError('Nie udało się pobrać terminów. Sprawdź połączenie i spróbuj ponownie.');
      });
    return () => {
      active = false;
    };
  }, [specialization, reloadKey]);

  /** „Spróbuj ponownie” – czyścimy błąd, pokazujemy wczytywanie i pobieramy jeszcze raz */
  const retry = () => {
    setError('');
    setTerms(null);
    setReloadKey((k) => k + 1);
  };

  // Mapa: dzień → lista terminów w tym dniu (terminy przychodzą posortowane po dacie)
  const days = useMemo(() => {
    const map = new Map<string, Term[]>();
    for (const t of terms ?? []) {
      const k = dayKey(t.StartDate);
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    return map;
  }, [terms]);

  const slots = days.get(day) ?? [];
  // Jeśli specjalizację ma kilku lekarzy, przy godzinie pokazujemy też nazwisko
  const manyDoctors = new Set(terms?.map((t) => t.DoctorID)).size > 1;

  return (
    <div className="card">
      {notice && <p className="alert alert--warning" role="alert">{notice}</p>}

      <p className="lead">
        Lekarz: <strong>{specialization}</strong>{' '}
        <button type="button" className="link-btn" onClick={onBack}>zmień</button>
      </p>

      {/* UC.B01 – problem z połączeniem: komunikat + możliwość ponowienia */}
      {error && (
        <div className="alert alert--error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn--secondary" onClick={retry}>
            Spróbuj ponownie
          </button>
        </div>
      )}

      {!terms && !error && <p className="loading" role="status">Szukam wolnych terminów…</p>}

      {/* UC.Wizyta.Alt01 – brak wolnych terminów */}
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
                // "czwartek, 20 listopada" → "czwartek" + "20 listopada"
                const [weekday, ...rest] = formatDay(list[0].StartDate).split(' ');
                return (
                  <button
                    key={k}
                    type="button"
                    className="tile"
                    // aria-pressed – czytnik ekranu ogłosi, który dzień jest wybrany
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
