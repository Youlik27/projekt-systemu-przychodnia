-- WF-12: przypomnienia SMS o wizytach (moduł powiadomień, dokumentacja 4.2).
-- Zapamiętujemy, dla której rezerwacji i którego TERMINU wysłano już przypomnienie.
-- Klucz (ReservationID, TermID): po zmianie terminu wizyty (WF-08) przypomnienie
-- zostanie wysłane ponownie – już dla nowego terminu.
--
-- Uwaga: Docker wykonuje pliki z db/ tylko przy PIERWSZYM uruchomieniu bazy.
-- Dla istniejącej bazy: docker compose down -v && docker compose up -d
-- albo ręcznie: docker exec -i przychodnia-db mysql -uroot -proot przychodnia < db/06_reservation_reminder.sql

CREATE TABLE ReservationReminder (
  ReservationID INT      NOT NULL,
  TermID        INT      NOT NULL,
  SentAt        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (ReservationID, TermID),
  CONSTRAINT fk_reminder_reservation FOREIGN KEY (ReservationID)
    REFERENCES Reservation (ID) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
