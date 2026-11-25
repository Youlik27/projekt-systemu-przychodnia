import { useEffect, useState } from 'react';
import TermPicker from '../components/TermPicker';
import { getTermsForSpecialization, type Term } from '../api';

// =====================================================================
// Ekran 2: wybór dnia i godziny (dokumentacja 4.6 ekran 2, WF-02).
//
// Wolne terminy wybranej specjalizacji pobieramy z backendu
// (GET /api/terms?specialization=...). Kafelki dni i przyciski godzin rysuje
// wspólny komponent TermPicker (ten sam co przy zmianie terminu wizyty).
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

  /** Zwiększenie licznika = ponowne pobranie terminów (przycisk „Spróbuj ponownie”) */
  const [reloadKey, setReloadKey] = useState(0);

  // Pobranie terminów po wejściu na ekran, po zmianie specjalizacji i po „Spróbuj ponownie”.
  // Stan ustawiamy dopiero po odpowiedzi serwera; flaga `active` sprawia, że spóźniona
  // odpowiedź jest ignorowana, jeśli pacjent zdążył już opuścić ekran.
  useEffect(() => {
    let active = true;
    getTermsForSpecialization(specialization)
      .then((list) => {
        if (active) setTerms(list);
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

      {terms && terms.length > 0 && <TermPicker terms={terms} onPick={onNext} />}

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={onBack}>← Wstecz</button>
      </div>
    </div>
  );
}
