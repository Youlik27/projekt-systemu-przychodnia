import { useEffect, useState, type FormEvent } from 'react';
import { getSpecializations } from '../api';

// Ekran 1: wybór specjalizacji (dokumentacja 4.6).

interface Props {
  initial: string;
  onNext: (specialization: string) => void;
}

export default function StepSpecialization({ initial, onNext }: Props) {
  const [list, setList] = useState<string[] | null>(null);
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    getSpecializations()
      .then(setList)
      .catch(() => setLoadError('Nie udało się pobrać listy specjalizacji. Spróbuj ponownie za chwilę.'));
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!value) {
      setError('Wybierz lekarza z listy, aby zobaczyć wolne terminy.');
      return;
    }
    onNext(value);
  };

  return (
    <form onSubmit={submit} noValidate className="card">
      <label htmlFor="spec" className="field__label">
        Do jakiego lekarza chcesz się zapisać?
      </label>

      {loadError && <p className="alert alert--error" role="alert">{loadError}</p>}

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
        <option value="">{list ? '— wybierz z listy —' : 'Wczytywanie…'}</option>
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
