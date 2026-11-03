# projekt-systemu-przychodnia

System rezerwacji wizyt dla przychodni.

## Stack
- **Frontend:** TypeScript + React (Vite) + Chart.js
- **Backend:** TypeScript + Node.js (Express) + SMSAPI.pl
- **DB:** MySQL
- **Środowisko:** GitHub, Docker

## Uruchomienie

### Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev        # http://localhost:3000/api/health
```
