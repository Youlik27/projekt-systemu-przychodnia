# projekt-systemu-przychodnia

System rezerwacji wizyt dla przychodni.

## Stack
- **Frontend:** TypeScript + React (Vite) + Chart.js
- **Backend:** TypeScript + Node.js (Express) 
- **DB:** MySQL 8.4 (Docker), w backendzie `mysql2`
- **Środowisko:** GitHub, Docker

## Uruchomienie

### Baza danych
Wymagany [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
docker compose up -d          # MySQL na localhost:3307, baza "przychodnia"
```

Przy pierwszym uruchomieniu Docker sam wykonuje pliki z folderu `db/`:
- [`db/01_schema.sql`](db/01_schema.sql) – tworzy tabele `User`, `Doctor`, `Terms`, `Reservation`,
- [`db/02_seed.sql`](db/02_seed.sql) – wgrywa dane testowe.

Modele TypeScript odpowiadające tabelom: [`backend/src/models.ts`](backend/src/models.ts),
połączenie z bazą: [`backend/src/db.ts`](backend/src/db.ts).

**Zmiana tabel:** pliki z `db/` wykonują się tylko na pustej bazie. Po zmianie SQL (i `models.ts`) trzeba bazę odtworzyć:

```bash
docker compose down -v        # usuwa bazę razem z danymi
docker compose up -d          # tworzy ją od nowa z plików db/
```

Podgląd bazy z konsoli:

```bash
docker exec -it przychodnia-db mysql -uroot -proot przychodnia
```

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
