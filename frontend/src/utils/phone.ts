// Pomocnicze funkcje do numerów telefonu.
//
// Pacjent może wpisać numer na wiele sposobów („600 100 200”, „48600100200”,
// „+48 600-100-200”), a backend przyjmuje wyłącznie format E.164: „+48600100200”.
// Dlatego przed wysłaniem do API zawsze normalizujemy numer.

/** Ten sam wzorzec co w backendzie (backend/src/utils/validation.ts). */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

/** Zamienia "600 100 200" / "48600100200" / "+48 600-100-200" na "+48600100200". */
export function normalizePhone(raw: string): string {
  // Zostawiamy tylko cyfry i znak „+”
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  // „48600100200” – numer z kierunkowym, ale bez plusa
  if (digits.startsWith('48') && digits.length === 11) return `+${digits}`;
  // Domyślnie zakładamy polski numer
  return `+48${digits}`;
}

/** Czy wpisany numer (przed normalizacją) da się wysłać do backendu. */
export function isValidPhoneInput(raw: string): boolean {
  // Co najmniej 9 cyfr – krótsze numery to prawie na pewno literówka
  return E164_PATTERN.test(normalizePhone(raw)) && raw.replace(/\D/g, '').length >= 9;
}

/** „+48600100200” → „+48 600 100 200” (czytelniej na ekranie). */
export function formatPhone(e164: string): string {
  const match = /^\+48(\d{3})(\d{3})(\d{3})$/.exec(e164);
  return match ? `+48 ${match[1]} ${match[2]} ${match[3]}` : e164;
}

/** Podpowiedź pod polem kodu z poprawną polską odmianą: „4 cyfry”, „6 cyfr”. */
export function codeHint(length: number): string {
  return `${length} ${length >= 2 && length <= 4 ? 'cyfry' : 'cyfr'}`;
}

/**
 * Imię / nazwisko: litery (także polskie), spacja, myślnik, apostrof.
 * Ten sam wzorzec co w backendzie – dzięki temu błąd pokazujemy od razu,
 * zanim pacjent zużyje kod SMS.
 */
const NAME_PATTERN = /^[\p{L}][\p{L}' -]*$/u;

export function isValidName(value: string): boolean {
  const name = value.trim();
  return name.length > 0 && name.length <= 100 && NAME_PATTERN.test(name);
}
