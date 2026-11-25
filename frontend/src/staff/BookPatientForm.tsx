import { useEffect, useRef, useState, type FormEvent } from 'react';
import Field from '../components/Field';
import { ApiError } from '../api';
import { staffBook } from '../staffApi';
import { isValidName, isValidPhoneInput, normalizePhone } from '../utils/phone';

// =====================================================================
// Zapis pacjenta przez rejestrację (WF-11), np. gdy pacjent dzwoni do przychodni.
// Jeśli pacjenta nie ma w bazie, backend sam zakłada mu konto (WF-04).
// =====================================================================

interface Props {
  token: string;
  termId: number;
  /** Opis terminu, np. „piątek, 20 listopada, 10:00” */
  termLabel: string;
  onDone: (result: { type: 'success' | 'error'; text: string }) => void;
  onClose: () => void;
}

type Errors = Partial<Record<'phone' | 'firstName' | 'lastName', string>>;

export default function BookPatientForm({ token, termId, termLabel, onDone, onClose }: Props) {
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const phoneRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    phoneRef.current?.focus();
  }, []);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Errors = {};
    if (!isValidPhoneInput(phone)) e.phone = 'Wpisz numer telefonu – 9 cyfr.';
    if (!isValidName(firstName)) e.firstName = 'Wpisz imię (same litery).';
    if (!isValidName(lastName)) e.lastName = 'Wpisz nazwisko (same litery).';
    setErrors(e);
    if (Object.keys(e).length) return;

    setBusy(true);
    try {
      const res = await staffBook(token, {
        termId,
        phoneNumber: normalizePhone(phone),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      onDone({ type: 'success', text: res.message });
    } catch (err) {
      onDone({ type: 'error', text: err instanceof ApiError ? err.message : 'Nie udało się zapisać pacjenta.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="inline-form" onSubmit={submit} noValidate aria-label={`Zapis pacjenta na ${termLabel}`}>
      <p className="inline-form__title">Zapis pacjenta: {termLabel}</p>
      <Field id={`book-${termId}-phone`} label="Telefon pacjenta" error={errors.phone}>
        {(aria) => (
          <input id={`book-${termId}-phone`} ref={phoneRef} className="field__control" type="tel" inputMode="tel"
            value={phone} onChange={(ev) => setPhone(ev.target.value)} {...aria} />
        )}
      </Field>
      <div className="field-row">
        <Field id={`book-${termId}-first`} label="Imię" error={errors.firstName}>
          {(aria) => (
            <input id={`book-${termId}-first`} className="field__control"
              value={firstName} onChange={(ev) => setFirstName(ev.target.value)} {...aria} />
          )}
        </Field>
        <Field id={`book-${termId}-last`} label="Nazwisko" error={errors.lastName}>
          {(aria) => (
            <input id={`book-${termId}-last`} className="field__control"
              value={lastName} onChange={(ev) => setLastName(ev.target.value)} {...aria} />
          )}
        </Field>
      </div>
      <div className="actions actions--start">
        <button type="submit" className="btn btn--primary btn--small" disabled={busy}>
          {busy ? 'Zapisywanie…' : 'Zapisz pacjenta'}
        </button>
        <button type="button" className="btn btn--secondary btn--small" disabled={busy} onClick={onClose}>
          Anuluj
        </button>
      </div>
    </form>
  );
}
