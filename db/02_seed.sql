-- Dane testowe do lokalnego developmentu.
-- Wykonywane automatycznie przez Dockera po 01_schema.sql (tylko przy pierwszym uruchomieniu bazy).
-- Daty są liczone względem dnia uruchomienia, więc terminy zawsze są "w przyszłości".

SET NAMES utf8mb4;


INSERT INTO Doctor (ID, FirstName, LastName, Specialization, IsActive) VALUES
  (1, 'Anna',      'Kowalska',   'Internista', TRUE),
  (2, 'Piotr',     'Nowak',      'Kardiolog',  TRUE),
  (3, 'Katarzyna', 'Wiśniewska', 'Pediatra',   TRUE),
  (4, 'Tomasz',    'Wójcik',     'Dermatolog', TRUE),
  (5, 'Marek',     'Zieliński',  'Okulista',   FALSE);  


INSERT INTO `User` (ID, FirstName, LastName, PhoneNumber, Address, BirthDate, Role) VALUES
  (1, 'Ewa',   'Lewandowska', '+48500000001', NULL,                       NULL,         'staff'),
  (2, 'Jan',   'Kamiński',    '+48600100200', 'ul. Kwiatowa 5, Warszawa', '1948-04-12', 'patient'),
  (3, 'Maria', 'Dąbrowska',   '+48600300400', NULL,                       '1955-09-30', 'patient');

INSERT INTO Terms (StartDate, EndDate, Status, Cabinet, DoctorID)
WITH RECURSIVE
  days AS (
    SELECT CURDATE() + INTERVAL 1 DAY AS d, 1 AS n
    UNION ALL
    SELECT d + INTERVAL 1 DAY, n + 1 FROM days WHERE n < 14
  ),
  work_days AS (
    SELECT d FROM days WHERE DAYOFWEEK(d) NOT IN (1, 7) ORDER BY d LIMIT 5   -- bez sobót i niedziel
  ),
  slots AS (
    SELECT 0 AS m
    UNION ALL
    SELECT m + 30 FROM slots WHERE m < 150                                 -- 9:00, 9:30, ..., 11:30
  ),
  doctors AS (
    SELECT 1 AS id, '1' AS cabinet UNION ALL
    SELECT 2, '2'  UNION ALL
    SELECT 3, '3A' UNION ALL
    SELECT 4, '3B'
  )
SELECT
  TIMESTAMP(w.d) + INTERVAL 9 HOUR + INTERVAL s.m MINUTE,
  TIMESTAMP(w.d) + INTERVAL 9 HOUR + INTERVAL (s.m + 30) MINUTE,
  'free',
  doc.cabinet,
  doc.id
FROM work_days w
CROSS JOIN slots s
CROSS JOIN doctors doc;




SELECT TermID, DoctorID INTO @t1, @d1 FROM Terms ORDER BY StartDate, DoctorID LIMIT 1;
UPDATE Terms SET Status = 'reserved' WHERE TermID = @t1;
INSERT INTO Reservation (Status, UserID, TermsTermID, TermsDoctorID) VALUES ('active', 2, @t1, @d1);


SELECT TermID, DoctorID INTO @t2, @d2 FROM Terms ORDER BY StartDate, DoctorID LIMIT 1 OFFSET 1;
INSERT INTO Reservation (Status, UserID, TermsTermID, TermsDoctorID) VALUES ('cancelled', 3, @t2, @d2);

SELECT TermID INTO @t3 FROM Terms ORDER BY StartDate, DoctorID LIMIT 1 OFFSET 2;
UPDATE Terms SET Status = 'blocked' WHERE TermID = @t3;


INSERT INTO Terms (StartDate, EndDate, Status, Cabinet, DoctorID) VALUES
  (TIMESTAMP(CURDATE() - INTERVAL 1 DAY) + INTERVAL 10 HOUR,
   TIMESTAMP(CURDATE() - INTERVAL 1 DAY) + INTERVAL 10 HOUR + INTERVAL 30 MINUTE, 'reserved', '1', 1);
INSERT INTO Reservation (Status, UserID, TermsTermID, TermsDoctorID) VALUES ('completed', 2, LAST_INSERT_ID(), 1);

INSERT INTO Terms (StartDate, EndDate, Status, Cabinet, DoctorID) VALUES
  (TIMESTAMP(CURDATE() - INTERVAL 1 DAY) + INTERVAL 11 HOUR,
   TIMESTAMP(CURDATE() - INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 30 MINUTE, 'reserved', '1', 1);
INSERT INTO Reservation (Status, UserID, TermsTermID, TermsDoctorID) VALUES ('no_show', 3, LAST_INSERT_ID(), 1);
