import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ApiError,
  DEMO_CODE,
  createReservation,
  formatDay,
  formatTime,
  isDemoMode,
  registerPatient,
  sendCode,
  verifyCode,
  type Purpose,
  type Term,
} from '../api';

// Ekran 3: dane pacjenta + autoryzacja SMS (dokumentacja 4.6, scenariusz 4.4 kroki 5–11).
// Pacjent, który już jest w bazie – loguje się kodem. Nowy pacjent – podaje dodatkowo
// datę urodzenia i adres (wymagane przez backend), a konto tworzy się automatycznie (WF-04).

export interface PatientInfo {
  firstName: string;
  lastName: string;
}

interface Props {
  term: Term;
  onBack: () => void;
  onTermTaken: (message: string) => void;
  onDone: (info: PatientInfo) => void;
}

type Errors = Partial<Record<'firstName' | 'lastName' | 'phone' | 'birthDate' | 'address' | 'code', string>>;

/** Zamienia "600 100 200" / "48600100200" / "+48 600-100-200" na "+48600100200". */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('48') && digits.length === 11) return `+${digits}`;
  return `+48${digits}`;
}

export default function StepPatient({ term, onBack, onTermTaken, onDone }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');

  const [purpose, setPurpose] = useState<Purpose | null>(null); // null = kod jeszcze nie wysłany
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const birthRef = useRef<HTMLInputElement>(null);

  const validateData = (): boolean => {
    const e: Errors = {};
    if (!firstName.trim()) e.firstName = 'Wpisz imię.';
    if (!lastName.trim()) e.lastName = 'Wpisz nazwisko.';
    if (!/^\+[1-9]\d{7,14}$/.test(normalizePhone(phone)) || phone.replace(/\D/g, '').length < 9)
      e.phone = 'Wpisz numer telefonu – 9 cyfr, np. 600 100 200.';
    if (needsRegistration) {
      if (!birthDate) e.birthDate = 'Podaj datę urodzenia.';
      else if (new Date(birthDate) > new Date()) e.birthDate = 'Data urodzenia nie może być z przyszłości.';
      if (!address.trim()) e.address = 'Podaj adres zamieszkania.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSend = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setMessage(null);
    if (!validateData()) return;
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      const p: Purpose = needsRegistration ? 'register' : 'login';
      try {
        await sendCode(phoneNumber, p);
        setPurpose(p);
      } catch (e) {
        // Brak konta → pacjent musi uzupełnić dane do automatycznego założenia konta
        if (p === 'login' && e instanceof ApiError && e.status === 404) {
          setNeedsRegistration(true);
          setMessage({
            type: 'info',
            text: 'Jesteś u nas pierwszy raz. Podaj jeszcze datę urodzenia i adres – założymy Ci konto automatycznie.',
          });
          setTimeout(() => birthRef.current?.focus(), 0);
          return;
        }
        throw e;
      }
      setMessage({ type: 'info', text: `Wysłaliśmy SMS z kodem na numer ${phoneNumber}.` });
    } catch (e) {
      setMessage({
        type: 'error',
        text:
          e instanceof ApiError && e.status === 429
            ? 'Wysłano zbyt wiele kodów. Odczekaj chwilę i spróbuj ponownie.'
            : 'Nie udało się wysłać kodu SMS. Spróbuj ponownie za chwilę.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setErrors({ code: 'Kod składa się z 6 cyfr.' });
      return;
    }
    setErrors({});
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      const verified = await verifyCode(phoneNumber, code, purpose!);
      let token = verified.token;
      if (purpose === 'register') {
        const reg = await registerPatient({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          address: address.trim(),
          birthDate,
          phoneNumber,
        });
        token = reg.token;
      }
      await createReservation(token!, term.TermID);
      onDone({ firstName: firstName.trim(), lastName: lastName.trim() });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /termin/i.test(e.message)) {
        onTermTaken('Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta. Wybierz inną godzinę.');
        return;
      }
      if (e instanceof ApiError && e.status === 400) {
        setErrors({ code: 'Wprowadzony kod jest nieprawidłowy lub wygasł. Wpisz go ponownie albo wyślij nowy kod.' });
        codeRef.current?.focus();
        return;
      }
      setMessage({ type: 'error', text: 'Wystąpił problem techniczny. Spróbuj ponownie za chwilę.' });
    } finally {
      setBusy(false);
    }
  };

  const codeSent = purpose !== null;

  // Po wysłaniu kodu przenosimy fokus do pola kodu (gdy formularz już nie jest zablokowany).
  useEffect(() => {
    if (codeSent && !busy) codeRef.current?.focus();
  }, [codeSent, busy]);
  const field = (
    id: keyof Errors,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}</label>
      {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
      {input}
      {errors[id] && (
        <p id={`${id}-error`} className="field__error" role="alert">
          <span aria-hidden="true">⚠ </span>{errors[id]}
        </p>
      )}
    </div>
  );
  const describedBy = (id: keyof Errors, hint = false) =>
    [hint && `${id}-hint`, errors[id] && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className="card">
      <div className="summary summary--compact" aria-label="Wybrany termin">
        <p><strong>{term.Specialization}</strong> – dr {term.DoctorFirstName} {term.DoctorLastName}</p>
        <p>{formatDay(term.StartDate)}, godz. <strong>{formatTime(term.StartDate)}</strong></p>
        <button type="button" className="link-btn" onClick={onBack}>zmień termin</button>
      </div>

      {message && (
        <p className={`alert alert--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <form onSubmit={handleSend} noValidate>
        <fieldset className="group" disabled={codeSent || busy}>
          <legend className="field__label field__label--big">Twoje dane</legend>
          {field('phone', 'Numer telefonu', (
            <input id="phone" className="field__control" type="tel" inputMode="tel" autoComplete="tel"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone} aria-describedby={describedBy('phone', true)} />
          ), 'Na ten numer wyślemy kod SMS.')}
          <div className="field-row">
            {field('firstName', 'Imię', (
              <input id="firstName" className="field__control" autoComplete="given-name"
                value={firstName} onChange={(e) => setFirstName(e.target.value)}
                aria-invalid={!!errors.firstName} aria-describedby={describedBy('firstName')} />
            ))}
            {field('lastName', 'Nazwisko', (
              <input id="lastName" className="field__control" autoComplete="family-name"
                value={lastName} onChange={(e) => setLastName(e.target.value)}
                aria-invalid={!!errors.lastName} aria-describedby={describedBy('lastName')} />
            ))}
          </div>

          {needsRegistration && (
            <div className="field-row">
              {field('birthDate', 'Data urodzenia', (
                <input id="birthDate" ref={birthRef} className="field__control" type="date" autoComplete="bday"
                  value={birthDate} onChange={(e) => setBirthDate(e.target.value)}
                  aria-invalid={!!errors.birthDate} aria-describedby={describedBy('birthDate')} />
              ))}
              {field('address', 'Adres zamieszkania', (
                <input id="address" className="field__control" autoComplete="street-address"
                  value={address} onChange={(e) => setAddress(e.target.value)}
                  aria-invalid={!!errors.address} aria-describedby={describedBy('address')} />
              ))}
            </div>
          )}

          {!codeSent && (
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Wysyłanie…' : 'Wyślij kod SMS'}
            </button>
          )}
        </fieldset>
      </form>

      {codeSent && (
        <form onSubmit={handleConfirm} noValidate className="code-form">
          {isDemoMode() && (
            <p className="alert alert--info">Tryb demonstracyjny (brak serwera): wpisz kod <strong>{DEMO_CODE}</strong>.</p>
          )}
          {field('code', 'Wpisz kod z SMS-a', (
            <input id="code" ref={codeRef} className="field__control field__control--code"
              inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              aria-invalid={!!errors.code} aria-describedby={describedBy('code', true)} />
          ), '6 cyfr')}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Rezerwuję…' : 'Potwierdzam rezerwację'}
          </button>
          <div className="actions actions--split">
            <button type="button" className="link-btn" disabled={busy} onClick={() => handleSend()}>
              Wyślij kod ponownie
            </button>
            <button type="button" className="link-btn" disabled={busy}
              onClick={() => { setPurpose(null); setCode(''); setMessage(null); }}>
              Popraw dane
            </button>
          </div>
        </form>
      )}

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={onBack} disabled={busy}>← Wstecz</button>
      </div>
    </div>
  );
}
