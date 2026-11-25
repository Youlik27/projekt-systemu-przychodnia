import { useEffect, useRef, useState } from 'react';
import TermPicker from './TermPicker';
import { ApiError, formatDay, formatTime, getTermsForSpecialization, type Term } from '../api';

// =====================================================================
// Zmiana terminu wizyty (WF-08 – pacjent, WF-11 – pracownik przychodni).
//
// 1. Pokazujemy obecny termin i wolne terminy TEJ SAMEJ specjalizacji
//    (backend nie pozwala przenieść wizyty do innej specjalizacji).
// 2. Po wyborze godziny pytamy „Czy na pewno przenieść…?” – bez okna modalnego.
// 3. Zapis robi funkcja `onConfirm` (inna dla pacjenta, inna dla pracownika).
// Jeśli termin zajął ktoś inny (409), odświeżamy listę i prosimy o inny wybór.
// =====================================================================

interface Props {
  /** Specjalizacja wizyty – nowy termin musi być tej samej */
  specialization: string;
  /** Obecna data wizyty (ISO) – do pokazania „z … na …” */
  currentStart: string;
  /** Kto przenosi wizytę – zmienia tylko tekst nagłówka */
  heading: string;
  onConfirm: (term: Term) => Promise<void>;
  onClose: () => void;
}

export default function RescheduleVisit({ specialization, currentStart, heading, onConfirm, onClose }: Props) {
  /** null = trwa wczytywanie */
  const [terms, setTerms] = useState<Term[] | null>(null);
  const [error, setError] = useState('');
  const [chosen, setChosen] = useState<Term | null>(null);
  const [busy, setBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionRef = useRef<HTMLParagraphElement>(null);

  // Po otwarciu fokus na nagłówek – czytnik ekranu odczyta, co się dzieje
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (chosen) questionRef.current?.focus();
  }, [chosen]);

  useEffect(() => {
    let active = true;
    getTermsForSpecialization(specialization)
      .then((list) => {
        if (active) setTerms(list);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : 'Nie udało się pobrać wolnych terminów.');
      });
    return () => {
      active = false;
    };
  }, [specialization, reloadKey]);

  const confirm = async () => {
    if (!chosen) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(chosen);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Nie udało się zmienić terminu. Spróbuj ponownie.');
      setChosen(null);
      // termin mógł zostać zajęty w międzyczasie – pobieramy aktualną listę
      if (e instanceof ApiError && e.status === 409) {
        setTerms(null);
        setReloadKey((k) => k + 1);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card reschedule" aria-labelledby="reschedule-title">
      <h2 id="reschedule-title" ref={headingRef} tabIndex={-1} className="section-title">{heading}</h2>
      <p className="lead">
        {specialization}. Obecny termin: <strong>{formatDay(currentStart)}, godz. {formatTime(currentStart)}</strong>.
      </p>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!terms && !error && <p className="loading" role="status">Szukam wolnych terminów…</p>}
      {terms && terms.length === 0 && (
        <p className="alert alert--info" role="status">Brak innych wolnych terminów tej specjalizacji.</p>
      )}

      {chosen ? (
        <div className="confirm-box">
          <p ref={questionRef} tabIndex={-1} className="confirm-box__question">
            Przenieść wizytę na {formatDay(chosen.StartDate)}, godz. {formatTime(chosen.StartDate)}
            {' '}(dr {chosen.DoctorFirstName} {chosen.DoctorLastName})? Obecny termin zostanie zwolniony.
          </p>
          <div className="actions actions--start">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={confirm}>
              {busy ? 'Zapisywanie…' : 'Tak, zmień termin'}
            </button>
            <button type="button" className="btn btn--secondary" disabled={busy} onClick={() => setChosen(null)}>
              Wybierz inną godzinę
            </button>
          </div>
        </div>
      ) : (
        terms && terms.length > 0 && <TermPicker terms={terms} onPick={setChosen} disabled={busy} />
      )}

      <div className="actions actions--start">
        <button type="button" className="btn btn--secondary" disabled={busy} onClick={onClose}>
          ← Nie zmieniaj terminu
        </button>
      </div>
    </section>
  );
}
