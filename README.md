# Tap2Chef (web)

Orders, tables and daily sales for small restaurants. Offline-first PWA:
installable on phone, tablet and desktop, and fully usable without internet.

## Architecture

```
Browser / installed PWA
 ├─ UI: React + Tailwind (bottom tabs on phones, sidebar on tablet/desktop)
 ├─ Local DB: IndexedDB via Dexie   ← every read/write happens here
 ├─ Outbox: queued changes, pushed to the server when online
 └─ Service worker (vite-plugin-pwa): app shell cached, opens offline
            ⇅  sync (planned): push outbox, pull changes since last sync
Express + MongoDB: login, backup, multiple devices
```

Every synced record has `id` (generated on the device), `accountId` (plus
`shopId` on shop-level records), `updatedAt` and `deleted` (soft delete). Write
through `writeAll()` in `client/src/infrastructure/db/repo.ts` so changes always
land in the outbox.

## Run locally

Requires Node 22 (`nvm use`). Architecture and design rules: see `CLAUDE.md`.

```bash
# client
cd client && npm install && npm run dev      # http://localhost:5173

# server
cd server && npm install && cp .env.example .env && npm run dev
cd server && npm test
```

Service workers need https or localhost. To test on a phone, use
`npm run build && npx vite preview --host` behind an https tunnel, or
Chrome's "Insecure origins treated as secure" flag.

## Roadmap

1. ~~Repo, client, server~~
2. ~~Installable PWA that opens offline~~
3. ~~Local database + outbox, TypeScript, layered structure~~
4. Menu builder
5. Table grid and orders
6. Bill settlement (cash / UPI split)
7. Expenses and daily dashboard
8. Real login and sync
9. Printing (Web Bluetooth on Android Chrome; print dialog / WhatsApp share elsewhere)
