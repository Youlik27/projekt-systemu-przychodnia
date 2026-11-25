// Testy scenariuszy użytkownika (zajęcia 6, punkt 6):
//  - użytkownik wykonuje operację poprawnie → system reaguje prawidłowo,
//  - użytkownik podaje błędne dane → system odpowiednio obsługuje błąd.
//
// Uruchomienie: docker compose up -d, a następnie w katalogu backend: npm test
// Testy wymagające bazy są pomijane, jeśli MySQL nie jest dostępny.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  cleanupTestData,
  isDatabaseAvailable,
  pool,
  randomTestPhone,
  seedVerificationCode,
  startServer,
  type TestServer
} from "./helpers.js";

let server: TestServer;
let dbAvailable = false;

before(async () => {
  server = await startServer();
  dbAvailable = await isDatabaseAvailable();

  if (dbAvailable) {
    await cleanupTestData();
  } else {
    console.warn(
      "⚠ Baza danych niedostępna – testy integracyjne zostaną pominięte. Uruchom: docker compose up -d"
    );
  }
});

after(async () => {
  if (dbAvailable) {
    await cleanupTestData();
  }

  await server.close();
  await pool.end();
});

const call = (path: string, options?: Parameters<typeof api>[2]) =>
  api(server.baseUrl, path, options);

// ---------------------------------------------------------------------------
// Testy niewymagające bazy danych
// ---------------------------------------------------------------------------
describe("Podstawy API", () => {
  test("health check zwraca status ok", async () => {
    const res = await call("/health");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });

  test("nieznany endpoint zwraca 404 w formacie JSON", async () => {
    const res = await call("/nie-istnieje");
    assert.equal(res.status, 404);
    assert.equal(res.body.success, false);
  });

  test("niepoprawny JSON zwraca 400 w formacie JSON", async () => {
    const res = await call("/phone-verification/send", {
      method: "POST",
      rawBody: "{to nie jest json"
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});

describe("Walidacja danych wejściowych (UC.B02)", () => {
  test("wysyłka kodu na nieprawidłowy numer → 400 z błędem pola", async () => {
    const res = await call("/phone-verification/send", {
      method: "POST",
      body: { phoneNumber: "123", purpose: "login" }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.phoneNumber);
  });

  test("weryfikacja kodu o złej długości → 400", async () => {
    const res = await call("/phone-verification/verify", {
      method: "POST",
      body: { phoneNumber: "+48600100200", code: "1", purpose: "login" }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.code);
  });

  test("rejestracja bez imienia i z błędnym telefonem → 400 ze wskazaniem pól", async () => {
    const res = await call("/auth/register", {
      method: "POST",
      body: { firstName: "", lastName: "Kowalski", phoneNumber: "abc" }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.firstName);
    assert.ok(res.body.errors.phoneNumber);
    assert.equal(res.body.errors.lastName, undefined);
  });

  test("rejestracja z datą urodzenia w przyszłości → 400", async () => {
    const res = await call("/auth/register", {
      method: "POST",
      body: {
        firstName: "Jan",
        lastName: "Test",
        phoneNumber: "+48999000000",
        birthDate: "2999-01-01"
      }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.birthDate);
  });

  test("terminy z nieprawidłową datą → 400", async () => {
    const res = await call("/terms?date=2026-02-30");
    assert.equal(res.status, 400);
  });

  test("rezerwacja bez tokenu → 401", async () => {
    const res = await call("/reservations", {
      method: "POST",
      body: { termId: 1 }
    });
    assert.equal(res.status, 401);
  });

  test("rezerwacja z nieprawidłowym tokenem → 401", async () => {
    const res = await call("/reservations/me", { token: "zly.token.jwt" });
    assert.equal(res.status, 401);
  });
});

// ---------------------------------------------------------------------------
// Testy integracyjne z bazą danych – pełna ścieżka pacjenta
// ---------------------------------------------------------------------------
describe("Ścieżka pacjenta: rejestracja → rezerwacja → moje wizyty → anulowanie", () => {
  const phoneA = randomTestPhone();
  const phoneB = randomTestPhone();
  let tokenA = "";
  let tokenB = "";
  let termId = 0;
  let reservationId = 0;

  const registerPatient = async (phone: string, firstName: string) => {
    const code = await seedVerificationCode(phone, "register");

    const verify = await call("/phone-verification/verify", {
      method: "POST",
      body: { phoneNumber: phone, code, purpose: "register" }
    });
    assert.equal(verify.status, 200, JSON.stringify(verify.body));

    const register = await call("/auth/register", {
      method: "POST",
      body: { firstName, lastName: "Testowy", phoneNumber: phone }
    });
    assert.equal(register.status, 201, JSON.stringify(register.body));

    return register.body.token as string;
  };

  test("WF-01: lista specjalizacji nie jest pusta", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/specializations");
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body) && res.body.length > 0);
  });

  test("WF-02: filtr specjalizacji zwraca tylko terminy tej specjalizacji", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/terms?specialization=Kardiolog");
    assert.equal(res.status, 200);
    assert.ok(res.body.length > 0, "seed powinien zawierać wolne terminy kardiologa");
    assert.ok(res.body.every((term: any) => term.Specialization === "Kardiolog"));

    // Ostatni termin – najdalej w przyszłości, więc da się go potem anulować.
    termId = res.body[res.body.length - 1].TermID;
  });

  test("UC.Wizyta.Alt02: błędny kod SMS → 400 z komunikatem z dokumentacji", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const code = await seedVerificationCode(phoneA, "register");
    const wrongCode = code === "1".repeat(code.length) ? "2".repeat(code.length) : "1".repeat(code.length);

    const res = await call("/phone-verification/verify", {
      method: "POST",
      body: { phoneNumber: phoneA, code: wrongCode, purpose: "register" }
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.message, "Wprowadzony kod jest nieprawidłowy lub wygasł.");
  });

  test("rejestracja bez weryfikacji numeru → 403", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/auth/register", {
      method: "POST",
      body: { firstName: "Bez", lastName: "Kodu", phoneNumber: randomTestPhone() }
    });
    assert.equal(res.status, 403);
  });

  test("WF-04: rejestracja tylko z imieniem, nazwiskiem i telefonem → 201 + token", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    tokenA = await registerPatient(phoneA, "Anna");
    tokenB = await registerPatient(phoneB, "Bartek");
    assert.ok(tokenA && tokenB);
  });

  test("WF-04: ponowna rejestracja tego samego numeru → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/phone-verification/send", {
      method: "POST",
      body: { phoneNumber: phoneA, purpose: "register" }
    });
    assert.equal(res.status, 409);
  });

  test("WF-05: logowanie kodem SMS istniejącego pacjenta → token", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const code = await seedVerificationCode(phoneA, "login");
    const res = await call("/phone-verification/verify", {
      method: "POST",
      body: { phoneNumber: phoneA, code, purpose: "login" }
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);

    // Kod jednorazowy – drugie użycie musi się nie udać (WNF-04)
    const reuse = await call("/phone-verification/verify", {
      method: "POST",
      body: { phoneNumber: phoneA, code, purpose: "login" }
    });
    assert.equal(reuse.status, 400);
  });

  test("WF-03 + WF-09: rezerwacja zwraca dane do potwierdzenia", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations", {
      method: "POST",
      token: tokenA,
      body: { termId }
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));

    const r = res.body.reservation;
    reservationId = res.body.reservationId;
    assert.equal(r.id, reservationId);
    assert.equal(r.status, "active");
    assert.equal(r.termId, termId);
    assert.equal(r.doctor.specialization, "Kardiolog");
    assert.ok(r.doctor.lastName);
    assert.ok(r.startDate);
    assert.ok(r.clinicAddress);
    assert.equal(r.canCancel, true);
  });

  test("WF-03: zarezerwowany termin znika z listy wolnych terminów", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/terms?specialization=Kardiolog");
    assert.ok(!res.body.some((term: any) => term.TermID === termId));
  });

  test("UC.Wizyta.Alt04: drugi pacjent nie może zająć tego samego terminu → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations", {
      method: "POST",
      token: tokenB,
      body: { termId }
    });
    assert.equal(res.status, 409);
    assert.equal(
      res.body.message,
      "Przepraszamy, ten termin został właśnie zarezerwowany przez innego pacjenta."
    );
  });

  test("rezerwacja nieistniejącego terminu → 404, błędny termId → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const missing = await call("/reservations", {
      method: "POST",
      token: tokenA,
      body: { termId: 999999999 }
    });
    assert.equal(missing.status, 404);

    const invalid = await call("/reservations", {
      method: "POST",
      token: tokenA,
      body: { termId: "abc" }
    });
    assert.equal(invalid.status, 400);
  });

  test("WF-06: pacjent widzi swoją wizytę na liście", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations/me", { token: tokenA });
    assert.equal(res.status, 200);

    const mine = res.body.reservations.find((r: any) => r.id === reservationId);
    assert.ok(mine, "rezerwacja powinna być na liście");
    assert.equal(mine.status, "active");
    assert.equal(mine.isUpcoming, true);
  });

  test("WF-06: inny pacjent nie widzi cudzej wizyty", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const list = await call("/reservations/me", { token: tokenB });
    assert.equal(list.status, 200);
    assert.ok(!list.body.reservations.some((r: any) => r.id === reservationId));

    const details = await call(`/reservations/${reservationId}`, { token: tokenB });
    assert.equal(details.status, 404);
  });

  test("WF-07: inny pacjent nie może anulować cudzej wizyty → 404", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      token: tokenB
    });
    assert.equal(res.status, 404);
  });

  test("WF-07: anulowanie z błędnym identyfikatorem → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations/abc/cancel", {
      method: "PATCH",
      token: tokenA
    });
    assert.equal(res.status, 400);
  });

  test("WF-07: pacjent anuluje swoją wizytę, a termin znowu jest wolny", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      token: tokenA
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.status, "cancelled");
    assert.equal(res.body.reservation.canCancel, false);

    const terms = await call("/terms?specialization=Kardiolog");
    assert.ok(terms.body.some((term: any) => term.TermID === termId));
  });

  test("WF-07: ponowne anulowanie tej samej wizyty → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      token: tokenA
    });
    assert.equal(res.status, 409);
  });

  test("po anulowaniu termin może zarezerwować inny pacjent", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations", {
      method: "POST",
      token: tokenB,
      body: { termId }
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
  });
});
