# Backend – API systemu rezerwacji wizyt

Node.js + Express 5 + TypeScript, baza MySQL 8.4 (`docker-compose.yml`).

## Uruchomienie

```bash
docker compose up -d          # w katalogu głównym projektu
cd backend
cp .env.example .env          # i ustaw losowe OTP_SECRET oraz JWT_SECRET
npm install
npm run dev                   # http://localhost:3000
```

Kody SMS w trybie deweloperskim (`SMS_PROVIDER=console`) są wypisywane w terminalu backendu.

### Migracja bazy (przypomnienia SMS)

Plik `db/06_reservation_reminder.sql` dodaje tabelę `ReservationReminder` (WF-12).
Docker wykonuje pliki z `db/` tylko przy pierwszym uruchomieniu bazy, więc dla istniejącej bazy:

```bash
docker exec -i przychodnia-db mysql -uroot -proot przychodnia < db/06_reservation_reminder.sql
```

albo od zera (usuwa dane): `docker compose down -v && docker compose up -d`.
Bez tej tabeli działa wszystko poza przypomnieniami.

## Testy

```bash
npm test         # scenariusze poprawne i błędne dla wszystkich wymagań
npm run typecheck
```

Testy integracyjne wymagają działającej bazy z danymi z `db/02_seed.sql` – bez bazy są pomijane
(działają wtedy tylko testy walidacji i uprawnień). Testy sprzątają po sobie: numery `+48999…`
i terminy z gabinetem `TEST-AUTO`.

## Struktura

```text
src/
├── index.ts            # start serwera + harmonogram przypomnień SMS
├── app.ts              # konfiguracja Express (trasy, obsługa błędów)
├── config.ts           # ustawienia z .env (z walidacją)
├── db.ts               # pula połączeń MySQL
├── models.ts           # typy odpowiadające tabelom
├── routes/             # adresy endpointów i wymagane role
├── controllers/        # walidacja wejścia, format odpowiedzi
├── services/           # logika biznesowa i SQL (transakcje)
│   ├── reservation.service.ts   # rezerwacje: pacjent + pracownik (WF-03, 06, 07, 08, 11)
│   ├── schedule.service.ts      # harmonogram lekarzy (WF-10)
│   ├── reminder.service.ts      # przypomnienia SMS (WF-12)
│   ├── notification.service.ts  # treść SMS-ów do pacjentów
│   ├── phoneVerification.service.ts  # kody SMS (WF-05, WNF-04)
│   ├── auth.service.ts          # JWT, rejestracja (WF-04)
│   └── sms.service.ts           # bramka SMS (console / smsapi)
├── middleware/         # autoryzacja (JWT + role), limity, obsługa błędów
└── utils/              # walidacja danych, klasy błędów
```

## Role i logowanie

Bez haseł: numer telefonu + jednorazowy kod SMS (WF-05). Token JWT trzeba wysyłać w nagłówku
`Authorization: Bearer <token>`.

| Rola | Jak się zalogować | Dostęp |
|---|---|---|
| pacjent | `/phone-verification/send` + `/verify` z `purpose: "login"` | `/api/reservations/*` |
| pracownik | to samo + `"role": "staff"` | `/api/staff/*` |

Konto pacjenta zakłada się samo przy pierwszej rezerwacji (WF-04). Konta pracowników są w bazie
(seed: Ewa Lewandowska, `+48500000001`) – nie można ich zarejestrować przez API.

## Endpointy

Wszystkie odpowiedzi błędów: `{ success: false, message, errors? }` – `message` po polsku do pokazania
użytkownikowi, `errors` wskazuje pola formularza do poprawy (UC.B02). Problem z bazą → `503`
z ogólnym komunikatem (UC.B01).

### Publiczne

| Metoda | Ścieżka | Opis | Wymaganie |
|---|---|---|---|
| GET | `/api/health` | czy serwer działa | – |
| GET | `/api/specializations` | lista specjalizacji | WF-01 |
| GET | `/api/doctors?specialization=` | aktywni lekarze | WF-01 |
| GET | `/api/terms?specialization=&doctorId=&date=` | wolne terminy | WF-02 |
| POST | `/api/phone-verification/send` | `{ phoneNumber, purpose, role? }` – wysłanie kodu SMS | WF-05 |
| POST | `/api/phone-verification/verify` | `{ phoneNumber, code, purpose, role? }` – przy `login` zwraca token | WF-05 |
| POST | `/api/auth/register` | `{ firstName, lastName, phoneNumber }` po weryfikacji `register` | WF-04 |
| GET | `/api/auth/me` | dane zalogowanego (token) | – |

### Pacjent (rola `patient`)

| Metoda | Ścieżka | Opis | Wymaganie |
|---|---|---|---|
| POST | `/api/reservations` | `{ termId }` – rezerwacja, zwraca dane potwierdzenia | WF-03, WF-09 |
| GET | `/api/reservations/me` | moje wizyty (nadchodzące, potem historia) | WF-06 |
| GET | `/api/reservations/:id` | szczegóły mojej wizyty | WF-06 |
| PATCH | `/api/reservations/:id/cancel` | anulowanie | WF-07 |
| PATCH | `/api/reservations/:id/reschedule` | `{ termId }` – zmiana terminu | WF-08 |

Zasady przychodni: pacjent może anulować lub przenieść wizytę najpóźniej `CANCEL_DEADLINE_HOURS`
(domyślnie 2) godziny przed nią – pole `canCancel` w odpowiedzi. Przeniesienie: ta sama specjalizacja,
numer rezerwacji się nie zmienia, stary termin wraca do puli wolnych.

### Pracownik przychodni (rola `staff`)

| Metoda | Ścieżka | Opis | Wymaganie |
|---|---|---|---|
| GET | `/api/staff/doctors` | wszyscy lekarze (także nieaktywni) | WF-10 |
| GET | `/api/staff/schedule?doctorId=&from=&to=` | harmonogram lekarza z pacjentami (maks. 31 dni) | WF-10 |
| POST | `/api/staff/terms` | dodanie terminów – patrz niżej | WF-10 |
| PATCH | `/api/staff/terms/:id` | `{ status: "blocked" \| "free" }` – blokada / odblokowanie | WF-10 |
| DELETE | `/api/staff/terms/:id` | usunięcie terminu bez historii rezerwacji | WF-10 |
| GET | `/api/staff/reservations?from=&to=&doctorId=&status=&patient=` | lista rezerwacji (`patient` = fragment telefonu lub nazwiska) | WF-11 |
| GET | `/api/staff/reservations/:id` | szczegóły z danymi pacjenta | WF-11 |
| POST | `/api/staff/reservations` | `{ termId, phoneNumber, firstName, lastName }` – zapis pacjenta przez rejestrację (konto tworzy się samo) | WF-11, WF-04 |
| PATCH | `/api/staff/reservations/:id/cancel` | anulowanie (pacjent dostaje SMS) | WF-11 |
| PATCH | `/api/staff/reservations/:id/reschedule` | `{ termId }` – przeniesienie (pacjent dostaje SMS) | WF-11 |
| PATCH | `/api/staff/reservations/:id/status` | `{ status: "completed" \| "no_show" }` – po rozpoczęciu wizyty | WF-11 |
| POST | `/api/staff/reminders/run` | ręczne wysłanie zaległych przypomnień | WF-12 |

Dodawanie terminów (`POST /api/staff/terms`):

```json
{
  "doctorId": 2,
  "dateFrom": "2026-12-01",
  "dateTo": "2026-12-05",
  "startTime": "09:00",
  "endTime": "12:00",
  "slotMinutes": 30,
  "cabinet": "2",
  "skipWeekends": true
}
```

Terminy kolidujące z istniejącymi (ten sam lekarz lub zajęty gabinet) i terminy z przeszłości są
pomijane – odpowiedź zawiera listy `created` i `skipped` (z powodem).

Kryterium WF-10: zarezerwowanego terminu nie można zablokować ani usunąć (`409`) – najpierw trzeba
anulować lub przenieść rezerwację.

## Przypomnienia SMS (WF-12)

Co `REMINDER_INTERVAL_MINUTES` minut backend wysyła SMS do pacjentów, których aktywna wizyta zaczyna
się w ciągu `REMINDER_HOURS_BEFORE` godzin. Każde przypomnienie wysyłane jest raz na termin
(po zmianie terminu – ponownie, z nową datą). Wyłączenie: `REMINDERS_ENABLED=false`.

## Pokrycie wymagań z dokumentacji

| Wymaganie | Gdzie |
|---|---|
| WF-01…WF-03, WF-09 | `doctor`, `term`, `reservation` |
| WF-04, WF-05 | `auth`, `phoneVerification` |
| WF-06, WF-07, WF-08 | `/api/reservations/*` |
| WF-10, WF-11 | `/api/staff/*` |
| WF-12 (COULD) | `reminder.service.ts` |
| WNF-03 role | `requireRole` w `routes/` |
| WNF-04 kody SMS | ważność 5 min, jednorazowe, max 5 prób, limity żądań |
| WNF-05 wydajność | filtrowanie w SQL, indeksy z `01_schema.sql` |
| UC.B01, UC.B02, UC.B03 | `utils/errors.ts`, pola `errors`, `503` przy błędzie bramki SMS |
