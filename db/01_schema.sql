-- Schemat bazy danych systemu rezerwacji wizyt (dokumentacja, rozdział 4.5).
-- 4 tabele: User, Doctor, Terms, Reservation.
-- Plik jest wykonywany automatycznie przez Dockera przy PIERWSZYM uruchomieniu bazy.

SET NAMES utf8mb4;

CREATE TABLE `User` (
  ID          INT          NOT NULL AUTO_INCREMENT,
  FirstName   VARCHAR(255) NOT NULL,
  LastName    VARCHAR(255) NOT NULL,
  Address     VARCHAR(255) NULL,
  BirthDate   DATE         NULL,
  PhoneNumber VARCHAR(20)  NOT NULL,                         
  Role        ENUM('patient', 'staff') NOT NULL DEFAULT 'patient',

  PRIMARY KEY (ID),
  UNIQUE KEY uq_user_phone (PhoneNumber)                     
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE Doctor (
  ID             INT          NOT NULL AUTO_INCREMENT,
  FirstName      VARCHAR(255) NOT NULL,
  LastName       VARCHAR(255) NOT NULL,
  IsActive       BOOLEAN      NOT NULL DEFAULT TRUE,
  Specialization VARCHAR(255) NOT NULL,

  PRIMARY KEY (ID),
  KEY idx_doctor_specialization (Specialization)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE Terms (
  TermID    INT         NOT NULL AUTO_INCREMENT,
  StartDate DATETIME    NOT NULL,
  EndDate   DATETIME    NOT NULL,
  Status    ENUM('free', 'reserved', 'blocked') NOT NULL DEFAULT 'free',
  Cabinet   VARCHAR(20) NULL,
  DoctorID  INT         NOT NULL,

  PRIMARY KEY (TermID),
  UNIQUE KEY uq_terms_term_doctor (TermID, DoctorID),        
  UNIQUE KEY uq_terms_doctor_start (DoctorID, StartDate),     
  KEY idx_terms_status_start (Status, StartDate),  
  CONSTRAINT chk_terms_dates
  CHECK (EndDate > StartDate),           
  CONSTRAINT fk_terms_doctor FOREIGN KEY (DoctorID) REFERENCES Doctor (ID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE Reservation (
  ID            INT       NOT NULL AUTO_INCREMENT,
  CreatedAt     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Status        ENUM('active', 'cancelled', 'completed', 'no_show') NOT NULL DEFAULT 'active',
  UserID        INT       NOT NULL,
  TermsTermID   INT       NOT NULL,
  TermsDoctorID INT       NOT NULL,

  PRIMARY KEY (ID),
  CONSTRAINT fk_reservation_user FOREIGN KEY (UserID) REFERENCES `User` (ID),
  CONSTRAINT fk_reservation_term FOREIGN KEY (TermsTermID, TermsDoctorID)
    REFERENCES Terms (TermID, DoctorID)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
