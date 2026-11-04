import { useEffect, useRef, useState } from 'react';
import AccessibilityBar from './components/AccessibilityBar';
import Stepper from './components/Stepper';
import StepSpecialization from './screens/StepSpecialization';
import StepTerm from './screens/StepTerm';
import StepPatient, { type PatientInfo } from './screens/StepPatient';
import StepConfirm from './screens/StepConfirm';
import { CLINIC_ADDRESS, type Term } from './api';

const TITLES = [
  'Umów wizytę do lekarza',
  'Wybierz dzień i godzinę',
  'Podaj dane i potwierdź kodem SMS',
  'Wizyta została zarezerwowana!',
];

export default function App() {
  const [step, setStep] = useState(0);
  const [specialization, setSpecialization] = useState('');
  const [term, setTerm] = useState<Term | null>(null);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [notice, setNotice] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Po zmianie kroku przenosimy fokus na nagłówek – czytnik ekranu od razu odczyta, gdzie jesteśmy.
  useEffect(() => {
    document.title = `${TITLES[step]} – Przychodnia`;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const reset = () => {
    setStep(0);
    setTerm(null);
    setPatient(null);
    setNotice('');
  };

  return (
    <>
      <a href="#main" className="skip-link">Przejdź do treści</a>
      <AccessibilityBar />

      <header className="site-header">
        <div className="container site-header__inner">
          <span className="logo" aria-hidden="true">✚</span>
          <div>
            <p className="site-header__name">Przychodnia Zdrowie</p>
            <p className="site-header__sub">Rejestracja: (22) 123 45 67 · pn–pt 8:00–18:00</p>
          </div>
        </div>
      </header>

      <main id="main" className="container">
        <Stepper current={step} />
        <h1 ref={headingRef} tabIndex={-1} className="page-title">{TITLES[step]}</h1>

        {step === 0 && (
          <StepSpecialization
            initial={specialization}
            onNext={(s) => {
              setSpecialization(s);
              setNotice('');
              setStep(1);
            }}
          />
        )}

        {step === 1 && (
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

        {step === 2 && term && (
          <StepPatient
            term={term}
            onBack={() => setStep(1)}
            onTermTaken={(msg) => {
              setNotice(msg);
              setTerm(null);
              setStep(1);
            }}
            onDone={(p) => {
              setPatient(p);
              setStep(3);
            }}
          />
        )}

        {step === 3 && term && patient && <StepConfirm term={term} patient={patient} onHome={reset} />}
      </main>

      <footer className="site-footer">
        <div className="container">
          <p>Przychodnia Zdrowie · {CLINIC_ADDRESS}</p>
          <p>Masz problem z rezerwacją? Zadzwoń: <a href="tel:+48221234567">(22) 123 45 67</a></p>
        </div>
      </footer>
    </>
  );
}
