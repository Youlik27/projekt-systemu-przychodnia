// Pasek postępu rezerwacji – maks. 4 kroki (WNF-07).

const STEPS = ['Lekarz', 'Termin', 'Dane i kod SMS', 'Potwierdzenie'];

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
