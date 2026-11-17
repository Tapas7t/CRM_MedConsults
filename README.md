# MedConsults CRM

Single-clinic CRM and Out-Patient Department (OPD) booking platform for MedConsults (Bandra West, Mumbai).

## Project Overview

MedConsults CRM manages clinic operations across four distinct roles:
1. **Patient**: Browse approved doctors, book appointment slots, receive digital OPD queue pass (token + QR), access shared consultation notes.
2. **Doctor**: Manage daily consultation queue, appointments calendar, availability, and clinical notes.
3. **Staff / Receptionist**: Manage leads pipeline (Kanban/List), walk-in patient token issuance, appointment check-ins, tasks, and follow-ups.
4. **Admin**: Doctor approvals, user access management, clinic analytics, and audit logging.

---

## Tech Stack & Architecture

- **Backend**: Node.js (Active LTS), Express 5, TypeScript (strict mode), Mongoose, Zod.
- **Frontend**: React, Vite, TypeScript, Tailwind CSS, React Router.
- **Database**: MongoDB Atlas (`medconsults_crm` for development, `medconsults_crm_test` for testing).
- **Security**: Helmet, CORS with strict origin validation, express-mongo-sanitize, express-rate-limit, 10kb JSON payload cap, Zod environment validation.
- **Testing**: Vitest + Supertest for automated API tests.

---

## Directory Structure

```text
CRM_MedConsults/
├── backend/
│   ├── src/
│   │   ├── config/          # env.ts (Zod validation), db.ts (cached Mongoose connection)
│   │   ├── middleware/      # Auth, role guard, validation, error handler (empty placeholders)
│   │   ├── modules/         # Feature modules (empty placeholders)
│   │   ├── services/        # Service layer (empty placeholders)
│   │   ├── utils/           # Helper utilities (empty placeholders)
│   │   ├── app.ts           # Express app, middleware pipeline, health endpoints
│   │   └── server.ts        # Server entrypoint and graceful shutdown
│   ├── scripts/             # Database seed scripts (empty placeholder)
│   ├── tests/               # API tests (health & readiness checks)
│   ├── .env                 # Backend environment variables (git-ignored)
│   ├── .env.example         # Template for environment configuration
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── lib/             # env.ts (Vite env validation)
│   │   ├── App.tsx          # App router and placeholder home screen
│   │   ├── main.tsx         # React root mounting
│   │   └── index.css        # Tailwind CSS imports
│   ├── .env                 # Frontend environment variables (git-ignored)
│   ├── .env.example         # Template for frontend environment
│   └── package.json
├── design/stitch/           # Extracted design assets and UI reference
├── docs/
│   └── PROJECT_SPEC.md      # Full Product Requirements & Technical Specification
├── .gitignore
├── .cursorignore
└── README.md
```

---

## Getting Started & Configuration

### 1. Fill in Backend Environment Variables

Open `backend/.env`:
- `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` have been pre-generated as two distinct, secure 64-character hexadecimal values.
- You **must** provide your MongoDB connection strings:
  - Replace `MONGODB_URI=PASTE_MY_URI_HERE` with your Atlas development database URI (e.g., `mongodb+srv://<user>:<password>@cluster.mongodb.net/medconsults_crm?retryWrites=true&w=majority`).
  - Replace `MONGODB_URI_TEST=PASTE_MY_URI_HERE` with your Atlas test database URI (e.g., `mongodb+srv://<user>:<password>@cluster.mongodb.net/medconsults_crm_test?retryWrites=true&w=majority`).

> **Note:** The server and test runner validate environment variables using Zod at startup and will reject the placeholder string `PASTE_MY_URI_HERE` with a clear configuration error.

### 2. Frontend Environment Variables

`frontend/.env` is pre-configured with:
```env
VITE_API_BASE_URL=http://localhost:5000
```

---

## Running the Application

### Backend Commands

Run from the repository root:

- **Start in development mode (hot reload):**
  ```bash
  npm --prefix backend run dev
  ```
- **Typecheck:**
  ```bash
  npm --prefix backend run typecheck
  ```
- **Build TypeScript:**
  ```bash
  npm --prefix backend run build
  ```
- **Start compiled server:**
  ```bash
  npm --prefix backend start
  ```
- **Run API tests:**
  ```bash
  npm --prefix backend test
  ```

### Frontend Commands

Run from the repository root:

- **Start Vite dev server:**
  ```bash
  npm --prefix frontend run dev
  ```
  Opens at `http://localhost:5173`.
- **Typecheck:**
  ```bash
  npm --prefix frontend run typecheck
  ```
- **Build production bundle:**
  ```bash
  npm --prefix frontend run build
  ```

---

## Health & Readiness Endpoints

- **Liveness probe**: `GET http://localhost:5000/health`
  - Returns `200 OK` with `{ status: "ok", timestamp: ... }`. Does not query the database.
- **Readiness probe**: `GET http://localhost:5000/ready`
  - Returns `200 OK` with `{ status: "ready", database: "connected" }` when MongoDB is connected.
  - Returns `503 Service Unavailable` with `{ status: "not ready", database: "disconnected" }` when disconnected.
