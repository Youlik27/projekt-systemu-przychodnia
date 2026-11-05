# Projekt systemu przychodni

## Nazwa projektu

**System wspomagający rezerwację terminów do lekarza dla nowo otwartej przychodni**

## Struktura projektu

```text
projekt-systemu-przychodnia/
│
├── backend/
│   ├── src/
│   │   ├── controllers/          # Obsługa żądań HTTP
│   │   │   ├── auth.controller.ts
│   │   │   ├── doctor.controller.ts
│   │   │   ├── phoneVerification.controller.ts
│   │   │   ├── reservation.controller.ts
│   │   │   └── term.controller.ts
│   │   │
│   │   ├── middleware/           # Autoryzacja i ograniczanie żądań
│   │   │   ├── auth.middleware.ts
│   │   │   └── rateLimit.middleware.ts
│   │   │
│   │   ├── routes/               # Endpointy API
│   │   │   ├── auth.routes.ts
│   │   │   ├── doctor.routes.ts
│   │   │   ├── phoneVerification.routes.ts
│   │   │   ├── reservation.routes.ts
│   │   │   └── term.routes.ts
│   │   │
│   │   ├── services/             # Logika biznesowa
│   │   │   ├── auth.service.ts
│   │   │   ├── phoneVerification.service.ts
│   │   │   ├── reservation.service.ts
│   │   │   └── sms.service.ts
│   │   │
│   │   ├── types/                # Dodatkowe typy TypeScript
│   │   │   └── express.d.ts
│   │   │
│   │   ├── db.ts                 # Połączenie z bazą danych
│   │   ├── index.ts              # Główny plik backendu
│   │   └── models.ts             # Modele danych
│   │
│   ├── .env.example              # Przykładowa konfiguracja
│   ├── package.json
│   ├── package-lock.json
│   └── tsconfig.json
│
├── frontend/
│   ├── public/                   # Pliki statyczne
│   │
│   ├── src/
│   │   ├── components/           # Komponenty interfejsu
│   │   │   ├── AccessibilityBar.tsx
│   │   │   └── Stepper.tsx
│   │   │
│   │   ├── screens/              # Etapy rezerwacji wizyty
│   │   │   ├── StepConfirm.tsx
│   │   │   ├── StepPatient.tsx
│   │   │   ├── StepSpecialization.tsx
│   │   │   └── StepTerm.tsx
│   │   │
│   │   ├── App.tsx               # Główny komponent aplikacji
│   │   ├── api.ts                # Komunikacja z backendem
│   │   ├── index.css              # Style aplikacji
│   │   └── main.tsx               # Punkt wejścia frontendu
│   │
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tsconfig.app.json
│   └── tsconfig.node.json
│
├── db/                            # Skrypty SQL
│   ├── 01_schema.sql              # Struktura bazy danych
│   ├── 02_seed.sql                # Dane testowe
│   ├── 03_phone_verification.sql  # Tabela weryfikacji telefonu
│   ├── 04_phone_verification_status.sql
│   └── 05_phone_verification_purpose.sql
│
├── docker-compose.yml              # Konfiguracja Docker
├── .gitignore
└── README.md
```

## Opis projektu

Projekt zakłada stworzenie aplikacji internetowej umożliwiającej pacjentom samodzielne wyszukiwanie i rezerwowanie terminów wizyt lekarskich.

System jest przeznaczony dla pacjentów oraz pracowników przychodni. Pacjenci będą mogli przeglądać dostępnych lekarzy, wybierać specjalizacje i wolne terminy oraz dokonywać rezerwacji. Pracownicy przychodni będą mogli przeglądać rezerwacje i zarządzać harmonogramem wizyt.

Szczególny nacisk położono na prostotę obsługi oraz dostępność interfejsu dla osób starszych i osób z dysfunkcjami wzroku.

## Technologie

- **Frontend:** TypeScript, React, Vite, Chart.js
- **Backend:** TypeScript, Node.js, Express
- **Baza danych:** MySQL 8.4
- **Sterownik bazy danych:** mysql2
- **Konteneryzacja:** Docker, Docker Compose
- **Narzędzia:** Git, GitHub, npm

## Wymagania

Do uruchomienia projektu wymagane są:

- Node.js (wersja LTS)
- npm
- Docker Desktop
- Git

## Instalacja

### 1. Pobranie projektu

Sklonuj repozytorium:

```bash
git clone https://github.com/Youlik27/projekt-systemu-przychodnia.git
```

Przejdź do katalogu projektu:

```bash
cd projekt-systemu-przychodnia
```

### 2. Instalacja i konfiguracja bazy danych

Uruchom Docker Desktop, a następnie wykonaj:

```bash
docker compose up -d
```

Baza danych MySQL zostanie uruchomiona na porcie `3307`. Nazwa bazy danych: `przychodnia`.

Przy pierwszym uruchomieniu Docker automatycznie wykona skrypty SQL znajdujące się w katalogu `db/`:

- [`db/01_schema.sql`](https://github.com/Youlik27/projekt-systemu-przychodnia/blob/main/db/01_schema.sql) – tworzy strukturę tabel: `User`, `Doctor`, `Terms`, `Reservation`.
- [`db/02_seed.sql`](https://github.com/Youlik27/projekt-systemu-przychodnia/blob/main/db/02_seed.sql) – wprowadza przykładowe dane testowe.

### 3. Instalacja frontendu

Przejdź do katalogu frontend:

```bash
cd frontend
```

Zainstaluj zależności:

```bash
npm install
```

### 4. Instalacja backendu

Przejdź do katalogu backend:

```bash
cd ../backend
```

Zainstaluj zależności:

```bash
npm install
```

Utwórz plik `.env` na podstawie pliku przykładowego:

```bash
cp .env.example .env
```

W razie potrzeby uzupełnij dane konfiguracyjne w pliku `.env`.

## Uruchomienie

### 1. Uruchomienie bazy danych

W głównym katalogu projektu wykonaj:

```bash
docker compose up -d
```

### 2. Uruchomienie backendu

W terminalu:

```bash
cd backend
npm run dev
```

Backend będzie dostępny pod adresem:

[http://localhost:3000](http://localhost:3000)

Endpoint kontrolny API:

[http://localhost:3000/api/health](http://localhost:3000/api/health)

### 3. Uruchomienie frontendu

W drugim terminalu:

```bash
cd frontend
npm run dev
```

Frontend będzie dostępny pod adresem:

[http://localhost:5173](http://localhost:5173)

## Dodatkowe informacje

### Podgląd bazy danych

Aby połączyć się z bazą danych z poziomu konsoli:

```bash
docker exec -it przychodnia-db mysql -uroot -proot przychodnia
```

### Odtworzenie bazy danych

Pliki SQL z katalogu `db/` są wykonywane automatycznie tylko przy pierwszym uruchomieniu, gdy baza danych jest pusta.

W przypadku zmian w strukturze bazy danych można ją odtworzyć za pomocą:

```bash
docker compose down -v
docker compose up -d
```

**Uwaga:** polecenie `docker compose down -v` usuwa bazę danych wraz z zapisanymi danymi.

## Autorzy

- Yelisiei Palamarchuk – moduł raportowania, testy, analiza wyników
- Vladyslav Mihulov – baza danych, model danych, integracja
- Maksym Nidzelskyi – backend, API, autoryzacja
- Maksym Litosh – frontend, UI/UX
