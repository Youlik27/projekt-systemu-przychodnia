import { useEffect, useRef, useState, type FormEvent } from 'react';
import Field from '../components/Field';
import { ApiError, DEMO_CODE, getCodeLength, isDemoMode, sendCode, verifyCode } from '../api';
import { setSession } from '../session';
import { codeHint, formatPhone, isValidPhoneInput, normalizePhone } from '../utils/phone';

// =====================================================================
// Logowanie do „Moje wizyty” – WF-05 (numer telefonu + jednorazowy kod SMS).
//
// Bez hasła: pacjent podaje telefon, dostaje SMS z kodem, wpisuje kod – gotowe.
// Po udanej weryfikacji zapisujemy sesję (session.ts), a ekran MyVisits
// sam przełącza się na listę wizyt.
// =====================================================================

interface Props {
  /** Brak konta → proponujemy umówienie pierwszej wizyty */
  onBook: () => void;
  /** Komunikat do pokazania nad formularzem, np. „Sesja wygasła” */
  notice?: string;
  /** Wywoływane po udanym zalogowaniu */
  onLoggedIn?: () => void;
}

export default function VisitsLogin({ onBook, notice, onLoggedIn }: Props) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  /** true = numer nie ma konta → pokazujemy przycisk „Umów pierwszą wizytę” */
  const [noAccount, setNoAccount] = useState(false);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const codeLength = getCodeLength();

  /** Krok 1: wysłanie kodu logowania. */
  const handleSend = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setMessage(null);
    setNoAccount(false);
    if (!isValidPhoneInput(phone)) {
      setPhoneError('Wpisz numer telefonu – 9 cyfr, np. 600 100 200.');
      return;
    }
    setPhoneError('');
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      await sendCode(phoneNumber, 'login');
      setCodeSent(true);
      setCode('');
      setMessage({ type: 'info', text: `Wysłaliśmy SMS z kodem na numer ${formatPhone(phoneNumber)}.` });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        // Konto zakłada się przy pierwszej rezerwacji (WF-04), więc kierujemy do rezerwacji
        setNoAccount(true);
        setMessage({
          type: 'info',
          text: 'Nie mamy jeszcze pacjenta z tym numerem. Konto założy się samo przy pierwszej rezerwacji wizyty.',
        });
      } else {
        setMessage({
          type: 'error',
          text: e instanceof ApiError ? e.message : 'Nie udało się wysłać kodu SMS. Spróbuj ponownie za chwilę.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  /** Krok 2: weryfikacja kodu → zapis sesji. */
  const handleVerify = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    if (!new RegExp(`^\\d{${codeLength}}$`).test(code)) {
      setCodeError(`Kod składa się z ${codeLength} cyfr.`);
      codeRef.current?.focus();
      return;
    }
    setCodeError('');
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      const { token } = await verifyCode(phoneNumber, code, 'login');
      // Ta zmiana sesji sprawi, że MyVisits pokaże listę wizyt
      setSession({ token: token!, phoneNumber });
      onLoggedIn?.();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setCodeError(`${e.message} Wpisz go ponownie albo wyślij nowy kod.`);
        codeRef.current?.focus();
      } else {
        setMessage({
          type: 'error',
          text: e instanceof ApiError ? e.message : 'Wystąpił problem techniczny. Spróbuj ponownie za chwilę.',
        });
      }
      setBusy(false);
    }
  };

  // Po wysłaniu kodu fokus wędruje do pola kodu
  useEffect(() => {
    if (codeSent && !busy) codeRef.current?.focus();
  }, [codeSent, busy]);

  return (
    <div className="card">
      <p className="lead">
        Zaloguj się numerem telefonu, aby zobaczyć swoje wizyty lub je anulować. Nie potrzebujesz hasła.
      </p>

      {notice && <p className="alert alert--warning" role="alert">{notice}</p>}

      {message && (
        <div className={`alert alert--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          <p>{message.text}</p>
          {noAccount && (
            <button type="button" className="btn btn--primary" onClick={onBook}>Umów pierwszą wizytę</button>
          )}
        </div>
      )}

      <form onSubmit={handleSend} noValidate>
        <fieldset className="group" disabled={codeSent || busy}>
          {/* legenda tylko dla czytnika ekranu – nie powtarza etykiety pola */}
          <legend className="sr-only">Logowanie kodem SMS</legend>
          <Field id="login-phone" label="Numer telefonu" hint="Ten sam, który podajesz przy rezerwacji."
            error={phoneError}>
            {(aria) => (
              <input id="login-phone" className="field__control" type="tel" inputMode="tel" autoComplete="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)} {...aria} />
            )}
          </Field>
          {!codeSent && (
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Wysyłanie…' : 'Wyślij kod SMS'}
            </button>
          )}
        </fieldset>
      </form>

      {codeSent && (
        <form onSubmit={handleVerify} noValidate className="code-form">
          {isDemoMode() && (
            <p className="alert alert--info">
              Tryb demonstracyjny: wpisz kod <strong>{DEMO_CODE}</strong> (pacjent testowy: 600 100 200).
            </p>
          )}
          <Field id="login-code" label="Wpisz kod z SMS-a" hint={codeHint(codeLength)} error={codeError}>
            {(aria) => (
              <input id="login-code" ref={codeRef} className="field__control field__control--code"
                inputMode="numeric" autoComplete="one-time-code" maxLength={codeLength}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} {...aria} />
            )}
          </Field>
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'Sprawdzanie…' : 'Zaloguj się'}
          </button>
          <div className="actions actions--split">
            <button type="button" className="link-btn" disabled={busy} onClick={() => handleSend()}>
              Wyślij kod ponownie
            </button>
            <button type="button" className="link-btn" disabled={busy}
              onClick={() => { setCodeSent(false); setCode(''); setMessage(null); setCodeError(''); }}>
              Zmień numer
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
