// Pasek postępu rezerwacji – maks. 4 kroki (WNF-07).
//
// Każdy krok ma jeden z trzech stanów: ukończony (✓), bieżący, przyszły.
// Stan jest przekazany nie tylko kolorem: ukończony ma ✓, bieżący – pogrubienie
// i aria-current="step", a czytnik ekranu dostaje ukryty tekst „Krok 2 z 4: …”.

const STEPS = ['Lekarz', 'Termin', 'Dane i kod SMS', 'Potwierdzenie'];

/** current – indeks bieżącego kroku (0..3), ten sam co `step` w App.tsx */
export default function Stepper({ current }: { current: number }) {
  return (
    <nav aria-label="Etapy rezerwacji">
      <ol className="stepper">
        {STEPS.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={label} className={`stepper__item stepper__item--${state}`}
                aria-current={state === 'current' ? 'step' : undefined}>
              <span className="stepper__num" aria-hidden="true">
                {state === 'done' ? '✓' : i + 1}
              </span>
              <span className="stepper__label">
                <span className="sr-only">Krok {i + 1} z {STEPS.length}: </span>
                {label}
                {state === 'done' && <span className="sr-only"> (ukończony)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
