import { CLINIC_ADDRESS, formatDay, formatTime, type Term } from '../api';
import type { PatientInfo } from './StepPatient';

// Ekran 4: potwierdzenie rezerwacji (dokumentacja 4.6, WF-09).

interface Props {
  term: Term;
  patient: PatientInfo;
  onHome: () => void;
}

export default function StepConfirm({ term, patient, onHome }: Props) {
  return (
    <div className="card card--success">
      <p className="success-icon" aria-hidden="true">✓</p>
      <p className="lead">
        {patient.firstName}, czekamy na Ciebie. Przypomnimy o wizycie SMS-em.
      </p>

      <dl className="summary">
        <div><dt>Lekarz</dt><dd>dr {term.DoctorFirstName} {term.DoctorLastName} ({term.Specialization})</dd></div>
        <div><dt>Data</dt><dd>{formatDay(term.StartDate)}</dd></div>
        <div><dt>Godzina</dt><dd>{formatTime(term.StartDate)}</dd></div>
        {term.Cabinet && <div><dt>Gabinet</dt><dd>nr {term.Cabinet}</dd></div>}
        <div><dt>Adres</dt><dd>{CLINIC_ADDRESS}</dd></div>
      </dl>

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={() => window.print()}>Drukuj</button>
        <button type="button" className="btn btn--primary" onClick={onHome}>Powrót do strony głównej</button>
      </div>
    </div>
  );
}
