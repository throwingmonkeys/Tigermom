# Report retirement changes

These are the changes for retiring reports, separate from earlier uncommitted work.

- `src/App.tsx` — removed uploads, report chips and report starter; updated welcome and privacy wording.
- `convex/conversation.ts` — removed report retrieval, transcription and file inputs; retained urgent text checks and answer review.
- `convex/reports.ts` — rejects old upload requests with HTTP 410; provides private, bounded legacy-file cleanup.
- `convex/sessions.ts` — replaces report-reading queries with an ownership/expiry check; retains legacy deletion.
- `convex/searchQuestion.ts` — uses the session check without retrieving files.
- `convex/purposeReview.ts` — uses the session check without retrieving files.
- `convex/evidence.ts` — removes active report-reading instructions; retains medical boundaries.
- `convex/urgent.ts` — removes report-only warning explanation helpers; retains symptom detection and fixed urgent reply.
- `convex/schema.ts` — marks the remaining report table as legacy cleanup only.
- `convex/auth.ts` — updates its scope comment.
- `convex/_generated/api.d.ts` — regenerates available server functions.
- `convex/reportText.ts` — deleted the report transcription helper.
- `package.json` and `package-lock.json` — removes the unused PDF-reading dependency.
- `tests/conversation-screen.test.tsx` — verifies upload controls and the report starter are absent.
- `tests/sessions.test.ts` — retains session ownership/expiry checks and removes report-feature tests.
- `tests/retired-reports.test.ts` — verifies old requests are blocked, cleanup works and legacy reports are never processed.
- `tests/urgent-context.test.ts` — removes a retired report-specific case; retains typed-symptom checks.
- `tests/report-urgency.test.ts` — deleted report-feature tests.
- `tests/fixtures/report-urgency/{ordinary,negated,urgent}.png` — deleted made-up report fixtures.
- `scripts/check-report-warning-preview.mjs` and `scripts/check-urgent-reports-dev.mjs` — deleted retired report checks.
- `scripts/check-cloud.mjs` — checks upload retirement instead of uploading a report.
- `scripts/retire-report-files.mjs` — inventories files without their contents and performs authorised preview cleanup.
- `scripts/check-report-free-preview.mjs` — checks a normal question and contextual follow-up against preview.
- `AGENTS.md`, `IDEA_SCOPE.md`, `PRODUCT.md` and `DESIGN.md` — mark reports outside v1 and update active scope/privacy descriptions.
- `PLAN.md` — records the approved retirement milestone and parked report feature.
- `PROGRESS.md` — records preview verification and pending phone confirmation.

Check records: `report-retirement-tests.log`, `report-retirement-inventory.json`, `report-retirement-deletion.json`, `report-retirement-served-check.json`, `report-free-live-answers.json`.

No env-variable, key, font, colour or citation-format changes were made for report retirement. Production was inventoried read-only and not deployed. No reports existed in either environment, so the cleanup removed zero report files.
