// Etykiety statusów w panelu pracownika.
// Każdy status ma tekst + ikonę, a nie tylko kolor (WNF-01 – ważne dla daltonistów).

import type { ReservationStatus } from '../api';
import type { TermStatus } from '../staffApi';

export const TERM_STATUS: Record<TermStatus, { text: string; icon: string }> = {
  free: { text: 'Wolny', icon: '○' },
  reserved: { text: 'Zarezerwowany', icon: '●' },
  blocked: { text: 'Zablokowany', icon: '⊘' },
};

export const RESERVATION_STATUS: Record<ReservationStatus, { text: string; icon: string }> = {
  active: { text: 'Zaplanowana', icon: '●' },
  cancelled: { text: 'Anulowana', icon: '✕' },
  completed: { text: 'Odbyta', icon: '✓' },
  no_show: { text: 'Nieobecność', icon: '!' },
};
