# ProctorED

ProctorED is a modern, high-integrity online proctoring and examination platform tailored for tuition centers, educators, and academic institutions. It enables teachers to author examinations, distribute one-click student access codes, monitor live sessions, and track proctoring telemetry with anti-cheat protection.

---

## Key Features

### For Teachers & Educators
- **Overview Dashboard:** Live KPI cards for active examinations, total submissions, drafts, and quick-action cards for currently running tests.
- **Examination Creation Wizard:** Author multi-format tests with questions (MCQ, True/False, Numerical, Short Answer), custom positive/negative marking schemes, and strict duration controls.
- **Live Sharing & Distribution:** Instant 6-character examination code generation and pre-formatted WhatsApp invitation templates for students.
- **Proctoring Telemetry & Grading:** Auto-scoring on submission, manual review overrides, and audit logs tracking tab-switching, fullscreen exits, and camera status changes.
- **Safe Lifecycle Management:**
  - **Deletion with Guards:** Prevents deleting live examinations; enforces typed confirmation codes for exams with recorded student submissions.
  - **Archival & Restoration:** Safely hide past examinations from active lists without deleting student academic history or integrity logs.
  - **Audit Logging:** System logs for critical mutations (`TEST_DELETED`, `TEST_ARCHIVED`, `TEST_RESTORED`).

### For Students
- **Zero-Friction Access:** No app download or account creation required; access exams via test code and roll number.
- **Pre-Test Camera & Environment Setup:** Hardware and permission checks prior to entering the exam window.
- **Secure Test Interface:** Timed fullscreen examination workspace with local answer sync, heartbeat connection resilience, and automatic submission upon expiration.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack, Server Components) |
| **UI & Styling** | [React 19](https://react.dev/), [Tailwind CSS v4](https://tailwindcss.com/) with custom design system |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/), [Prisma ORM 6](https://www.prisma.io/) |
| **Authentication** | [Neon Auth](https://neon.tech/docs/guides/neon-auth) / Managed Auth with Teacher RBAC |
| **Validation** | [Zod](https://zod.dev/) |
| **State Management** | [Zustand](https://zustand-demo.pmnd.rs/) |
| **Testing** | [Vitest](https://vitest.dev/) (Unit & Integration), [Playwright](https://playwright.dev/) (E2E) |

---

## Getting Started

### Prerequisites
- **Node.js**: `v20.x` or higher
- **npm** or **pnpm**
- **PostgreSQL**: A running PostgreSQL instance (or cloud instance such as Neon, Supabase, or AWS RDS)

### 1. Clone & Install Dependencies

```bash
git clone <repository-url>
cd proctor-ed
npm install
```

### 2. Environment Configuration

Copy the example environment file and update with your credentials:

```bash
cp .env.example .env
```

Key environment variables:
```env
# PostgreSQL Database Connection
DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"

# Neon Auth Configuration
NEON_AUTH_BASE_URL="https://your-neon-auth-url.neon.tech"
NEON_AUTH_COOKIE_SECRET="your-32-char-minimum-cookie-secret"
AUTH_SECRET="your-32-char-random-secret"
AUTH_URL="http://localhost:3000"

# Storage Configuration (local for dev, s3 for production)
STORAGE_PROVIDER="local"

# Public App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Optional Seed Credential for Local Testing
SEED_TEACHER_PASSWORD="teacher123"
```

### 3. Database Setup & Seeding

Push the schema to your database and generate Prisma Client:

```bash
# Push schema to database
npm run db:push

# Generate Prisma Client
npm run db:generate

# (Optional) Seed the database with demo tests and teacher account
npm run db:seed
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
- **Teacher Portal:** [http://localhost:3000/login](http://localhost:3000/login)
- **Student Exam Portal:** [http://localhost:3000/exam](http://localhost:3000/exam)

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Starts the Next.js development server with Turbopack |
| `npm run build` | Builds the production bundle and validates static/dynamic routes |
| `npm run start` | Starts the production server |
| `npm run lint` | Runs ESLint to check for linting errors |
| `npm test` | Runs the Vitest integration & unit test suite |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run test:e2e` | Runs Playwright end-to-end test scenarios |
| `npm run db:push` | Pushes Prisma schema changes directly to the database |
| `npm run db:generate` | Generates the latest Prisma client types |
| `npm run db:seed` | Seeds the database with default records |
| `npm run db:studio` | Opens Prisma Studio to inspect database records in the browser |

---

## Project Structure

```
proctor-ed/
├── app/                             # Next.js App Router
│   ├── api/                         # Backend API routes
│   │   ├── auth/                    # Auth and user provisioning
│   │   ├── student/                 # Student attempt verification, answers, heartbeats
│   │   └── tests/                   # Teacher test CRUD, publish, archive, delete, results
│   ├── dashboard/                   # Teacher Overview Dashboard
│   ├── exam/                        # Student examination flow ([code]/setup, attempt, complete)
│   ├── login/ & signup/             # Teacher authentication views
│   └── tests/                       # Examinations list, authoring wizard, results view
├── components/                      # Shared & feature-specific React components
│   ├── exam/                        # Proctoring camera setup, exam runner, questions
│   ├── teacher/                     # Sidebar, header, dialogs, tests list, dashboard views
│   └── ui/                          # Design system primitives (Button, Dialog, Toast, Badge)
├── lib/                             # Application core logic & utilities
│   ├── auth/                        # Server & client auth helpers, RBAC permissions
│   ├── db/                          # Prisma database client singleton
│   ├── exam/                        # Scoring engine, state machine, token generation
│   ├── utils/                       # Formatting, API responses, rate limiter
│   └── validation/                  # Zod validation schemas
├── prisma/                          # Database schema & migrations
│   ├── schema.prisma                # Models: User, Test, Question, Attempt, Answer, ProctoringEvent, AuditLog
│   └── seed.ts                      # Initial seed script
└── tests/                           # Automated test suites
    ├── integration/                 # API & auth security integration tests
    └── unit/                        # Unit tests for scoring, state machine, token hashing
```

---

## Security & Anti-Cheating Architecture

- **Token Protection:** Student attempt tokens are randomly generated and hashed before storage; browser tokens are served via `HttpOnly` cookies.
- **Heartbeat Verification:** Student sessions broadcast periodic heartbeats (`/api/student/attempts/[id]/heartbeat`) to monitor continuous connection and flag inactive attempts.
- **Proctoring Incident Logs:** Events (`TAB_SWITCH`, `FULLSCREEN_EXIT`, `CAMERA_DISCONNECTED`) are time-stamped and scored to compute an aggregate session risk score.
- **Transactional Consistency:** Critical mutations (attempt submission, reordering, cascading exam deletion) execute within atomic Prisma transactions.

---

## License

Private & Proprietary. All rights reserved.
