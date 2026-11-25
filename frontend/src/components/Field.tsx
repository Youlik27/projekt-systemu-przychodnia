import type { ReactNode } from 'react';

// Pole formularza z etykietą, podpowiedzią i komunikatem błędu.
//
// Dostępność (WNF-01, UC.B02):
//   - <label htmlFor> łączy etykietę z polem – czytnik ekranu ją odczyta,
//   - podpowiedź i błąd są podpięte przez aria-describedby,
//   - aria-invalid oznacza błędne pole (w CSS dostaje grubszą czerwoną ramkę),
//   - błąd ma role="alert", więc czytnik ekranu ogłosi go od razu,
//   - błąd ma ikonę ⚠, a nie tylko kolor (ważne dla daltonistów).
//
// Użycie (render-prop – komponent przekazuje gotowe atrybuty aria do <input>):
//
//   <Field id="phone" label="Numer telefonu" hint="..." error={errors.phone}>
//     {(aria) => <input id="phone" className="field__control" {...aria} />}
//   </Field>

export interface FieldAria {
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
}

interface Props {
  /** Musi być takie samo jak id elementu <input> */
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: (aria: FieldAria) => ReactNode;
}

export default function Field({ id, label, hint, error, children }: Props) {
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">{label}</label>
      {hint && <p id={`${id}-hint`} className="field__hint">{hint}</p>}
      {children({ 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {error && (
        <p id={`${id}-error`} className="field__error" role="alert">
          <span aria-hidden="true">⚠ </span>{error}
        </p>
      )}
    </div>
  );
}
