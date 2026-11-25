import { useEffect, useRef, useState, type FormEvent } from 'react';
import Field from '../components/Field';
import { ApiError, getCodeLength, sendCode, verifyCode } from '../api';
import { setStaffSession } from '../session';
import { codeHint, formatPhone, isValidPhoneInput, normalizePhone } from '../utils/phone';

// =====================================================================
// Logowanie pracownika przychodni – tak samo jak pacjenta (numer telefonu
// + jednorazowy kod SMS, WF-05), ale z rolą "staff".
// Konta pracowników zakłada administrator w bazie (nie ma rejestracji przez API).
// =====================================================================

export default function StaffLogin() {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [message, setMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const codeLength = getCodeLength();

  useEffect(() => {
    if (codeSent && !busy) codeRef.current?.focus();
  }, [codeSent, busy]);

  const handleSend = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setMessage(null);
    if (!isValidPhoneInput(phone)) {
      setPhoneError('Wpisz służbowy numer telefonu – 9 cyfr, np. 500 000 001.');
      return;
    }
    setPhoneError('');
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      await sendCode(phoneNumber, 'login', 'staff');
      setCodeSent(true);
      setCode('');
      setMessage({ type: 'info', text: `Wysłaliśmy SMS z kodem na numer ${formatPhone(phoneNumber)}.` });
    } catch (e) {
      // 404 = numer nie należy do pracownika; komunikat backendu jest po polsku
      setMessage({ type: 'error', text: e instanceof ApiError ? e.message : 'Nie udało się wysłać kodu SMS.' });
    } finally {
      setBusy(false);
    }
  };

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
      const { token } = await verifyCode(phoneNumber, code, 'login', 'staff');
      // Zmiana sesji pracownika sprawi, że StaffApp pokaże panel
      setStaffSession({ token: token!, phoneNumber });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setCodeError(`${e.message} Wpisz go ponownie albo wyślij nowy kod.`);
        codeRef.current?.focus();
      } else {
        setMessage({ type: 'error', text: e instanceof ApiError ? e.message : 'Wystąpił problem techniczny.' });
      }
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <p className="lead">Zaloguj się służbowym numerem telefonu. Dostaniesz jednorazowy kod SMS.</p>

      {message && (
        <p className={`alert alert--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      <form onSubmit={handleSend} noValidate>
        <fieldset className="group" disabled={codeSent || busy}>
          <legend className="sr-only">Logowanie pracownika kodem SMS</legend>
          <Field id="staff-phone" label="Numer telefonu" error={phoneError}>
            {(aria) => (
              <input id="staff-phone" className="field__control" type="tel" inputMode="tel" autoComplete="tel"
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
          <Field id="staff-code" label="Wpisz kod z SMS-a" hint={codeHint(codeLength)} error={codeError}>
            {(aria) => (
              <input id="staff-code" ref={codeRef} className="field__control field__control--code"
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
