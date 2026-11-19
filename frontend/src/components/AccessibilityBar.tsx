import { useEffect, useState } from 'react';

// Moduł dostępności (dokumentacja 4.2): wysoki kontrast + powiększenie tekstu do 200%.
// Ustawienia są zapamiętywane w przeglądarce, żeby pacjent nie musiał ich włączać za każdym razem.

// Kolejne poziomy powiększenia tekstu w procentach (WNF-01: do 200%).
// Cały CSS używa jednostek rem, więc zmiana font-size na <html> skaluje cały układ.
const SCALES = [100, 125, 150, 175, 200];

/** Bezpieczny odczyt z localStorage (w trybie prywatnym może rzucić wyjątek). */
function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* brak dostępu do localStorage – ustawienie działa do odświeżenia strony */
  }
}

export default function AccessibilityBar() {
  const [contrast, setContrast] = useState<boolean>(() => load('a11y-contrast', false));
  const [scale, setScale] = useState<number>(() => load('a11y-scale', 100));

  // Atrybut data-contrast="high" na <html> przełącza zmienne kolorów w index.css
  useEffect(() => {
    document.documentElement.dataset.contrast = contrast ? 'high' : 'normal';
    save('a11y-contrast', contrast);
  }, [contrast]);

  // Powiększenie tekstu – zmiana bazowego rozmiaru czcionki dokumentu
  useEffect(() => {
    document.documentElement.style.fontSize = `${scale}%`;
    save('a11y-scale', scale);
  }, [scale]);

  const idx = SCALES.indexOf(scale);

  return (
    <div className="a11y-bar" role="region" aria-label="Ustawienia dostępności">
      <div className="a11y-bar__inner">
        <button
          type="button"
          className="a11y-btn"
          aria-pressed={contrast}
          onClick={() => setContrast((c) => !c)}
        >
          <span aria-hidden="true" className="a11y-btn__icon">◐</span>
          {contrast ? 'Wyłącz wysoki kontrast' : 'Wysoki kontrast'}
        </button>

        <div className="a11y-font" role="group" aria-label="Wielkość tekstu">
          <button
            type="button"
            className="a11y-btn"
            onClick={() => setScale(SCALES[Math.max(0, idx - 1)])}
            disabled={idx <= 0}
            aria-label="Zmniejsz tekst"
          >
            A−
          </button>
          <span className="a11y-font__value" aria-live="polite">
            Tekst: {scale}%
          </span>
          <button
            type="button"
            className="a11y-btn"
            onClick={() => setScale(SCALES[Math.min(SCALES.length - 1, idx + 1)])}
            disabled={idx >= SCALES.length - 1}
            aria-label="Powiększ tekst"
          >
            A+
          </button>
        </div>
      </div>
    </div>
  );
}
