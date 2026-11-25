import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import AccessibilityBar from './components/AccessibilityBar';
import Stepper from './components/Stepper';
import StepSpecialization from './screens/StepSpecialization';
import StepTerm from './screens/StepTerm';
import StepPatient from './screens/StepPatient';
import StepConfirm from './screens/StepConfirm';
import MyVisits from './screens/MyVisits';
import StaffApp from './staff/StaffApp';
import { CLINIC_ADDRESS, DEMO_CODE, isDemoMode, subscribeDemoMode, type Reservation, type Term } from './api';
import { clearSession, useSession } from './session';

// =====================================================================
// Główny komponent aplikacji.
//
// Aplikacja ma dwie zakładki dla pacjenta (bez routera – to wystarcza przy dwóch widokach):
//   - „Umów wizytę”  – 4-krokowa rezerwacja (WNF-07: maks. 4 kroki),
//   - „Moje wizyty”  – lista wizyt, anulowanie i zmiana terminu (WF-06, WF-07, WF-08).
// Osobno, pod adresem #pracownik, jest panel pracownika przychodni (WF-10, WF-11, WF-12).
// Pacjent go nie widzi w menu – prowadzi do niego tylko link w stopce.
//
// Stan rezerwacji (wybrana specjalizacja, termin, wynik) trzymamy tutaj,
// bo przechodzi między ekranami. Każdy ekran dostaje tylko to, czego potrzebuje,
// i informuje App o przejściu dalej przez funkcje onNext / onDone / onBack.
// =====================================================================

type View = 'booking' | 'visits';

/** Adres panelu pracownika */
const STAFF_HASH = '#pracownik';

/** Nagłówek h1 dla każdego kroku rezerwacji */
const BOOKING_TITLES = [
  'Umów wizytę do lekarza',
  'Wybierz dzień i godzinę',
  'Podaj dane i potwierdź kodem SMS',
  'Wizyta została zarezerwowana!',
];

export default function App() {
  const [view, setView] = useState<View>('booking');
  /** true = panel pracownika (adres kończy się na #pracownik) */
  const [staffMode, setStaffMode] = useState(() => window.location.hash === STAFF_HASH);

  // Przełączanie strona pacjenta ↔ panel pracownika przez zmianę adresu (#pracownik)
  useEffect(() => {
    const onHash = () => setStaffMode(window.location.hash === STAFF_HASH);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // --- stan procesu rezerwacji ---
  const [step, setStep] = useState(0); // 0..3 – indeks w BOOKING_TITLES
  const [specialization, setSpecialization] = useState('');
  const [term, setTerm] = useState<Term | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [firstName, setFirstName] = useState<string | undefined>();
  /** Komunikat na ekranie terminów, np. „termin został właśnie zarezerwowany” */
  const [notice, setNotice] = useState('');

  const session = useSession();
  // Tryb demonstracyjny włącza api.ts, gdy backend nie odpowiada – wtedy pokazujemy baner
  const demo = useSyncExternalStore(subscribeDemoMode, isDemoMode);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const title = view === 'visits' ? 'Moje wizyty' : BOOKING_TITLES[step];

  // Po zmianie kroku lub zakładki przenosimy fokus na nagłówek –
  // czytnik ekranu od razu odczyta, gdzie jesteśmy (WNF-01, WNF-02).
  useEffect(() => {
    // W panelu pracownika tytuł karty i fokus ustawia StaffApp
    if (staffMode) return;
    document.title = `${title} – Przychodnia`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [title, view, step, staffMode]);

  /** Rozpoczęcie rezerwacji od nowa (krok 1) */
  const resetBooking = () => {
    setStep(0);
    setTerm(null);
    setReservation(null);
    setNotice('');
  };

  const goToBooking = () => {
    resetBooking();
    setView('booking');
  };

  const goToVisits = () => {
    resetBooking();
    setView('visits');
  };

  return (
    <>
      {/* Link „przejdź do treści” – widoczny po naciśnięciu Tab, pomija menu */}
      <a href="#main" className="skip-link">Przejdź do treści</a>
      <AccessibilityBar />

      <header className="site-header">
        <div className="container site-header__inner">
          <span className="logo" aria-hidden="true">✚</span>
          <div className="site-header__text">
            <p className="site-header__name">Przychodnia Zdrowie</p>
            <p className="site-header__sub">Rejestracja: (22) 123 45 67 · pn–pt 8:00–18:00</p>
          </div>
        </div>

        {/* Menu główne – aktywna zakładka ma aria-current="page" (i podkreślenie, nie tylko kolor).
            W panelu pracownika menu zawiera tylko powrót do strony dla pacjentów. */}
        {staffMode ? (
          <nav className="container main-nav" aria-label="Menu główne">
            <ul className="main-nav__list">
              <li><a className="main-nav__btn" href="#">← Strona dla pacjentów</a></li>
            </ul>
          </nav>
        ) : (
          <nav className="container main-nav" aria-label="Menu główne">
            <ul className="main-nav__list">
              <li>
                <button type="button" className="main-nav__btn"
                  aria-current={view === 'booking' ? 'page' : undefined} onClick={goToBooking}>
                  Umów wizytę
                </button>
              </li>
              <li>
                <button type="button" className="main-nav__btn"
                  aria-current={view === 'visits' ? 'page' : undefined} onClick={goToVisits}>
                  Moje wizyty
                </button>
              </li>
              {session && (
                <li className="main-nav__logout">
                  <button type="button" className="link-btn" onClick={clearSession}>Wyloguj się</button>
                </li>
              )}
            </ul>
          </nav>
        )}
      </header>

      {/* Baner trybu demo – żeby nikt nie pomylił danych testowych z prawdziwą rezerwacją */}
      {demo && (
        <div className="demo-banner" role="status">
          <p className="container">
            <strong>Tryb demonstracyjny:</strong> serwer jest niedostępny, rezerwacje nie są zapisywane.
            Kod SMS: <strong>{DEMO_CODE}</strong>.
          </p>
        </div>
      )}

      <main id="main" className="container">
        {staffMode && <StaffApp />}
        {!staffMode && view === 'booking' && <Stepper current={step} />}
        {!staffMode && <h1 ref={headingRef} tabIndex={-1} className="page-title">{title}</h1>}

        {!staffMode && view === 'visits' && <MyVisits onBook={goToBooking} />}

        {/* ----- Krok 1: specjalizacja ----- */}
        {!staffMode && view === 'booking' && step === 0 && (
          <StepSpecialization
            initial={specialization}
            onNext={(s) => {
              setSpecialization(s);
              setNotice('');
              setStep(1);
            }}
          />
        )}

        {/* ----- Krok 2: dzień i godzina ----- */}
        {!staffMode && view === 'booking' && step === 1 && (
          <StepTerm
            specialization={specialization}
            notice={notice}
            onBack={() => setStep(0)}
            onNext={(t) => {
              setTerm(t);
              setNotice('');
              setStep(2);
            }}
          />
        )}

        {/* ----- Krok 3: dane pacjenta i kod SMS ----- */}
        {!staffMode && view === 'booking' && step === 2 && term && (
          <StepPatient
            term={term}
            onBack={() => setStep(1)}
            onTermTaken={(msg) => {
              // UC.Wizyta.Alt04 – wracamy do wyboru godziny z komunikatem z backendu
              setNotice(`${msg} Wybierz inną godzinę.`);
              setTerm(null);
              setStep(1);
            }}
            onDone={(r, name) => {
              setReservation(r);
              setFirstName(name);
              setStep(3);
            }}
          />
        )}

        {/* ----- Krok 4: potwierdzenie ----- */}
        {!staffMode && view === 'booking' && step === 3 && reservation && (
          <StepConfirm
            reservation={reservation}
            firstName={firstName}
            onHome={resetBooking}
            onShowVisits={goToVisits}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>Przychodnia Zdrowie · {CLINIC_ADDRESS}</p>
          <p>Masz problem z rezerwacją? Zadzwoń: <a href="tel:+48221234567">(22) 123 45 67</a></p>
          {!staffMode && <p><a href={STAFF_HASH}>Panel pracownika przychodni</a></p>}
        </div>
      </footer>
    </>
  );
}
