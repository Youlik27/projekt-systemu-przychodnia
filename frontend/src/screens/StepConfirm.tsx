import { formatDay, formatTime, type Reservation } from '../api';

// =====================================================================
// Ekran 4: potwierdzenie rezerwacji (dokumentacja 4.6, WF-09, scenariusz 4.4 krok 12).
//
// Wszystkie dane (lekarz, data, godzina, gabinet, adres) pochodzą z ODPOWIEDZI
// BACKENDU po zapisaniu rezerwacji – pacjent widzi to, co naprawdę zapisano w bazie.
// =====================================================================

interface Props {
  reservation: Reservation;
  /** Imię do powitania – może nie być znane (np. po logowaniu w „Moje wizyty”) */
  firstName?: string;
  onHome: () => void;
  onShowVisits: () => void;
}

export default function StepConfirm({ reservation, firstName, onHome, onShowVisits }: Props) {
  const { doctor } = reservation;

  return (
    <div className="card card--success">
      <p className="success-icon" aria-hidden="true">✓</p>
      <p className="lead">
        {firstName ? `${firstName}, czekamy na Ciebie.` : 'Czekamy na Ciebie.'} Swoje wizyty możesz zawsze
        sprawdzić lub anulować w zakładce „Moje wizyty”.
      </p>

      {/* <dl> – lista „nazwa: wartość”, czytniki ekranu odczytują ją w parach */}
      <dl className="summary">
        <div><dt>Lekarz</dt><dd>dr {doctor.firstName} {doctor.lastName} ({doctor.specialization})</dd></div>
        <div><dt>Data</dt><dd>{formatDay(reservation.startDate)}</dd></div>
        <div><dt>Godzina</dt><dd>{formatTime(reservation.startDate)}</dd></div>
        {reservation.cabinet && <div><dt>Gabinet</dt><dd>nr {reservation.cabinet}</dd></div>}
        <div><dt>Adres</dt><dd>{reservation.clinicAddress}</dd></div>
        <div><dt>Nr rezerwacji</dt><dd>{reservation.id}</dd></div>
      </dl>

      <div className="actions">
        <button type="button" className="btn btn--secondary" onClick={() => window.print()}>Drukuj</button>
        <button type="button" className="btn btn--secondary" onClick={onShowVisits}>Moje wizyty</button>
        <button type="button" className="btn btn--primary" onClick={onHome}>Powrót do strony głównej</button>
      </div>
    </div>
  );
}
