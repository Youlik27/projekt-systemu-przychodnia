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
├── App.tsx                  # zakładki „Umów wizytę” / „Moje wizyty”, stan rezerwacji
├── api.ts                   # WSZYSTKIE zapytania do backendu + dane trybu demo
├── session.ts               # token po zalogowaniu kodem SMS (sessionStorage)
├── index.css                # style, tryb wysokiego kontrastu, wersja mobilna
├── utils/phone.ts           # normalizacja i walidacja numeru telefonu, imion
├── components/
│   ├── AccessibilityBar.tsx # wysoki kontrast + powiększenie tekstu do 200%
│   ├── Stepper.tsx          # pasek 4 kroków rezerwacji
│   ├── Field.tsx            # pole formularza z etykietą, podpowiedzią i błędem
│   └── VisitCard.tsx        # karta wizyty na liście + anulowanie
└── screens/
    ├── StepSpecialization.tsx  # krok 1: specjalizacja
    ├── StepTerm.tsx            # krok 2: dzień i godzina
    ├── StepPatient.tsx         # krok 3: dane + kod SMS (albo 1 klik, gdy zalogowany)
    ├── StepConfirm.tsx         # krok 4: potwierdzenie
    ├── MyVisits.tsx            # „Moje wizyty”: lista + anulowanie
    └── VisitsLogin.tsx         # logowanie numerem telefonu i kodem SMS
```

## Ścieżki użytkownika

**Rezerwacja (WF-01…WF-05, WF-09)**
specjalizacja → dzień i godzina → telefon, imię, nazwisko → kod SMS → potwierdzenie.
Nowy pacjent nie musi nic zakładać – jeśli numer nie ma konta, wysyłamy kod rejestracji
i konto tworzy się automatycznie. Zalogowany pacjent potwierdza rezerwację jednym przyciskiem.

**Moje wizyty (WF-06, WF-07)**
telefon → kod SMS → lista „Nadchodzące” i „Historia” → „Anuluj wizytę” → „Tak, anuluj wizytę”.
Przycisk anulowania pojawia się tylko, gdy backend zwraca `canCancel: true`
(domyślnie najpóźniej 2 godz. przed wizytą).

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

Błędy z backendu mają postać `{ success: false, message, errors? }`. `message` jest po polsku
i pokazujemy go pacjentowi; `errors` wskazuje konkretne pola formularza do poprawy.

## Zasady dostępności w kodzie

- każde pole ma `<label>`, błędy są podpięte przez `aria-describedby` i mają `role="alert"`,
- stan nigdy nie jest przekazywany tylko kolorem (ikony ✓ ⚠ ✕, podkreślenia, ramki),
- po zmianie kroku/zakładki fokus trafia na nagłówek `h1`,
- wszystkie rozmiary w `rem` – powiększenie do 200% skaluje cały układ,
- duże cele kliknięcia (min. 3rem), wyraźny fokus klawiatury.
