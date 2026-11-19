import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, getSpecializations } from '../api';

// =====================================================================
// Ekran 1: wybór specjalizacji (dokumentacja 4.6 ekran 1, WF-01).
//
// Jedna duża lista rozwijana + jeden przycisk – celowo bez filtrów i wyszukiwarek,
// żeby nie przeciążać pacjenta wyborami (dokumentacja 2.7, punkt 3).
// =====================================================================

interface Props {
  /** Poprzednio wybrana specjalizacja – po powrocie z kroku 2 pole nie jest puste */
  initial: string;
  onNext: (specialization: string) => void;
}

export default function StepSpecialization({ initial, onNext }: Props) {
  /** null = lista jeszcze się wczytuje */
  const [list, setList] = useState<string[] | null>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  /** Zwiększenie licznika = ponowne pobranie listy (przycisk „Spróbuj ponownie”) */
  const [reloadKey, setReloadKey] = useState(0);

  // Pobranie listy specjalizacji z backendu (GET /api/specializations).
  // `active` – ignorujemy odpowiedź, jeśli pacjent zdążył opuścić ekran.
  useEffect(() => {
    let active = true;
    getSpecializations()
      .then((specs) => {
        if (active) setList(specs);
      })
      .catch((e) => {
        // UC.B01: komunikat bez szczegółów technicznych + możliwość ponowienia
        if (active) setLoadError(e instanceof ApiError ? e.message : 'Nie udało się pobrać listy specjalizacji.');
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const retry = () => {
    setLoadError('');
    setReloadKey((k) => k + 1);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value) {
      setError('Wybierz lekarza z listy, aby zobaczyć wolne terminy.');
      return;
    }
    onNext(value);
  };

  return (
    // noValidate – zamiast dymków przeglądarki pokazujemy własne, czytelne komunikaty
    <form onSubmit={submit} noValidate className="card">
      <label htmlFor="spec" className="field__label">
        Do jakiego lekarza chcesz się zapisać?
      </label>

      {loadError && (
        <div className="alert alert--error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="btn btn--secondary" onClick={retry}>Spróbuj ponownie</button>
        </div>
      )}

      <select
        id="spec"
        className="field__control field__control--select"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
        disabled={!list}
        aria-invalid={!!error}
        aria-describedby={error ? 'spec-error' : undefined}
      >
        <option value="">{list ? '— wybierz z listy —' : loadError ? 'Lista niedostępna' : 'Wczytywanie…'}</option>
        {list?.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {error && (
        <p id="spec-error" className="field__error" role="alert">
          <span aria-hidden="true">⚠ </span>{error}
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={!list}>
        Pokaż wolne terminy
      </button>
    </form>
  );
}
