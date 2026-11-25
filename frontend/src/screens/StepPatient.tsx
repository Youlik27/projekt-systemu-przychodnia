import { useEffect, useRef, useState, type FormEvent } from 'react';
import Field from '../components/Field';
import {
  ApiError,
  DEMO_CODE,
  createReservation,
  formatDay,
  formatTime,
  getCodeLength,
  isDemoMode,
  registerPatient,
  sendCode,
  verifyCode,
  type Purpose,
  type Reservation,
  type Term,
} from '../api';
import { clearSession, setSession, useSession } from '../session';
import { codeHint, formatPhone, isValidName, isValidPhoneInput, normalizePhone } from '../utils/phone';

// =====================================================================
// Ekran 3: dane pacjenta + autoryzacja SMS
// (dokumentacja 4.6 ekran 3, scenariusz 4.4 kroki 5–11)
//
// Przebieg dla pacjenta, który NIE jest zalogowany:
//   1. Wpisuje telefon, imię i nazwisko → „Wyślij kod SMS”.
//   2. Próbujemy wysłać kod LOGOWANIA. Jeśli backend odpowie 404 (brak konta),
//      od razu wysyłamy kod REJESTRACJI – konto założy się automatycznie (WF-04).
//      Pacjent nie musi wiedzieć, czy ma już konto.
//   3. Wpisuje kod → weryfikacja → (rejestracja) → rezerwacja → ekran 4.
//
// Pacjent ZALOGOWANY (np. wcześniej w „Moje wizyty” albo po poprzedniej
// rezerwacji) nie dostaje drugiego SMS-a – potwierdza rezerwację jednym przyciskiem.
// =====================================================================

interface Props {
  term: Term;
  onBack: () => void;
  /** Termin zajął ktoś inny (409) – wracamy do wyboru godziny z komunikatem */
  onTermTaken: (message: string) => void;
  /** Rezerwacja zapisana – przekazujemy dane do ekranu potwierdzenia */
  onDone: (reservation: Reservation, firstName?: string) => void;
}

/** Nazwy pól formularza; backend nazywa telefon "phoneNumber", my "phone". */
type FieldName = 'firstName' | 'lastName' | 'phone' | 'code';
type Errors = Partial<Record<FieldName, string>>;

/** Zamienia błędy pól z backendu ({ phoneNumber: "..." }) na nazwy pól tego formularza. */
function mapServerErrors(fieldErrors: Record<string, string>): Errors {
  const mapped: Errors = {};
  if (fieldErrors.firstName) mapped.firstName = fieldErrors.firstName;
  if (fieldErrors.lastName) mapped.lastName = fieldErrors.lastName;
  if (fieldErrors.phoneNumber) mapped.phone = fieldErrors.phoneNumber;
  if (fieldErrors.code) mapped.code = fieldErrors.code;
  return mapped;
}

type Message = { type: 'error' | 'info'; text: string } | null;

export default function StepPatient({ term, onBack, onTermTaken, onDone }: Props) {
  const session = useSession();

  return (
    <div className="card">
      {/* Przypomnienie, jaki termin pacjent wybrał – z możliwością zmiany */}
      <div className="summary summary--compact" aria-label="Wybrany termin">
        <p><strong>{term.Specialization}</strong> – dr {term.DoctorFirstName} {term.DoctorLastName}</p>
        <p>{formatDay(term.StartDate)}, godz. <strong>{formatTime(term.StartDate)}</strong></p>
        <button type="button" className="link-btn" onClick={onBack}>zmień termin</button>
      </div>

      {session ? (
        <LoggedInConfirm term={term} onTermTaken={onTermTaken} onDone={onDone} />
      ) : (
        <SmsBookingForm term={term} onTermTaken={onTermTaken} onDone={onDone} />
      )}

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={onBack}>← Wstecz</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Wariant A: pacjent zalogowany – rezerwacja jednym kliknięciem
// ---------------------------------------------------------------------

function LoggedInConfirm({ term, onTermTaken, onDone }: Omit<Props, 'onBack'>) {
  const session = useSession()!;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  const confirm = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const reservation = await createReservation(session.token, term.TermID);
      onDone(reservation, session.firstName);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        onTermTaken(e.message);
        return;
      }
      // 401 – token wygasł: session.ts sam wyloguje pacjenta i pokaże się formularz SMS
      setMessage({
        type: 'error',
        text: e instanceof ApiError ? e.message : 'Wystąpił problem techniczny. Spróbuj ponownie za chwilę.',
      });
      setBusy(false);
    }
  };

  return (
    <>
      {message && <p className="alert alert--error" role="alert">{message.text}</p>}
      <p className="lead">
        Rezerwujesz jako{session.firstName ? <> <strong>{session.firstName}</strong>,</> : ''} tel.{' '}
        <strong>{formatPhone(session.phoneNumber)}</strong>.
      </p>
      <button type="button" className="btn btn--primary btn--block" onClick={confirm} disabled={busy}>
        {busy ? 'Rezerwuję…' : 'Potwierdzam rezerwację'}
      </button>
      <p>
        <button type="button" className="link-btn" onClick={clearSession} disabled={busy}>
          To nie ja – wyloguj i podaj inne dane
        </button>
      </p>
    </>
  );
}

// ---------------------------------------------------------------------
// Wariant B: pacjent niezalogowany – dane + kod SMS
// ---------------------------------------------------------------------

function SmsBookingForm({ term, onTermTaken, onDone }: Omit<Props, 'onBack'>) {
  // Wartości pól formularza
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  // purpose === null → kod jeszcze nie został wysłany (widoczny jest tylko formularz danych)
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const codeLength = getCodeLength();
  const codeSent = purpose !== null;

  /** Walidacja po stronie przeglądarki – te same reguły co w backendzie. */
  const validateData = (): boolean => {
    const e: Errors = {};
    if (!isValidName(firstName)) e.firstName = 'Wpisz imię (same litery).';
    if (!isValidName(lastName)) e.lastName = 'Wpisz nazwisko (same litery).';
    if (!isValidPhoneInput(phone)) e.phone = 'Wpisz numer telefonu – 9 cyfr, np. 600 100 200.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Krok 1: wysłanie kodu SMS (także „Wyślij kod ponownie”). */
  const handleSend = async (ev?: FormEvent) => {
    ev?.preventDefault();
    setMessage(null);
    if (!validateData()) return;
    setBusy(true);
    const phoneNumber = normalizePhone(phone);
    try {
      // Przy ponownym wysłaniu znamy już cel; za pierwszym razem zaczynamy od logowania
      let p: Purpose = purpose ?? 'login';
      try {
        await sendCode(phoneNumber, p);
      } catch (e) {
        // 404 = brak konta z tym numerem → nowy pacjent, konto założymy automatycznie
        if (p === 'login' && e instanceof ApiError && e.status === 404) {
          p = 'register';
          await sendCode(phoneNumber, p);
        } else {
          throw e;
        }
      }
      setPurpose(p);
      setCode('');
      setMessage({
        type: 'info',
        text:
          p === 'register'
            ? `Jesteś u nas pierwszy raz – po potwierdzeniu kodu założymy Ci konto automatycznie. Wysłaliśmy SMS na numer ${formatPhone(phoneNumber)}.`
            : `Wysłaliśmy SMS z kodem na numer ${formatPhone(phoneNumber)}.`,
      });
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setErrors(mapServerErrors(e.fieldErrors));
      }
      // Komunikaty backendu są po polsku i zrozumiałe (np. limit SMS-ów 429, błąd bramki SMS 503)
      setMessage({
        type: 'error',
        text: e instanceof ApiError ? e.message : 'Nie udało się wysłać kodu SMS. Spróbuj ponownie za chwilę.',
      });
    } finally {
      setBusy(false);
    }
  };

  /** Krok 2: weryfikacja kodu → (rejestracja) → rezerwacja. */
  const handleConfirm = async (ev: FormEvent) => {
    ev.preventDefault();
    setMessage(null);
    if (!new RegExp(`^\\d{${codeLength}}$`).test(code)) {
      // „składa się z N cyfr” – po „z” zawsze dopełniacz, więc bez codeHint()
      setErrors({ code: `Kod składa się z ${codeLength} cyfr.` });
      codeRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    const phoneNumber = normalizePhone(phone);

    // Etap, na którym jesteśmy – żeby wiedzieć, jak obsłużyć błąd
    let stage: 'verify' | 'register' | 'reserve' = 'verify';
    try {
      const verified = await verifyCode(phoneNumber, code, purpose!);
      let token = verified.token;

      if (purpose === 'register') {
        stage = 'register';
        const reg = await registerPatient({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phoneNumber,
        });
        token = reg.token;
      }

      // Zapamiętujemy sesję – po rezerwacji pacjent zobaczy „Moje wizyty” bez kolejnego SMS-a
      setSession({ token: token!, phoneNumber, firstName: firstName.trim() });

      stage = 'reserve';
      const reservation = await createReservation(token!, term.TermID);
      onDone(reservation, firstName.trim());
    } catch (e) {
      const apiError = e instanceof ApiError ? e : null;

      // UC.Wizyta.Alt04 – ktoś zajął termin w międzyczasie → wybór innej godziny
      if (stage === 'reserve' && apiError?.status === 409) {
        onTermTaken(apiError.message);
        return;
      }

      // UC.Wizyta.Alt02 – błędny lub wygasły kod → można wpisać ponownie albo wysłać nowy
      if (stage === 'verify' && apiError?.status === 400) {
        setErrors({ code: `${apiError.message} Wpisz go ponownie albo wyślij nowy kod.` });
        codeRef.current?.focus();
        return;
      }

      // UC.B02 – backend odrzucił dane osobowe → odblokowujemy formularz do poprawy
      if (stage === 'register' && apiError?.status === 400) {
        setErrors(mapServerErrors(apiError.fieldErrors));
        setPurpose(null);
        setMessage({ type: 'error', text: `${apiError.message} Popraw dane i wyślij nowy kod.` });
        return;
      }

      // Pozostałe błędy (np. 503 – problem techniczny, UC.B01): pokazujemy komunikat backendu
      setMessage({
        type: 'error',
        text: apiError?.message ?? 'Wystąpił problem techniczny. Spróbuj ponownie za chwilę.',
      });
    } finally {
      setBusy(false);
    }
  };

  // Po wysłaniu kodu przenosimy fokus do pola kodu (gdy formularz już nie jest zablokowany)
  useEffect(() => {
    if (codeSent && !busy) codeRef.current?.focus();
  }, [codeSent, busy]);

  return (
    <>
      {message && (
        <p className={`alert alert--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}

      {/* Formularz danych – blokowany po wysłaniu kodu (fieldset disabled) */}
      <form onSubmit={handleSend} noValidate>
        <fieldset className="group" disabled={codeSent || busy}>
          <legend className="field__label field__label--big">Twoje dane</legend>

          <Field id="phone" label="Numer telefonu" hint="Na ten numer wyślemy kod SMS." error={errors.phone}>
            {(aria) => (
              <input id="phone" className="field__control" type="tel" inputMode="tel" autoComplete="tel"
                value={phone} onChange={(e) => setPhone(e.target.value)} {...aria} />
            )}
          </Field>

          <div className="field-row">
            <Field id="firstName" label="Imię" error={errors.firstName}>
              {(aria) => (
                <input id="firstName" className="field__control" autoComplete="given-name"
                  value={firstName} onChange={(e) => setFirstName(e.target.value)} {...aria} />
              )}
            </Field>
            <Field id="lastName" label="Nazwisko" error={errors.lastName}>
              {(aria) => (
                <input id="lastName" className="field__control" autoComplete="family-name"
                  value={lastName} onChange={(e) => setLastName(e.target.value)} {...aria} />
              )}
            </Field>
          </div>

          {!codeSent && (
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? 'Wysyłanie…' : 'Wyślij kod SMS'}
            </button>
          )}
        </fieldset>
      </form>

      {/* Formularz kodu – pojawia się dopiero po wysłaniu SMS-a */}
      {codeSent && (
        <form onSubmit={handleConfirm} noValidate className="code-form">
          {isDemoMode() && (
            <p className="alert alert--info">Tryb demonstracyjny: wpisz kod <strong>{DEMO_CODE}</strong>.</p>
          )}
          <Field id="code" label="Wpisz kod z SMS-a" hint={codeHint(codeLength)} error={errors.code}>
            {(aria) => (
              <input id="code" ref={codeRef} className="field__control field__control--code"
                inputMode="numeric" autoComplete="one-time-code" maxLength={codeLength}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} {...aria} />
            )}
          </Field>
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
    </>
  );
}
