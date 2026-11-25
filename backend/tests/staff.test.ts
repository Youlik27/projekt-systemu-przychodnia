// Testy funkcji dokończonych na zakończenie projektu:
//   - logowanie pracownika i role (WNF-03),
//   - WF-08: zmiana terminu wizyty przez pacjenta,
//   - WF-10: harmonogram (dodawanie / blokowanie / usuwanie terminów),
//   - WF-11: rezerwacje w panelu pracownika,
//   - WF-12: przypomnienia SMS.
//
// Uruchomienie: docker compose up -d, a następnie w katalogu backend: npm test
// Testy są pomijane, jeśli MySQL nie jest dostępny.
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  api,
  cleanupTestData,
  dateInDays,
  fakeToken,
  insertTestTerm,
  isDatabaseAvailable,
  loginAsStaff,
  pool,
  randomTestPhone,
  registerTestPatient,
  STAFF_PHONE,
  startServer,
  TEST_CABINET,
  type TestServer
} from "./helpers.js";

let server: TestServer;
let dbAvailable = false;

before(async () => {
  server = await startServer();
  dbAvailable = await isDatabaseAvailable();
  if (dbAvailable) await cleanupTestData();
});

after(async () => {
  if (dbAvailable) await cleanupTestData();
  await server.close();
  await pool.end();
});

const call = (path: string, options?: Parameters<typeof api>[2]) =>
  api(server.baseUrl, path, options);

// Lekarze z db/02_seed.sql
const CARDIOLOGIST_ID = 2; // Piotr Nowak, Kardiolog
const INTERNIST_ID = 1;    // Anna Kowalska, Internista

// Dzień daleko w przyszłości – terminy testowe nie mieszają się z danymi z seeda
const TEST_DAY = dateInDays(200);

// ---------------------------------------------------------------------------
// Uprawnienia i walidacja – działają także BEZ bazy danych
// (żądanie jest odrzucane, zanim dojdzie do zapytania SQL)
// ---------------------------------------------------------------------------
describe("Panel pracownika: uprawnienia i walidacja (bez bazy)", () => {
  const staff = () => fakeToken("staff");
  const patient = () => fakeToken("patient");

  test("bez tokenu → 401, token pacjenta → 403 (WNF-03)", async () => {
    for (const path of ["/staff/doctors", "/staff/reservations", "/staff/schedule"]) {
      assert.equal((await call(path)).status, 401, path);
      assert.equal((await call(path, { token: patient() })).status, 403, path);
    }

    const run = await call("/staff/reminders/run", { method: "POST", token: patient() });
    assert.equal(run.status, 403);
  });

  test("token pracownika na endpointach pacjenta → 403", async () => {
    const res = await call("/reservations/me", { token: staff() });
    assert.equal(res.status, 403);

    const reschedule = await call("/reservations/1/reschedule", {
      method: "PATCH",
      token: staff(),
      body: { termId: 2 }
    });
    assert.equal(reschedule.status, 403);
  });

  test("WF-08: zmiana terminu z błędnym termId lub ID rezerwacji → 400", async () => {
    const badTerm = await call("/reservations/1/reschedule", {
      method: "PATCH",
      token: patient(),
      body: { termId: "abc" }
    });
    assert.equal(badTerm.status, 400);
    assert.ok(badTerm.body.errors.termId);

    const badId = await call("/reservations/abc/reschedule", {
      method: "PATCH",
      token: patient(),
      body: { termId: 5 }
    });
    assert.equal(badId.status, 400);
  });

  test("WF-10: harmonogram bez lekarza lub z błędnym zakresem dat → 400", async () => {
    assert.equal((await call("/staff/schedule?from=2026-12-01", { token: staff() })).status, 400);
    assert.equal(
      (await call("/staff/schedule?doctorId=1&from=2026-02-30", { token: staff() })).status,
      400
    );
    // zakres odwrócony
    assert.equal(
      (await call("/staff/schedule?doctorId=1&from=2026-12-10&to=2026-12-01", { token: staff() })).status,
      400
    );
    // zakres dłuższy niż 31 dni
    assert.equal(
      (await call("/staff/schedule?doctorId=1&from=2026-01-01&to=2026-03-01", { token: staff() })).status,
      400
    );
  });

  test("WF-10: dodawanie terminów – błędne pola są wskazane (UC.B02)", async () => {
    const res = await call("/staff/terms", {
      method: "POST",
      token: staff(),
      body: {
        doctorId: 0,
        dateFrom: "2026-13-01",
        startTime: "25:00",
        endTime: "10:00",
        slotMinutes: 2,
        cabinet: "X".repeat(30),
        skipWeekends: "tak"
      }
    });
    assert.equal(res.status, 400);
    for (const field of ["doctorId", "dateFrom", "startTime", "slotMinutes", "cabinet", "skipWeekends"]) {
      assert.ok(res.body.errors[field], `brak błędu dla pola ${field}`);
    }
  });

  test("WF-10: godzina końca przed początkiem i zbyt długi zakres → 400", async () => {
    const res = await call("/staff/terms", {
      method: "POST",
      token: staff(),
      body: {
        doctorId: 1,
        dateFrom: "2026-12-01",
        dateTo: "2027-02-01",
        startTime: "12:00",
        endTime: "09:00",
        slotMinutes: 30
      }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.endTime);
    assert.ok(res.body.errors.dateTo);
  });

  test("WF-10: zmiana dostępności terminu na nieznany status → 400", async () => {
    const res = await call("/staff/terms/1", {
      method: "PATCH",
      token: staff(),
      body: { status: "reserved" }
    });
    assert.equal(res.status, 400);

    const badId = await call("/staff/terms/abc", { method: "DELETE", token: staff() });
    assert.equal(badId.status, 400);
  });

  test("WF-11: filtry listy rezerwacji i zmiana statusu wizyty – walidacja → 400", async () => {
    assert.equal((await call("/staff/reservations?status=zly", { token: staff() })).status, 400);
    assert.equal((await call("/staff/reservations?from=jutro", { token: staff() })).status, 400);
    assert.equal((await call("/staff/reservations?patient=a", { token: staff() })).status, 400);

    const outcome = await call("/staff/reservations/1/status", {
      method: "PATCH",
      token: staff(),
      body: { status: "cancelled" }
    });
    assert.equal(outcome.status, 400);
  });
});

describe("Panel pracownika i zmiana terminu", () => {
  let staffToken = "";
  let patientToken = "";
  let otherPatientToken = "";
  const patientPhone = randomTestPhone();
  let termA = 0; // Kardiolog, TEST_DAY 14:00
  let termB = 0; // Kardiolog, TEST_DAY 14:30
  let reservationId = 0;

  // -------------------------------------------------------------------------
  // Logowanie i role (WNF-03)
  // -------------------------------------------------------------------------

  test("logowanie pracownika: numer pacjenta z rolą staff → 404", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/phone-verification/send", {
      method: "POST",
      body: { phoneNumber: "+48600100200", purpose: "login", role: "staff" }
    });
    assert.equal(res.status, 404);
  });

  test("rejestracja z rolą staff jest niedozwolona → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/phone-verification/send", {
      method: "POST",
      body: { phoneNumber: randomTestPhone(), purpose: "register", role: "staff" }
    });
    assert.equal(res.status, 400);
  });

  test("logowanie pracownika kodem SMS → token z rolą staff", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    staffToken = await loginAsStaff(server.baseUrl);
    const me = await call("/auth/me", { token: staffToken });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.role, "staff");
    assert.equal(me.body.user.phoneNumber, STAFF_PHONE);

    patientToken = await registerTestPatient(server.baseUrl, patientPhone, "Patryk");
    otherPatientToken = await registerTestPatient(server.baseUrl, randomTestPhone(), "Olga");
  });

  test("pacjent nie ma dostępu do panelu pracownika → 403, bez tokenu → 401", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const asPatient = await call(`/staff/reservations`, { token: patientToken });
    assert.equal(asPatient.status, 403);

    const anonymous = await call(`/staff/reservations`);
    assert.equal(anonymous.status, 401);
  });

  test("pracownik nie korzysta z endpointów pacjenta → 403", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/reservations/me", { token: staffToken });
    assert.equal(res.status, 403);
  });

  // -------------------------------------------------------------------------
  // WF-10: harmonogram
  // -------------------------------------------------------------------------

  test("WF-10: dodanie terminów z błędnymi godzinami → 400 ze wskazaniem pola", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/staff/terms", {
      method: "POST",
      token: staffToken,
      body: {
        doctorId: CARDIOLOGIST_ID,
        dateFrom: TEST_DAY,
        startTime: "15:00",
        endTime: "14:00",
        slotMinutes: 30
      }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.endTime);
  });

  test("WF-10: pracownik dodaje terminy (14:00–15:00 co 30 min) → 2 nowe terminy", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/staff/terms", {
      method: "POST",
      token: staffToken,
      body: {
        doctorId: CARDIOLOGIST_ID,
        dateFrom: TEST_DAY,
        startTime: "14:00",
        endTime: "15:00",
        slotMinutes: 30,
        cabinet: TEST_CABINET,
        skipWeekends: false
      }
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.created.length, 2);
    assert.equal(res.body.skipped.length, 0);

    [termA, termB] = res.body.created.map((term: any) => term.termId);
  });

  test("WF-10: ponowne dodanie tych samych godzin → terminy pominięte (brak dubli)", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/staff/terms", {
      method: "POST",
      token: staffToken,
      body: {
        doctorId: CARDIOLOGIST_ID,
        dateFrom: TEST_DAY,
        startTime: "14:00",
        endTime: "15:00",
        slotMinutes: 30,
        cabinet: TEST_CABINET,
        skipWeekends: false
      }
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.created.length, 0);
    assert.equal(res.body.skipped.length, 2);
  });

  test("WF-10: nowe terminy są w harmonogramie i na liście wolnych terminów", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const schedule = await call(
      `/staff/schedule?doctorId=${CARDIOLOGIST_ID}&from=${TEST_DAY}`,
      { token: staffToken }
    );
    assert.equal(schedule.status, 200);
    const ids = schedule.body.terms.map((term: any) => term.termId);
    assert.ok(ids.includes(termA) && ids.includes(termB));

    const publicTerms = await call(`/terms?doctorId=${CARDIOLOGIST_ID}&date=${TEST_DAY}`);
    const publicIds = publicTerms.body.map((term: any) => term.TermID);
    assert.ok(publicIds.includes(termA) && publicIds.includes(termB));
  });

  test("WF-10: zablokowany termin znika z listy wolnych, po odblokowaniu wraca", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const block = await call(`/staff/terms/${termB}`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "blocked" }
    });
    assert.equal(block.status, 200);
    assert.equal(block.body.term.status, "blocked");

    let publicTerms = await call(`/terms?doctorId=${CARDIOLOGIST_ID}&date=${TEST_DAY}`);
    assert.ok(!publicTerms.body.some((term: any) => term.TermID === termB));

    const unblock = await call(`/staff/terms/${termB}`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "free" }
    });
    assert.equal(unblock.status, 200);

    publicTerms = await call(`/terms?doctorId=${CARDIOLOGIST_ID}&date=${TEST_DAY}`);
    assert.ok(publicTerms.body.some((term: any) => term.TermID === termB));
  });

  test("WF-10: zarezerwowanego terminu nie można zablokować ani usunąć → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const booking = await call("/reservations", {
      method: "POST",
      token: patientToken,
      body: { termId: termA }
    });
    assert.equal(booking.status, 201, JSON.stringify(booking.body));
    reservationId = booking.body.reservationId;

    const block = await call(`/staff/terms/${termA}`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "blocked" }
    });
    assert.equal(block.status, 409);

    const remove = await call(`/staff/terms/${termA}`, { method: "DELETE", token: staffToken });
    assert.equal(remove.status, 409);
  });

  // -------------------------------------------------------------------------
  // WF-08: zmiana terminu przez pacjenta
  // -------------------------------------------------------------------------

  test("WF-08: pacjent przenosi wizytę na inny termin – stary wraca do puli", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: patientToken,
      body: { termId: termB }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.id, reservationId, "numer rezerwacji się nie zmienia");
    assert.equal(res.body.reservation.termId, termB);

    const publicTerms = await call(`/terms?doctorId=${CARDIOLOGIST_ID}&date=${TEST_DAY}`);
    const publicIds = publicTerms.body.map((term: any) => term.TermID);
    assert.ok(publicIds.includes(termA), "stary termin znowu wolny");
    assert.ok(!publicIds.includes(termB), "nowy termin zajęty");
  });

  test("WF-08: przeniesienie na ten sam termin → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: patientToken,
      body: { termId: termB }
    });
    assert.equal(res.status, 400);
  });

  test("WF-08: przeniesienie do innej specjalizacji → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const internistTerm = await insertTestTerm(INTERNIST_ID, 200 * 24 * 60);
    const res = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: patientToken,
      body: { termId: internistTerm }
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /specjalizacji/);
  });

  test("WF-08: inny pacjent nie może przenieść cudzej wizyty → 404", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: otherPatientToken,
      body: { termId: termA }
    });
    assert.equal(res.status, 404);
  });

  test("WF-08: przeniesienie na zajęty termin → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    // Drugi pacjent zajmuje termin A, a pierwszy próbuje się na niego przenieść
    const booking = await call("/reservations", {
      method: "POST",
      token: otherPatientToken,
      body: { termId: termA }
    });
    assert.equal(booking.status, 201);

    const res = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: patientToken,
      body: { termId: termA }
    });
    assert.equal(res.status, 409);

    // Sprzątanie: drugi pacjent odwołuje wizytę → termin A wolny
    const cancel = await call(`/reservations/${booking.body.reservationId}/cancel`, {
      method: "PATCH",
      token: otherPatientToken
    });
    assert.equal(cancel.status, 200);
  });

  // -------------------------------------------------------------------------
  // WF-11: rezerwacje w panelu pracownika
  // -------------------------------------------------------------------------

  test("WF-11: pracownik wyszukuje rezerwacje pacjenta (z danymi pacjenta)", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/staff/reservations?patient=${encodeURIComponent(patientPhone.slice(3))}`, {
      token: staffToken
    });
    assert.equal(res.status, 200);
    const found = res.body.reservations.find((r: any) => r.id === reservationId);
    assert.ok(found, "rezerwacja powinna być na liście");
    assert.equal(found.patient.phoneNumber, patientPhone);
  });

  test("WF-11: błędny filtr statusu → 400", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/staff/reservations?status=nieznany", { token: staffToken });
    assert.equal(res.status, 400);
  });

  test("WF-11: pracownik przenosi wizytę pacjenta z powrotem na termin A", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/staff/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: staffToken,
      body: { termId: termA }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.termId, termA);
  });

  test("WF-11: wizyty, która się nie odbyła, nie można oznaczyć jako odbytej → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/staff/reservations/${reservationId}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "completed" }
    });
    assert.equal(res.status, 409);
  });

  test("WF-11: pracownik anuluje wizytę → status cancelled, termin wolny", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/staff/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      token: staffToken
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.status, "cancelled");

    const publicTerms = await call(`/terms?doctorId=${CARDIOLOGIST_ID}&date=${TEST_DAY}`);
    assert.ok(publicTerms.body.some((term: any) => term.TermID === termA));
  });

  test("WF-11: rejestracja zapisuje nowego pacjenta przez telefon (konto tworzy się samo)", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const phone = randomTestPhone();
    const first = await call("/staff/reservations", {
      method: "POST",
      token: staffToken,
      body: { termId: termA, phoneNumber: phone, firstName: "Teresa", lastName: "Telefoniczna" }
    });
    assert.equal(first.status, 201, JSON.stringify(first.body));
    assert.equal(first.body.patientCreated, true);
    assert.equal(first.body.reservation.patient.phoneNumber, phone);

    // Ten sam pacjent drugi raz – bez zakładania kolejnego konta (WF-04)
    const second = await call("/staff/reservations", {
      method: "POST",
      token: staffToken,
      body: { termId: termB, phoneNumber: phone, firstName: "Teresa", lastName: "Telefoniczna" }
    });
    assert.equal(second.status, 201, JSON.stringify(second.body));
    assert.equal(second.body.patientCreated, false);
  });

  test("WF-11: zapis przez rejestrację z błędnymi danymi → 400 ze wskazaniem pól", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call("/staff/reservations", {
      method: "POST",
      token: staffToken,
      body: { termId: "x", phoneNumber: "123", firstName: "", lastName: "Kowalski" }
    });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.termId && res.body.errors.phoneNumber && res.body.errors.firstName);
  });

  test("WF-11: pracownik oznacza przeszłą wizytę jako nieobecność", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    // Wizyta sprzed godziny – wstawiona bezpośrednio do bazy
    const pastTerm = await insertTestTerm(CARDIOLOGIST_ID, -60, "reserved");
    const [users] = await pool.query<any[]>("SELECT ID FROM `User` WHERE PhoneNumber = ?", [patientPhone]);
    const [insert] = await pool.query<any>(
      "INSERT INTO Reservation (UserID, TermsTermID, TermsDoctorID, Status) VALUES (?, ?, ?, 'active')",
      [users[0].ID, pastTerm, CARDIOLOGIST_ID]
    );

    const res = await call(`/staff/reservations/${insert.insertId}/status`, {
      method: "PATCH",
      token: staffToken,
      body: { status: "no_show" }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.status, "no_show");
  });

  test("WF-10: wolny termin bez historii rezerwacji można usunąć", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const created = await call("/staff/terms", {
      method: "POST",
      token: staffToken,
      body: {
        doctorId: CARDIOLOGIST_ID,
        dateFrom: TEST_DAY,
        startTime: "16:00",
        endTime: "16:30",
        slotMinutes: 30,
        cabinet: TEST_CABINET,
        skipWeekends: false
      }
    });
    assert.equal(created.status, 201);
    const termId = created.body.created[0].termId;

    const remove = await call(`/staff/terms/${termId}`, { method: "DELETE", token: staffToken });
    assert.equal(remove.status, 200);

    const again = await call(`/staff/terms/${termId}`, { method: "DELETE", token: staffToken });
    assert.equal(again.status, 404);
  });
});

// ---------------------------------------------------------------------------
// Zasady przychodni (termin na odwołanie) i przypomnienia SMS
// ---------------------------------------------------------------------------
describe("Wizyta za godzinę: zasady odwołania i przypomnienie SMS (WF-07, WF-08, WF-12)", () => {
  let staffToken = "";
  let patientToken = "";
  let reservationId = 0;
  let soonTerm = 0;
  let laterTerm = 0;

  test("pacjent rezerwuje wizytę za godzinę", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    staffToken = await loginAsStaff(server.baseUrl);
    patientToken = await registerTestPatient(server.baseUrl, randomTestPhone(), "Zofia");
    soonTerm = await insertTestTerm(CARDIOLOGIST_ID, 60);
    laterTerm = await insertTestTerm(CARDIOLOGIST_ID, 200 * 24 * 60 + 300);

    const res = await call("/reservations", {
      method: "POST",
      token: patientToken,
      body: { termId: soonTerm }
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    reservationId = res.body.reservationId;
    assert.equal(res.body.reservation.canCancel, false, "za późno na odwołanie przez pacjenta");
  });

  test("pacjent nie może już anulować ani przenieść tej wizyty → 409", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const cancel = await call(`/reservations/${reservationId}/cancel`, {
      method: "PATCH",
      token: patientToken
    });
    assert.equal(cancel.status, 409);

    const reschedule = await call(`/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: patientToken,
      body: { termId: laterTerm }
    });
    assert.equal(reschedule.status, 409);
  });

  test("WF-12: przypomnienie SMS wysyła się raz dla danego terminu", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const run = await call("/staff/reminders/run", { method: "POST", token: staffToken });
    assert.equal(run.status, 200, "czy wykonano db/06_reservation_reminder.sql? " + JSON.stringify(run.body));
    assert.ok(run.body.sent >= 1);

    const countReminders = async () => {
      const [rows] = await pool.query<any[]>(
        "SELECT COUNT(*) AS n FROM ReservationReminder WHERE ReservationID = ?",
        [reservationId]
      );
      return Number(rows[0].n);
    };
    assert.equal(await countReminders(), 1);

    // Drugi przebieg nie wysyła tego samego przypomnienia ponownie
    await call("/staff/reminders/run", { method: "POST", token: staffToken });
    assert.equal(await countReminders(), 1);
  });

  test("rejestracja może przenieść wizytę także tuż przed terminem", async (t) => {
    if (!dbAvailable) return t.skip("brak bazy danych");

    const res = await call(`/staff/reservations/${reservationId}/reschedule`, {
      method: "PATCH",
      token: staffToken,
      body: { termId: laterTerm }
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.reservation.termId, laterTerm);
    assert.equal(res.body.reservation.canCancel, true, "nowy termin jest daleko – pacjent znowu może odwołać");
  });
});
