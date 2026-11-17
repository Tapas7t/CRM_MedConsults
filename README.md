# MedConsults CRM

MedConsults CRM is a single-clinic customer relationship management (CRM) and out-patient department (OPD) booking platform designed for a clinic located in Bandra West, Mumbai. This is a portfolio project using fictional demo data only and is not intended for real clinical use.

## Project Status

Backend foundation complete: Express and TypeScript API initialized in strict mode, cached MongoDB database connection established, liveness (/health) and readiness (/ready) endpoints implemented, and automated integration tests configured. Frontend currently a placeholder React single-page application. Data models, authentication, business logic modules, and user interface screens are planned for subsequent phases.

## Planned Features

- Leads Pipeline: Capture inquiries, stage transitions, and conversion to registered patients.
- Patient 360: Comprehensive patient record, contact profile, and full interaction timeline.
- Appointments and OPD Queue: Appointment booking with slot conflict prevention and digital sequential OPD queue tokens.
- Tasks and Follow-ups: Task assignment, due date monitoring, and completion tracking.
- Clinical and Consultation Notes: Tiered note visibility (author-only clinical notes, patient-shared notes, internal staff notes).
- Reports: Operational metrics, lead sources, and doctor workload reporting.
- Audit Log: Logging of critical actions, access changes, and patient data views.
- Role-Based Access Control: Four distinct roles (patient, doctor, staff/receptionist, admin) with strict permission boundaries.

## Technology Stack

- Runtime: Node.js (Active LTS)
- Backend: Express, TypeScript, Mongoose, Zod
- Security and Utilities: Helmet, CORS, Express Rate Limit, Express Mongo Sanitize
- Frontend: React, Vite, TypeScript, Tailwind CSS, React Router
- Database: MongoDB Atlas
- Testing: Vitest, Supertest

## Architecture

The project is structured as a monorepo consisting of:
- Backend API: Express 5 application written in TypeScript providing RESTful JSON endpoints.
- Frontend SPA: React single-page application built with Vite and Tailwind CSS.
- Databases: Two separate MongoDB Atlas databases on a single cluster:
  - Development database: medconsults_crm
  - Test database: medconsults_crm_test (isolated; tests never touch development data)

## Folder Structure

```text
CRM_MedConsults/
├── backend/            Express and TypeScript API, configuration, tests, and scripts
├── design/ui-reference/ UI reference specifications, color tokens, and layout references
├── docs/               Detailed technical specification and architecture documentation
├── frontend/           React and Vite single-page application
├── .gitignore          Root Git ignore rules for secrets, dependencies, and build artifacts
└── README.md           Project overview, setup instructions, and architecture guide
```

## Getting Started

### Prerequisites

- Node.js (Active LTS version)
- Git
- MongoDB Atlas cluster account (or local MongoDB instance)

### Installation and Setup

1. Clone the repository:
```bash
git clone https://github.com/Tapas7t/CRM_MedConsults.git
cd CRM_MedConsults
```

2. Install backend and frontend dependencies:
```bash
npm --prefix backend install
npm --prefix frontend install
```

3. Configure environment files:
- Copy backend template:
  ```bash
  cp backend/.env.example backend/.env
  ```
- Copy frontend template:
  ```bash
  cp frontend/.env.example frontend/.env
  ```

4. Populate environment variables:
- Open backend/.env and configure your MongoDB connection string and JWT secrets.
- Open frontend/.env and verify the API base URL.

### Running the Application

Execute these commands from the project root:

- Start backend development server:
  ```bash
  npm --prefix backend run dev
  ```
- Start frontend development server:
  ```bash
  npm --prefix frontend run dev
  ```
- Run backend integration tests:
  ```bash
  npm --prefix backend test
  ```

## Environment Variables

### Backend (backend/.env)

| Variable | Purpose |
| --- | --- |
| NODE_ENV | Runtime environment (development, test, production) |
| PORT | Port on which the Express server listens |
| MONGODB_URI | MongoDB connection string for development |
| MONGODB_URI_TEST | MongoDB connection string for automated testing |
| JWT_ACCESS_SECRET | Secret key for signing short-lived access tokens (minimum 32 characters) |
| JWT_REFRESH_SECRET | Secret key for signing long-lived refresh tokens (minimum 32 characters) |
| JWT_ACCESS_EXPIRES_IN | Expiration duration for access tokens |
| JWT_REFRESH_EXPIRES_IN | Expiration duration for refresh tokens |
| CLIENT_URL | URL of the frontend application for redirection |
| CORS_ORIGINS | Comma-separated list of allowed origins for CORS |

### Frontend (frontend/.env)

| Variable | Purpose |
| --- | --- |
| VITE_API_BASE_URL | Base URL of the backend API |

## Scripts

### Backend Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| dev | tsx watch src/server.ts | Runs the development server with live reload |
| build | tsc | Compiles TypeScript into JavaScript in dist/ |
| start | node dist/server.js | Runs the compiled production server |
| test | vitest run | Executes automated API test suite |
| typecheck | tsc --noEmit | Validates TypeScript types across the backend |

### Frontend Scripts

| Script | Command | Purpose |
| --- | --- | --- |
| dev | vite | Starts the Vite local development server |
| build | tsc -b && vite build | Compiles TypeScript and builds production bundle |
| preview | vite preview | Previews the production build locally |
| typecheck | tsc -b --noEmit | Validates TypeScript types across the frontend |

## Testing

Backend integration tests are executed using Vitest and Supertest. All tests run against the dedicated test database (medconsults_crm_test) and clean up after execution. Tests never connect to or modify development data.

## Security Notes

- Secrets, credentials, and private keys reside exclusively in environment files (.env) and are excluded from version control by .gitignore.
- All patient, practitioner, appointment, and contact data used in this project is strictly fictional demo data.

## Documentation

For full product requirements, data models, business rules, and API specifications, refer to:
[docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md)

## Roadmap

- [x] Phase 0: Repository, git initialization, environment setup
- [x] Phase 1: Backend skeleton, configuration, database connection, health endpoints, tests
- [ ] Phase 2: MongoDB schemas, models, and indexing
- [ ] Phase 3: Authentication, role verification, email validation, account lockout
- [ ] Phase 4: Core modules (doctors, patients, leads, appointments, OPD queue)
- [ ] Phase 5: Secondary modules (notes, tasks, activities, notifications, reports, audit log)
- [ ] Phase 6: Frontend design tokens, layout shell, routing, authentication state
- [ ] Phase 7: Role-specific screen implementations wired to API
- [ ] Phase 8: Live OPD queue via WebSockets and automated reminder service
- [ ] Phase 9: Accessibility review, layout optimization, polish
- [ ] Phase 10: Production deployment and end-to-end verification
