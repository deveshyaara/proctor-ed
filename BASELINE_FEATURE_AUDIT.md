# ProctorED — Baseline Feature-Completeness Audit

> **Method**: Every finding is derived from reading actual source files.
> Each item cites the specific file and line or API route as evidence.
> No item is marked CONFIRMED unless the implementation was traced end-to-end.

---

## A. Core Exam Flow

### A1. Student enters test code → identity form
**Status: CONFIRMED WORKING**

Evidence: `app/exam/[code]/page.tsx`
- Fetches `GET /api/student/tests/${code}` on load; blocks if test not PUBLISHED.
- Name + roll-number form with client validation (name >= 2 chars, roll required).
- On submit: `POST /api/student/attempts` with `{ testCode, studentName, rollNumber }`.

---

### A2. Attempt creation: rate limit, maxAttempts, time-window, cookie
**Status: CONFIRMED WORKING**

Evidence: `app/api/student/attempts/route.ts` lines 1-130
- IP-based rate limit via `checkRateLimit` (ATTEMPT_CREATE policy).
- Zod-validated identity schema.
- Status checks: DRAFT/ARCHIVED -> 404; CLOSED -> 403; startAt/endAt enforced.
- Transactional maxAttempts check per rollNumber (race-condition safe).
- HttpOnly cookie issued (sameSite: strict, maxAge: 6h).

---

### A3. Camera setup + fullscreen check -> server-side timer seed
**Status: CONFIRMED WORKING**

Evidence: `app/exam/[code]/setup/page.tsx` and `app/api/student/attempts/[id]/start/route.ts`
- iPhone detected -> hard block. Fullscreen API absent -> hard block.
- Double-click guard via startingRef. Fullscreen requested BEFORE any async calls (preserves user gesture token).
- POST /start: sets startedAt, expiresAt = startedAt + durationSeconds. Persists server-generated questionOrder and optionOrderMap. IDEMPOTENT if already IN_PROGRESS.

---

### A4. Exam page: per-question answer save with local buffer
**Status: CONFIRMED WORKING**

Evidence: `components/exam/ExamEngine.tsx` lines 47-58, 153-164, 218-233
- On mount: reads localStorage cache, merges with server-fetched initialAnswers.
- AnswerSyncManager debounces 400ms then POST /api/student/attempts/[id]/answer.
- Server: validates ownership, expiry, question membership; upserts answer idempotently.

---

### A5. Countdown timer + server-authoritative heartbeat expiry
**Status: CONFIRMED WORKING**

Evidence: `ExamEngine.tsx` lines 166-201
- Client countdown: setInterval every 1s from server-issued expiresAt. At remaining <= 0 -> auto-submit via stable ref.
- Heartbeat: setInterval every 30s -> POST /heartbeat. Returns { expired, expiresAt, serverTime, status }. If expired=true -> auto-submit.
- Heartbeat server updates lastHeartbeatAt and returns expiry flag.

---

### A6. Submit -> atomic scoring -> completion page
**Status: CONFIRMED WORKING**

Evidence: `lib/exam/submission.ts`
- executeAttemptSubmission() uses updateMany with status condition - only one concurrent caller succeeds.
- Scores all 4 types via scoreAttempt(). Bulk-updates Answer.isCorrect and marksAwarded.
- Completion page reads cookie, looks up attempt, displays score if showResultImmediately=true.

---

## B. Teacher Authoring

### B1. Create test (4-step wizard)
**Status: CONFIRMED WORKING**

Evidence: `app/tests/create/page.tsx` lines 17-225
- Steps: Details -> Questions -> Settings -> Review and Publish.
- All proctoring toggles configurable in Step 3.
- Final step: POST /api/tests -> loop POST questions -> POST publish. Shows test code in success dialog.

---

### B2. Add/edit/delete questions - all 4 types
**Status: CONFIRMED WORKING**

Evidence: `prisma/schema.prisma` lines 29-34; questions API routes
- QuestionType enum: MCQ, TRUE_FALSE, NUMERICAL, SHORT_ANSWER.
- POST creates; PATCH updates any field; DELETE uses two-phase reorder transaction to keep order gapless.
- All mutations blocked on PUBLISHED-with-attempts or CLOSED/ARCHIVED.

---

### B3. Question reorder
**Status: CONFIRMED WORKING**

Evidence: `app/api/tests/[id]/questions/reorder/route.ts`
- Validates full permutation (count must match, 1..N continuous, no duplicates, all IDs belong to test).
- Two-phase transaction: phase 1 assigns negative slots; phase 2 assigns final values. Avoids unique constraint collisions.

---

### B4. Publish / Close / Archive / Restore lifecycle
**Status: CONFIRMED WORKING**

Evidence: routes in `app/api/tests/[id]/`
- Publish: DRAFT only, requires >=1 question. Sets publishedAt.
- Close: PUBLISHED only. Sets closedAt. In-progress attempts can still submit.
- Archive: blocked if any IN_PROGRESS attempts. AuditLog written. Idempotent if already ARCHIVED.
- Restore: ARCHIVED only. Smart target: -> CLOSED if attempts exist, -> DRAFT if none. AuditLog written.

---

### B5. Delete test
**Status: CONFIRMED WORKING**

Evidence: `app/api/tests/[id]/route.ts` lines 86-190
- Blocked if PUBLISHED.
- Requires typed confirmationCode matching testCode if attempts exist.
- 6-step atomic transaction: answers -> proctoring events -> attempts -> questions -> AuditLog -> test.

---

### B6. Teacher results page
**Status: CONFIRMED WORKING**

Evidence: `app/api/tests/[id]/results/route.ts`
- Cursor-paginated (50/page). Per-attempt: name, roll, status, score, riskScore, warningCount, event count.
- Summary stats (avg/highest/lowest) computed from ALL attempts, not just current page.
- UI: Review Log modal, View Student Answers modal (implemented in prior session).

> NOTE: summary.totalAttempts bug documented in GAP-5 below.

---

## C. Reliability

### C1. Answer persistence across page refresh
**Status: CONFIRMED WORKING**

- ExamEngine initialises from localStorage merged with server-fetched initialAnswers.
- Navigating back to /exam/[code]/attempt/[attemptId] re-fetches saved answers server-side and passes them as initialAnswers.

---

### C2. Idempotent submit (race-condition safe)
**Status: CONFIRMED WORKING**

- executeAttemptSubmission uses conditional updateMany - only one concurrent request transitions status. Losers receive already-recorded score idempotently.

---

### C3. Rate limiting
**Status: CONFIRMED WORKING**

- attempt_create: per-IP. answer_sync: per-attempt. event_ingest: per-attempt. All use RATE_LIMIT_POLICIES constants.

---

### C4. beforeunload guard
**Status: CONFIRMED WORKING**

- ExamEngine.tsx lines 204-216: window.addEventListener('beforeunload') warns student on navigation away mid-exam.

---

## D. Non-AI Proctoring

### D1. Fullscreen enforcement
**Status: CONFIRMED WORKING**

Evidence: `components/exam/ProctoringGuard.tsx` lines 122-163
- Listens to all 4 vendor variants: fullscreenchange, webkitfullscreenchange, mozfullscreenchange, MSFullscreenChange.
- On exit: logs FULLSCREEN_EXIT (HIGH), shows violation dialog, renders sticky orange banner.
- Server overrides client severity with authoritative map (FULLSCREEN_EXIT -> HIGH always); increments warningCount atomically.

---

### D2. Tab switch detection
**Status: CONFIRMED WORKING**

Evidence: `ProctoringGuard.tsx` lines 83-120
- visibilitychange (tab hidden -> TAB_SWITCH HIGH) + window.blur (focus lost -> TAB_SWITCH LOW).
- 3-second per-type debounce prevents duplicate logs.

---

### D3. Copy/paste/context menu prevention
**Status: CONFIRMED WORKING**

Evidence: `ProctoringGuard.tsx` lines 165-190
- copy and paste: e.preventDefault() + logs COPY_PASTE_DETECTED MEDIUM.
- contextmenu: e.preventDefault() (no log, just blocked).

---

### D4. Warning count -> auto-terminate
**Status: CONFIRMED WORKING**

Evidence: `app/api/student/attempts/[id]/event/route.ts` lines 64-102
- HIGH severity increments warningCount atomically in same transaction as event creation.
- If warningCount >= warningLimit -> executeAttemptSubmission(id, 'AUTO_SUBMITTED') called in-transaction.
- Client: on data.autoTerminated=true -> calls handleFinalSubmitRef.current(true).

---

### D5. Unsupported device/browser block
**Status: CONFIRMED WORKING**

Evidence: `app/exam/[code]/setup/page.tsx` lines 18-26
- isIPhoneDevice() -> hard block. !isFullscreenSupported() -> hard block.
- Runs via useSyncExternalStore (SSR-safe, no hydration mismatch).

---

## E. Gaps

### GAP-1: showCorrectAnswers - stored but never consumed
**Status: RESOLVED & REGRESSION-TESTED**

- Location: `app/exam/[code]/complete/page.tsx`, `app/api/student/attempts/[id]/answers/route.ts`, `lib/exam/studentAnswers.ts`, `components/exam/StudentAnswerBreakdown.tsx`
- Fix Applied:
  - Created student answers helper `lib/exam/studentAnswers.ts` with strict ownership authentication (`requireAttemptOwnership`) and terminal-status gating (`SUBMITTED`/`AUTO_SUBMITTED`).
  - Implemented `GET /api/student/attempts/[id]/answers` returning question breakdown, student selections, canonical correct answers, marks awarded, and explanations.
  - Enforced three-way settings matrix:
    - If `showResultImmediately: false`: both score and answers are withheld (suppressed from payload).
    - If `showResultImmediately: true` and `showCorrectAnswers: false`: score is shown, answer breakdown is suppressed.
    - If `showResultImmediately: true` and `showCorrectAnswers: true`: both score and per-question breakdown with answers and explanations are returned.
  - Updated `app/exam/[code]/complete/page.tsx` to render the per-question breakdown below the score card reusing the teacher Answer Sheet visual pattern (`StudentAnswerBreakdown.tsx`).
- Regression Test Added: `tests/integration/student/studentAnswers.test.ts`
  - Verifies rejection of unauthenticated requests (401 UNAUTHORIZED) and cross-student IDOR requests (401/403).
  - Verifies non-terminal attempt protection (409 INVALID_TRANSITION).
  - Verifies withheld results state (`showResultImmediately: false`) suppresses both score and question breakdown.
  - Verifies `showCorrectAnswers: false` returns score only without question breakdown.
  - Verifies `showCorrectAnswers: true` returns full question breakdown with canonical options, student answers, scoring marks, and explanations.
  - Verifies MCQ option-order and question-order resolution.
- Result: Passing (100% test pass rate across all 9 regression tests).

---

### GAP-2: autoSubmitOnExpiry toggle has no effect
**Status: PARTIALLY IMPLEMENTED (stored, not enforced)**

- Stored in settings; passed as settings.autoSubmitOnExpiry prop to ExamEngine.
- ExamEngine.tsx timer effect (lines 167-180) calls handleFinalSubmitRef.current(true) unconditionally when remaining <= 0. The settings.autoSubmitOnExpiry prop is never read in this block.
- Effect: unchecking the toggle has no behavioural effect. Exam always auto-submits on expiry.
- Risk: LOW. Always auto-submitting is the safer default. But the toggle is misleading.

---

### GAP-3: Question image support - schema only, no feature
**Status: NOT IMPLEMENTED**

- Schema: Question.imageUrl (String?) and Question.imageKey (String?) exist in prisma/schema.prisma lines 138-139.
- grep for "imageUrl|image|upload" in app/api/ -> 0 results. No upload endpoint exists.
- No image input in QuestionEditor. QuestionCard never renders an image.
- Effect: image-based questions (diagrams, graphs, passages) cannot be created or displayed.
- Risk: MEDIUM. Common requirement for science and maths assessments.

---

### GAP-4: startAt/endAt time window - API enforces, teacher UI cannot set
**Status: PARTIALLY IMPLEMENTED**

- API: POST /api/student/attempts (lines 55-62) and POST .../start (lines 32-44) both enforce startAt/endAt.
- Schema: both fields are DateTime? on Test model.
- Validation: createTestSchema and updateTestSchema accept startAt/endAt.
- Teacher UI gap: grep for startAt in app/tests/ -> 0 results. Create wizard has no date/time inputs. Edit page also has none.
- Effect: teachers cannot schedule a test to open or close at a specific time via the UI. Fields can only be set by calling the API directly.
- Risk: MEDIUM. Scheduling is a natural expectation for a timed exam platform.

---

### GAP-5: summary.totalAttempts reports page count not total count
**Status: RESOLVED & REGRESSION-TESTED**

- Location: `app/api/tests/[id]/results/route.ts` line 57
- Fix Applied: Replaced `totalAttempts: items.length` with `totalAttempts: allAttempts.length`.
- Regression Test Added: `tests/integration/teacher/resultsSummary.test.ts`
  - Verifies that when a test has >50 attempts (e.g. 75), `summary.totalAttempts` returns the true total (75) rather than the page limit (50).
  - Verifies that the paginated `attempts` list remains strictly capped at 50 items and `nextCursor` continues to point to the 50th item.
  - Verifies that tests with <=50 attempts return `nextCursor: null` and accurate summary stats.
- Result: Passing (100% test pass rate across all teacher integration suites).

---

### GAP-6: Manual grading override
**Status: NOT IMPLEMENTED**

- Evidence: `app/api/tests/[id]/attempts/[attemptId]/answers/route.ts` only exports `GET` (read-only audit). No PATCH/PUT endpoint exists for `Answer` records.
- UI: `app/tests/[id]/results/ResultsClient.tsx` lines 610-630 renders student question responses using read-only badge tags (`✓ Correct (+X m)` / `✗ Incorrect (Y m)`) without any form controls, input fields, or override triggers.
- Scoring Engine: `lib/exam/scoring.ts` lines 80-90 scores `SHORT_ANSWER` types via exact string comparison: `ans.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase()`.
- Effect: Legitimate student responses that differ by punctuation, alternative phrasing, synonyms, or mathematical notation are automatically awarded 0 marks with no administrative path for teachers to adjust or override the grade.
- Risk: HIGH. Directly causes incorrect student grades in any non-MCQ examination.

---

### GAP-7: Test preview mode
**Status: NOT IMPLEMENTED**

- Evidence: No `/preview` route exists in `app/`. `ExamEngine.tsx` has no preview flag, sandbox mode, or bypass prop.
- UI: `app/tests/[id]/page.tsx` and `TestDetailClient.tsx` offer no "Preview Exam" or "Simulate Student" buttons.
- Immutability Conflict: If a teacher attempts to test their exam via `/exam/[testCode]`, a real `Attempt` record is created. Once `test._count.attempts > 0`, the test is locked under `EXAM_IMMUTABLE` (`app/api/tests/[id]/route.ts` line 46), permanently blocking any edits to questions, marks, options, or settings.
- Risk: MEDIUM. Teachers cannot verify student UX, timer behavior, or question presentation before committing the test.

---

### GAP-8: Result release control (Batch release gate)
**Status: PARTIALLY IMPLEMENTED (per-test boolean only; no batch release gate)**

- Evidence: `prisma/schema.prisma` lines 100-127 and `lib/validation/test.ts` lines 5-15 define `showResultImmediately: boolean` in `test.settings`.
- When enabled (`true`): Students view their score and percentage immediately on submission (`app/exam/[code]/complete/page.tsx` lines 91-107).
- When disabled (`false`): The completion screen displays: *"Result publication has been withheld for teacher moderation. Your instructor will release final scores shortly."* (`complete/page.tsx` lines 109-112).
- Gap: There is NO batch release action, no "Publish Results" button in the teacher UI, no scheduled release timestamp, and no student portal or lookup route where withheld scores can ever be accessed later. Withheld scores remain permanently inaccessible unless the teacher manually updates `showResultImmediately: true` via API/edit and students reload the complete page within their 6-hour auth cookie lifespan.
- Risk: MEDIUM. Renders delayed/moderated grading unusable for students.

---

### GAP-9: Re-entry lockout on lost cookie during crash
**Status: RESOLVED & REGRESSION-TESTED**

- Evidence: `app/api/student/attempts/route.ts`.
- Fix Applied: Before the `maxAttempts` count check, the route now queries for an existing `IN_PROGRESS` attempt matching the same `testId` + `rollNumber`. If found, a fresh auth cookie (`pe_at_${attempt.id}`) is re-issued for that attempt and returned with HTTP 200, transparently re-attaching the student to their ongoing session. The `maxAttempts` guard was also tightened to count only terminal/active statuses (`IN_PROGRESS`, `SUBMITTED`, `AUTO_SUBMITTED`), excluding `CREATED` attempts from the cap.
- Regression Test Added: `tests/integration/student/lostCookieReentry.test.ts`
  - Verifies that a student with an `IN_PROGRESS` attempt and no cookie receives a 200 with a fresh cookie pointing to their existing attempt.
  - Verifies that a student with only `SUBMITTED` attempts (no active attempt) correctly receives `403 MAX_ATTEMPTS_EXCEEDED`.
  - Verifies that a student under `maxAttempts` with no existing active attempt can create a new attempt normally.

---

### GAP-10: Question bank / question reuse
**Status: NOT IMPLEMENTED**

- Evidence: `prisma/schema.prisma` lines 133-150 (`Question` has a single `testId` foreign key with `@@unique([testId, order])`).
- No `QuestionBank`, `QuestionTemplate`, tag library, or cross-test question relations exist.
- No "duplicate test", "import questions", or "export questions" features exist in `app/api/tests/` or teacher UI.
- Risk: LOW. Efficiency gap; does not block basic single-test creation.

---

### GAP-11: Data retention and automated cleanup policy
**Status: NOT IMPLEMENTED**

- Evidence: `prisma/schema.prisma` lines 79-245. No TTL fields, scheduled cron tasks, retention timestamps, or automated purging routines exist in `package.json` or `app/api/`.
- Effect: Student PII (names, roll numbers), answers, and proctoring event telemetry (including facial bounding boxes, gaze deviation metrics, face counts) persist in PostgreSQL indefinitely until an entire test is manually deleted.
- Risk: LOW (operational/compliance risk; does not block basic testing functionality).

---

### GAP-12: Centralized error monitoring and boundaries
**Status: NOT IMPLEMENTED**

- Evidence: `package.json` contains no error monitoring SDKs (`@sentry/nextjs`, Datadog, Bugsnag, Rollbar). No `error.tsx` or `global-error.tsx` route handlers exist in `app/`.
- Effect: Unhandled client and server runtime exceptions are logged only to ephemeral stdout/stderr console streams; production issues have no automated alerting or telemetry aggregator.
- Risk: LOW (observability gap).

---

## F. Items verified as not missing

| Feature | Evidence |
|---|---|
| Teacher login / session | requireTeacherApi() / requireTeacher() on every protected route |
| Teacher owns test guard | teacherId check on every mutating route |
| Student cannot reach teacher routes | All teacher routes call requireTeacherApi() |
| Test code normalisation | normalizeTestCode() used on student entry |
| Negative marks scoring | negativeMarks field in schema; handled in scoreAttempt() |
| Randomise questions and options | Server-generated, persisted in questionOrder and optionOrderMap |
| Pagination | Cursor-based on test list and results |
| AuditLog for destructive actions | Archive, Restore, Delete all write AuditLog entries |
| Process crash recovery | LocalStorage persists across SIGKILL; server-authoritative timer resumes from `expiresAt` |
| Attempt immutability boundary | Only `IN_PROGRESS`/`SUBMITTED`/`AUTO_SUBMITTED` attempts block test & question edits; `CREATED` attempts do not (see H4 fix) |

---

## G. Gap Priority

Ranked strictly by **"blocks smooth basic-level use"**:

| Priority | Gap | Status | Justification |
|---|---|---|---|
| — | **GAP-1: showCorrectAnswers dead control** | ✅ RESOLVED | Stored setting now consumed by student complete page and dedicated API route. Full solutions and explanations rendered. |
| 2 | **GAP-6: Manual grading override** | NOT IMPLEMENTED | Free-text short answers are strictly matched verbatim against `correctAnswer`. Any valid alternate phrasing or syntax variation is scored 0 with zero teacher override mechanism. |
| 3 | **GAP-3: Question image support** | NOT IMPLEMENTED | Blocks entire categories of STEM and diagram-based questions. Schema fields exist but no upload endpoint or UI components. |
| 4 | **GAP-4: startAt/endAt scheduling UI** | PARTIALLY IMPLEMENTED | Window enforcement exists in API and DB schema, but teachers cannot set or view test start/end times in the UI. |
| 5 | **GAP-7: Test preview mode** | NOT IMPLEMENTED | Teachers cannot test an exam without publishing it live and creating a real attempt, which permanently triggers `EXAM_IMMUTABLE` and locks future edits. |
| 6 | **GAP-8: Result release control** | PARTIALLY IMPLEMENTED | Disabling immediate results displays a moderation notice to students, but provides no teacher batch-release mechanism or student results lookup portal. |
| — | **GAP-9: Re-entry lockout on lost cookie** | ✅ RESOLVED | Re-issues auth cookie for existing `IN_PROGRESS` attempt. `maxAttempts` check now excludes `CREATED` attempts. |
| 8 | **GAP-2: autoSubmitOnExpiry toggle** | PARTIALLY IMPLEMENTED | Stored in settings but ignored by ExamEngine; timer always auto-submits. Safe default, but misleading control. |
| 9 | **GAP-10: Question bank / reuse** | NOT IMPLEMENTED | No question sharing or test duplication. All tests must be authored from scratch. |
| 10 | **GAP-11: Data retention policy** | NOT IMPLEMENTED | Student PII and proctoring telemetry persist indefinitely; no automated purging or retention jobs. |
| 11 | **GAP-12: Centralized error monitoring** | NOT IMPLEMENTED | No Sentry or global error boundaries; errors visible only via server console stdout. |
| — | **GAP-5: totalAttempts count** | ✅ RESOLVED | Fixed in `route.ts` via `allAttempts.length`. Verified with regression test suite. |

---

## H. Extended Baseline Audit (8 Fall-Through Items)

### H1. Manual grading override
**Status: NOT IMPLEMENTED**
- **API Investigation**: `app/api/tests/[id]/attempts/[attemptId]/answers/route.ts` contains only a `GET` method. No `PATCH` or `PUT` route exists anywhere under `api/tests/[id]/attempts/` to update `Answer.isCorrect` or `Answer.marksAwarded`.
- **UI Investigation**: `app/tests/[id]/results/ResultsClient.tsx` lines 610-635 renders question cards with static badges (`✓ Correct (+{q.marksAwarded} m)` or `✗ Incorrect ({q.marksAwarded} m)`). The modal contains no input fields, edit buttons, or score adjustment handlers.
- **Scoring Engine**: `lib/exam/scoring.ts` lines 80-90 scores `SHORT_ANSWER` by:
  ```ts
  const isCorrect = ans.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase();
  ```
- **Finding**: Auto-scoring on free-text short answers strictly requires verbatim character equality (modulo casing and whitespace). Any valid student response with different phrasing (e.g. "Newton's second law" vs "F=ma") is marked incorrect and awarded 0 marks, with no API or UI pathway for the teacher to correct the score.

---

### H2. Result release control
**Status: PARTIALLY IMPLEMENTED (Uniform per-test boolean only; no batch release gate)**
- **Configuration**: `prisma/schema.prisma` line 113 and `lib/validation/test.ts` line 11 expose `showResultImmediately: z.boolean().default(true)`. This is a per-test uniform setting configured during test creation.
- **Student Completion Experience**: `app/exam/[code]/complete/page.tsx` lines 91-112:
  - If `showResultImmediately: true`: Renders score card with `attemptScore / maxScore` and percentage.
  - If `showResultImmediately: false`: Renders: *"Result publication has been withheld for teacher moderation. Your instructor will release final scores shortly."*
- **Missing Release Pathway**: There is no API route (e.g. `POST /api/tests/[id]/release-results`), no database field (`resultsReleasedAt`), no UI button on the results dashboard, and no student portal where a student can subsequently enter their test code and roll number to check their published grade. Once withheld, results cannot be viewed by students unless the teacher toggles the setting to `true` and the student re-opens the complete page before their 6-hour auth cookie expires.

---

### H3. Resume after actual browser crash (not just refresh)
**Status: CONFIRMED WORKING when the auth cookie survives the crash; re-entry fails when it does not (see GAP-9)**
- **Test Methodology**: Executed live Playwright test against running server using persistent user data profiles (`launchPersistentContext`). Entered exam, answered questions, verified answer sync to PostgreSQL and LevelDB LocalStorage (`pe_attempt_${attemptId}_answers`), and simulated an unclean crash via OS-level `taskkill /F /PID` on the Chromium browser process. Re-launched browser with identical profile and navigated to `/exam/[code]/attempt/[attemptId]`.
- **Scope of verification**: Because `launchPersistentContext` keeps the Chromium profile on disk, the `pe_at_${attemptId}` HttpOnly cookie survived the forced kill. This test only validates the cookie-intact recovery path. The cookie-lost path (e.g. a device-level crash that corrupts the profile, or a different browser being used to re-enter) was NOT exercised here — that failure mode is separately documented and fixed in GAP-9.
- **Findings**:
  1. **Answer Restoration**: Answers persisted in both PostgreSQL (`prisma.answer.findMany`) and LocalStorage. Upon recovery, `ExamEngine` successfully repopulated the answers into state and marked option radios / text inputs as selected.
  2. **Timer Authority**: The countdown timer did NOT reset to full duration. `ExamEngine` lines 61-64 computes `timeLeftSeconds` from `(new Date(expiresAt).getTime() - Date.now()) / 1000`. Elapsed wall-clock time during the crash was accurately subtracted.
  3. **Auto-Submit on Expiry**: If the browser is killed and reopened after `expiresAt`, `app/exam/[code]/attempt/[attemptId]/page.tsx` line 50 (`isAttemptExpired`) catches it on initial server render and redirects immediately to `/complete?auto=true`.

---

### H4. Edit-after-attempts-started protection
**Status: FIXED — immutability boundary narrowed to active/terminal attempts only**
- **Original behaviour**: `test._count.attempts > 0` counted ALL attempt records including `CREATED` status (roll number entered, timer not yet started). A student merely landing on the identity form and submitting their name permanently locked the test.
- **Fix applied**: The `_count.attempts` query across all 4 affected routes (`/api/tests/[id]/route.ts`, `/questions/route.ts`, `/questions/[qid]/route.ts`, `/questions/reorder/route.ts`) was replaced with a filtered Prisma count that only includes `IN_PROGRESS`, `SUBMITTED`, and `AUTO_SUBMITTED` attempts. `CREATED` attempts (identity captured, exam not yet started) no longer trigger `EXAM_IMMUTABLE`.
- **Rationale**: A `CREATED` attempt has no answers, no timer, and no score — no data-integrity risk exists from editing the test at that point. The integrity boundary only matters once a student has started the timer (`IN_PROGRESS`) and answers are being committed.
- **Regression test added**: `tests/integration/teacher/examImmutability.test.ts` — verifies that `CREATED` attempts do not block edits while `IN_PROGRESS`/`SUBMITTED`/`AUTO_SUBMITTED` attempts do.

---

### H5. Question bank / reuse
**Status: NOT IMPLEMENTED**
- **Schema**: `prisma/schema.prisma` lines 133-150. `Question` has a single direct reference `testId String` with `@@unique([testId, order])`. There is no `QuestionBank`, `QuestionTemplate`, tag entity, or many-to-many relationship.
- **API & UI**: Grep for "duplicate", "clone", "import", or "bank" yields 0 results across `app/api/` and `components/teacher/`.
- **Finding**: Every test's question set is completely isolated. Questions cannot be reused across tests, imported from past tests, or cloned.

---

### H6. Test preview mode
**Status: NOT IMPLEMENTED**
- **Route & Component Check**: Grep for `/preview` or `previewMode` yields 0 results. `ExamEngine.tsx` contains no preview or dry-run flag.
- **Teacher Workflow Limitation**: Teachers cannot test question layout, option shuffling, timer flow, or proctoring webcam feeds before publishing. If a teacher attempts to test their exam via `/exam/[testCode]`, a real `Attempt` record is created, which irreversibly triggers `EXAM_IMMUTABLE` and prevents the teacher from making any further changes to the test.

---

### H7. Data retention policy
**Status: NOT IMPLEMENTED**
- **Database & Jobs**: `prisma/schema.prisma` lines 150-245. Models `Attempt`, `Answer`, and `ProctoringEvent` contain timestamps (`createdAt`, `startedAt`, `submittedAt`, `timestamp`), but no TTL fields or expiration schedules.
- **Scheduled Workers**: `package.json` contains no worker dependencies (e.g. BullMQ, Agenda, node-cron). `app/api/` contains no cron routes or automated cleanup handlers.
- **Finding**: Student PII (`studentName`, `rollNumber`), answer submissions, and proctoring telemetry (including facial bounding boxes, gaze deviation metrics, face count logs) are stored indefinitely until the entire examination is manually deleted by the teacher via `DELETE /api/tests/[id]`.

---

### H8. Error monitoring
**Status: NOT IMPLEMENTED**
- **Dependencies**: `package.json` contains no centralized telemetry or error tracking libraries (e.g. `@sentry/nextjs`, Datadog, Bugsnag, Rollbar).
- **Error Boundaries**: There are no `error.tsx` or `global-error.tsx` error boundaries in the Next.js `app/` directory.
- **Finding**: Uncaught client-side exceptions bubble to browser developer tools. Unhandled server-side errors are caught by generic try/catch blocks and printed to server console stdout/stderr before returning generic `INTERNAL_ERROR` 500 JSON. There is no automated error alerting or dashboarding in place.

