// Punkt wejścia aplikacji: podpina komponent <App /> do elementu #root z index.html.
// StrictMode w trybie deweloperskim uruchamia efekty dwukrotnie, żeby wyłapać błędy –
// dlatego np. lista specjalizacji może się w konsoli pobrać dwa razy (to normalne).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
