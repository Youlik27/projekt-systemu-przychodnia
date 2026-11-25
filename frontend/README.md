# Frontend – rejestracja wizyt

React + TypeScript + Vite. Interfejs projektowany pod osoby starsze i słabowidzące
(WCAG 2.1 AA, dokumentacja: WNF-01, WNF-02, WNF-06, WNF-07).

## Uruchomienie

```bash
npm install
npm run dev      # http://localhost:5173
```

Zapytania `/api/...` są przekazywane przez proxy Vite do backendu na `http://localhost:3000`
(`vite.config.ts`). Jeśli backend nie działa, aplikacja przechodzi w **tryb demonstracyjny**
(baner na górze strony, kod SMS: `1234`, pacjent testowy: `600 100 200`).

Inne polecenia: `npm run build` (sprawdzenie typów + build), `npm run lint` (oxlint).

## Struktura

```text
src/
├── main.tsx                 # punkt wejścia
├── App.tsx                  # zakładki „Umów wizytę” / „Moje wizyty”, panel pracownika (#pracownik)
├── api.ts                   # zapytania pacjenta do backendu + dane trybu demo
├── staffApi.ts              # zapytania panelu pracownika (/api/staff/...)
├── session.ts               # tokeny po zalogowaniu kodem SMS – osobno pacjent i pracownik
├── index.css                # style, tryb wysokiego kontrastu, wersja mobilna
├── utils/phone.ts           # normalizacja i walidacja numeru telefonu, imion
├── components/
│   ├── AccessibilityBar.tsx # wysoki kontrast + powiększenie tekstu do 200%
│   ├── Stepper.tsx          # pasek 4 kroków rezerwacji
│   ├── Field.tsx            # pole formularza z etykietą, podpowiedzią i błędem
│   ├── VisitCard.tsx        # karta wizyty na liście + anulowanie / zmiana terminu
│   ├── TermPicker.tsx       # kafelki dni + przyciski godzin (rezerwacja i zmiana terminu)
│   └── RescheduleVisit.tsx  # wybór nowego terminu z potwierdzeniem (pacjent i pracownik)
└── screens/
    ├── StepSpecialization.tsx  # krok 1: specjalizacja
    ├── StepTerm.tsx            # krok 2: dzień i godzina
    ├── StepPatient.tsx         # krok 3: dane + kod SMS (albo 1 klik, gdy zalogowany)
    ├── StepConfirm.tsx         # krok 4: potwierdzenie
    ├── MyVisits.tsx            # „Moje wizyty”: lista + anulowanie
    └── VisitsLogin.tsx         # logowanie numerem telefonu i kodem SMS
└── staff/                      # panel pracownika przychodni
    ├── StaffApp.tsx            # logowanie / zakładki Harmonogram i Rezerwacje, przypomnienia SMS
    ├── StaffLogin.tsx          # logowanie kodem SMS z rolą "staff"
    ├── ScheduleTab.tsx         # harmonogram lekarza: terminy, blokady, zapis pacjenta
    ├── AddTermsForm.tsx        # dodawanie terminów (zakres dni, godziny, długość wizyty)
    ├── BookPatientForm.tsx     # zapis pacjenta przez rejestrację
    ├── ReservationsTab.tsx     # lista rezerwacji z filtrami
    ├── ReservationActions.tsx  # przenieś / anuluj / odbyta / nieobecność
    └── labels.ts               # nazwy i ikony statusów
```

## Ścieżki użytkownika

**Rezerwacja (WF-01…WF-05, WF-09)**
specjalizacja → dzień i godzina → telefon, imię, nazwisko → kod SMS → potwierdzenie.
Nowy pacjent nie musi nic zakładać – jeśli numer nie ma konta, wysyłamy kod rejestracji
i konto tworzy się automatycznie. Zalogowany pacjent potwierdza rezerwację jednym przyciskiem.

**Moje wizyty (WF-06, WF-07, WF-08)**
telefon → kod SMS → lista „Nadchodzące” i „Historia” → „Zmień termin” albo „Anuluj wizytę”.
Przyciski pojawiają się tylko, gdy backend zwraca `canCancel: true`
(domyślnie najpóźniej 2 godz. przed wizytą). Nowy termin wybiera się spośród wolnych terminów
tej samej specjalizacji; numer rezerwacji się nie zmienia.

**Panel pracownika (WF-10, WF-11, WF-12)** – adres `http://localhost:5173/#pracownik`
(link „Panel pracownika przychodni” w stopce). Logowanie numerem telefonu pracownika i kodem SMS;
konto testowe z `db/02_seed.sql`: **500 000 001** (Ewa Lewandowska), kod pojawia się w terminalu backendu.
- **Harmonogram:** wybór lekarza i dnia / 7 dni; przy terminie: zapisz pacjenta, zablokuj / odblokuj, usuń;
  przy wizycie: dane pacjenta, przenieś, anuluj, a po jej rozpoczęciu „Odbyta” / „Nieobecność”;
  „Dodaj terminy” tworzy sloty dla zakresu dni.
- **Rezerwacje:** filtry (daty, lekarz, status, pacjent) i te same akcje co w harmonogramie.
- **Wyślij przypomnienia SMS:** ręczne uruchomienie przypomnień (normalnie backend robi to sam).

Panel nie ma trybu demo – bez backendu pokazuje komunikat, że wymaga serwera.

## Używane endpointy

| Metoda | Ścieżka | Do czego |
|---|---|---|
| GET | `/api/specializations` | lista specjalizacji |
| GET | `/api/terms?specialization=X` | wolne terminy |
| POST | `/api/phone-verification/send` | wysłanie kodu SMS (`login` / `register`) |
| POST | `/api/phone-verification/verify` | weryfikacja kodu (przy `login` zwraca token) |
| POST | `/api/auth/register` | założenie konta (imię, nazwisko, telefon) |
| POST | `/api/reservations` | rezerwacja – zwraca dane do potwierdzenia |
| GET | `/api/reservations/me` | moje wizyty |
| PATCH | `/api/reservations/:id/cancel` | anulowanie wizyty |
| PATCH | `/api/reservations/:id/reschedule` | zmiana terminu wizyty |
| GET | `/api/staff/doctors`, `/api/staff/schedule` | panel: lekarze i harmonogram |
| POST / PATCH / DELETE | `/api/staff/terms[/:id]` | panel: dodanie, blokada, usunięcie terminów |
| GET / POST | `/api/staff/reservations` | panel: lista rezerwacji, zapis pacjenta |
| PATCH | `/api/staff/reservations/:id/cancel` · `/reschedule` · `/status` | panel: obsługa wizyty |
| POST | `/api/staff/reminders/run` | panel: przypomnienia SMS |

Błędy z backendu mają postać `{ success: false, message, errors? }`. `message` jest po polsku
i pokazujemy go pacjentowi; `errors` wskazuje konkretne pola formularza do poprawy.

## Zasady dostępności w kodzie

- każde pole ma `<label>`, błędy są podpięte przez `aria-describedby` i mają `role="alert"`,
- stan nigdy nie jest przekazywany tylko kolorem (ikony ✓ ⚠ ✕, podkreślenia, ramki),
- po zmianie kroku/zakładki fokus trafia na nagłówek `h1`,
- wszystkie rozmiary w `rem` – powiększenie do 200% skaluje cały układ,
- duże cele kliknięcia (min. 3rem), wyraźny fokus klawiatury.
