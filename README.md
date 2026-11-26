# System wspomagający rezerwację terminów do lekarza

## Nazwa projektu

**System wspomagający rezerwację terminów do lekarza dla nowo otwartej przychodni**

## Opis projektu

Projekt zakłada stworzenie aplikacji internetowej umożliwiającej pacjentom samodzielne wyszukiwanie i rezerwowanie terminów wizyt lekarskich.

System jest przeznaczony dla dwóch grup użytkowników: pacjentów oraz pracowników przychodni.

Pacjenci mogą przeglądać dostępnych lekarzy, wybierać specjalizacje i wolne terminy, dokonywać rezerwacji, a także zarządzać swoimi wizytami.

Pracownicy przychodni mają dostęp do dedykowanego panelu administracyjnego, który umożliwia zarządzanie harmonogramem lekarzy, obsługę rezerwacji, wysyłanie przypomnień SMS oraz przeglądanie raportów i statystyk.

Szczególny nacisk położono na prostotę obsługi oraz dostępność interfejsu dla osób starszych i osób z dysfunkcjami wzroku.

## Główne funkcjonalności

### 1. Panel pacjenta

- Przeglądanie dostępnych specjalizacji i lekarzy.
- Wyświetlanie wolnych terminów wizyt.
- Rezerwowanie wizyt lekarskich.
- Weryfikacja numeru telefonu za pomocą kodu SMS.
- Przeglądanie własnych rezerwacji.
- Anulowanie i zmiana terminu wizyty.

### 2. Panel pracownika przychodni

Panel pracownika jest dostępny po uwierzytelnieniu za pomocą kodu SMS.

**Harmonogram lekarzy (WF-10):**
- Przeglądanie harmonogramu wybranego lekarza.
- Tworzenie nowych terminów wizyt.
- Blokowanie i odblokowywanie terminów.
- Usuwanie terminów, które nie posiadają historii rezerwacji.

**Obsługa rezerwacji (WF-11):**
- Przeglądanie rezerwacji pacjentów.
- Filtrowanie wizyt.
- Rezerwowanie terminów przez pracownika, np. podczas rozmowy telefonicznej.
- Anulowanie rezerwacji.
- Przenoszenie wizyt na inne terminy.
- Oznaczanie wizyt jako odbytych lub nieodbytych.

**Przypomnienia SMS (WF-12):**
- Automatyczne przypomnienia o wizytach.
- Wysyłanie przypomnień 24 godziny przed wizytą.
- Sprawdzanie terminów przypomnień co 15 minut.
- Możliwość ręcznego uruchomienia wysyłki przypomnień przez pracownika.

**Moduł raportowania (WF-13):**
- Wyświetlanie statystyk rezerwacji.
- Filtrowanie danych według zakresu dat.
- Prezentowanie liczby wszystkich rezerwacji.
- Podział rezerwacji według statusów: aktywne, zakończone, anulowane i nieobecności.
- Zestawienie statystyk dla poszczególnych lekarzy.
- Wizualizacja danych za pomocą wykresów.
- Eksport danych do pliku CSV.

## Technologie

| Obszar | Technologie |
|---|---|
| Frontend | TypeScript, React, Vite |
| Wykresy | Chart.js, react-chartjs-2 |
| Backend | TypeScript, Node.js, Express |
| Baza danych | MySQL 8.4 |
| Sterownik bazy danych | mysql2 |
| Konteneryzacja | Docker, Docker Compose |
| Komunikacja | REST API |
| Uwierzytelnianie | JWT, weryfikacja SMS |
| Narzędzia | Git, GitHub, npm |

## Struktura projektu

```text
projekt-systemu-przychodnia/
│
├── backend/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── doctor.controller.ts
│   │   │   ├── phoneVerification.controller.ts
│   │   │   ├── reservation.controller.ts
│   │   │   ├── term.controller.ts
│   │   │   └── report.controller.ts
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── rateLimit.middleware.ts
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── doctor.routes.ts
│   │   │   ├── phoneVerification.routes.ts
│   │   │   ├── reservation.routes.ts
│   │   │   ├── term.routes.ts
│   │   │   └── report.routes.ts
│   │   │
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── phoneVerification.service.ts
│   │   │   ├── reservation.service.ts
│   │   │   └── sms.service.ts
│   │   │
│   │   ├── types/
│   │   │   └── express.d.ts
│   │   │
│   │   ├── app.ts
│   │   ├── db.ts
│   │   ├── index.ts
│   │   └── models.ts
│   │
│   ├── .env.example
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── frontend/
│   ├── public/
│   │
│   ├── src/
│   │   ├── components/
│   │   │   ├── AccessibilityBar.tsx
│   │   │   └── Stepper.tsx
│   │   │
│   │   ├── screens/
│   │   │   ├── StepConfirm.tsx
│   │   │   ├── StepPatient.tsx
│   │   │   ├── StepSpecialization.tsx
│   │   │   └── StepTerm.tsx
│   │   │
│   │   ├── staff/
│   │   │   ├── StaffApp.tsx
│   │   │   ├── StaffLogin.tsx
│   │   │   ├── ScheduleTab.tsx
│   │   │   ├── ReservationsTab.tsx
│   │   │   └── ReportsTab.tsx
│   │   │
│   │   ├── App.tsx
│   │   ├── api.ts
│   │   ├── staffApi.ts
│   │   ├── index.css
│   │   └── main.tsx
│   │
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   └── tsconfig.node.json
│
├── db/
│   ├── 01_schema.sql
│   ├── 02_seed.sql
│   ├── 03_phone_verification.sql
│   ├── 04_phone_verification_status.sql
│   ├── 05_phone_verification_purpose.sql
│   └── 06_reservation_reminder.sql
│
├── docker-compose.yml
├── .gitignore
└── README.md
```

## Wymagania

Do uruchomienia projektu wymagane są:

- Node.js (wersja LTS).
- npm.
- Docker Desktop.
- Git.

## Instalacja i konfiguracja

### 1. Pobranie projektu

```bash
git clone https://github.com/Youlik27/projekt-systemu-przychodnia.git
cd projekt-systemu-przychodnia
```

### 2. Uruchomienie bazy danych

Uruchom Docker Desktop, a następnie w głównym katalogu projektu wykonaj:

```bash
docker compose up -d
```

Baza danych MySQL zostanie uruchomiona na porcie `3307`.

Nazwa bazy danych: `przychodnia`.

Przy pierwszym uruchomieniu Docker wykonuje skrypty inicjalizacyjne znajdujące się w katalogu `db/`, jeśli baza danych jest pusta.

Główne skrypty:

- `01_schema.sql` – tworzy strukturę tabel.
- `02_seed.sql` – wprowadza przykładowe dane testowe.
- `03_phone_verification.sql` – tworzy strukturę weryfikacji telefonu.
- `04_phone_verification_status.sql` – aktualizuje statusy weryfikacji.
- `05_phone_verification_purpose.sql` – rozszerza obsługę celu weryfikacji.
- `06_reservation_reminder.sql` – tworzy tabelę przypomnień o rezerwacjach.

**Uwaga:** Jeżeli baza danych została już wcześniej utworzona, nowe skrypty SQL nie wykonają się automatycznie. W takim przypadku należy uruchomić odpowiedni skrypt ręcznie, np.:

```powershell
Get-Content .\db\06_reservation_reminder.sql | docker exec -i przychodnia-db mysql -uroot -proot przychodnia
```

Nie należy usuwać wolumenu Dockera tylko po to, aby zastosować nowy skrypt SQL.

### 3. Instalacja frontendu

```bash
cd frontend
npm install
```

### 4. Instalacja backendu

```bash
cd ../backend
npm install
```

Utwórz plik `.env` na podstawie `.env.example`:

```bash
cp .env.example .env
```

W systemie Windows można również skopiować plik ręcznie.

Uzupełnij wymagane dane konfiguracyjne zgodnie z konfiguracją backendu. Nie należy udostępniać pliku `.env` ani umieszczać go w repozytorium Git.

## Uruchomienie aplikacji

### 1. Baza danych

W głównym katalogu projektu:

```bash
docker compose up -d
```

### 2. Backend

W pierwszym terminalu:

```bash
cd backend
npm run dev
```

Backend będzie dostępny pod adresem:

http://localhost:3000

Endpoint kontrolny API:

http://localhost:3000/api/health

### 3. Frontend

W drugim terminalu:

```bash
cd frontend
npm run dev
```

Frontend będzie dostępny pod adresem:

http://localhost:5173

## Baza danych

Baza danych wykorzystuje MySQL 8.4.

Najważniejsze tabele:

- `User` – dane użytkowników i pacjentów.
- `Doctor` – dane lekarzy.
- `Terms` – dostępne terminy wizyt.
- `Reservation` – rezerwacje pacjentów.
- `ReservationReminder` – informacje dotyczące przypomnień o wizytach.

Dodatkowe tabele obsługują proces weryfikacji numerów telefonu.

### Połączenie z bazą danych przez konsolę

```bash
docker exec -it przychodnia-db mysql -uroot -proot przychodnia
```

### Połączenie przez MySQL Workbench

| Parametr | Wartość |
|---|---|
| Hostname | 127.0.0.1 |
| Port | 3307 |
| Username | root |
| Schema | przychodnia |

Hasło należy ustawić zgodnie z konfiguracją Docker Compose.

## Testowanie i analiza wyników

Testowanie systemu obejmuje weryfikację najważniejszych funkcjonalności aplikacji, w szczególności:

- Uwierzytelniania pacjentów i pracowników.
- Weryfikacji numeru telefonu.
- Rezerwowania i anulowania wizyt.
- Zarządzania harmonogramem lekarzy.
- Przenoszenia wizyt na inne terminy.
- Obsługi statusów wizyt.
- Wysyłania przypomnień SMS.
- Generowania raportów i filtrowania statystyk.

Wyniki testów powinny zostać udokumentowane w postaci tabeli zawierającej scenariusz testowy, oczekiwany rezultat, uzyskany rezultat oraz status testu.

Analiza wyników pozwala ocenić poprawność działania systemu, wykryte błędy i obszary wymagające dalszych usprawnień.

## Autorzy

- **Yelisiei Palamarchuk** – moduł raportowania, testy, analiza wyników.
- **Vladyslav Mihulov** – baza danych, model danych, integracja.
- **Maksym Nidzelskyi** – backend, API, autoryzacja.
- **Maksym Litosh** – frontend, UI/UX.

## Repozytorium

[GitHub – projekt-systemu-przychodnia](https://github.com/Youlik27/projekt-systemu-przychodnia)
