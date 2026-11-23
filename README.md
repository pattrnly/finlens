# FinLens server

India-first personal finance API (NestJS + Fastify + MongoDB + Redis).

## Run locally

Start Docker Desktop, then:

```bash
docker compose up -d
cp .env.example .env
npm install
npm run start:dev
```

API: `http://localhost:3001/api/v1`

In `finlens-client`: `npm install && npm run dev` → `http://localhost:5173`

Optional: set `GEMINI_API_KEY` for unknown-bank statement layouts and AI insights. IDFC First and AU Bank statements parse locally without AI.
