# MedConsults CRM Development Guide

This guide establishes the mandatory engineering standards, security rules, and operating procedures for all work in this repository. Every task must adhere to these instructions.

## 1. Source of Truth
The product specification at docs/PROJECT_SPEC.md and the API specification at docs/API.md are the primary sources of truth. If any task request conflicts with these documents, stop immediately and ask for clarification before modifying any code. Whenever feature behavior or an interface contract changes, update the relevant specification document alongside the code.

## 2. Working Method
Execute work sequentially, focusing on one phase at a time. Implement strictly what the task specifies without introducing unplanned features, opportunistic refactors, or extra files. Always request explicit confirmation before running any terminal command, explaining what the command does beforehand. Never delete or alter files outside the task scope. The design assets under design/ui-reference/ are read-only references; never edit or overwrite them.

## 3. Architecture
The project is a monorepo consisting of:
- Backend: Express 5, TypeScript in strict mode, Mongoose, and Zod.
- Frontend: React, Vite, TypeScript, and Tailwind CSS.
Backend modules reside in backend/src/modules/<name>/ and follow a five-component structure: routes, controller, service, model, and schema. Controllers remain thin request/response dispatchers; all business logic, data validation, and side effects reside inside domain services.

## 4. API Conventions
All endpoints are exposed under the base path /api/v1 and speak JSON exclusively.
- Success responses use the shape: { "success": true, "data": ... }
- Error responses use the shape: { "success": false, "error": { "code": string, "message": string, "fields"?: Record<string, string> } }
- Paginated listing endpoints accept ?page and ?limit query parameters (default page 1, default limit 20, max limit 100) and return a pagination object.
- Every request body, query parameter, and route parameter is validated using Zod.
- Role authorization is enforced using roleGuard.
- Accessing another user's private resource returns 404 NOT_FOUND, never 403, to prevent resource enumeration.
- Primary resources employ soft deletion (isDeleted, deletedAt).
- All timestamps are stored in UTC and converted to Asia/Kolkata on presentation.

## 5. Security Rules
- Environment files (.env) and configuration secrets must never be read, displayed, copied, or committed. Never ask the user to paste secrets into conversation.
- Authentication tokens, email verification codes, and password reset codes are stored strictly as SHA-256 hashes, never in plaintext.
- Authentication failures return generic error messages to prevent account enumeration.
- Passwords, secret tokens, and patient personal health data must never be logged.
- Clinical notes are confidential: visible only to the authoring doctor and, when marked shared, the patient. Staff and admin roles must never see clinical details.
- Sensitive state modifications (logins, lockouts, session revocations, password resets) write an audit log entry.

## 6. Dependencies
Never copy dependency version numbers from memory or documentation. For every new package:
1. Verify the package exists under the exact name on npmjs.com.
2. Check for the latest stable release and verify that no open security advisories or high/critical vulnerabilities exist.
3. Confirm the version using npm show <package> version.
4. Install using caret (^) ranges in package.json.
5. Run npm audit and report what was verified.
Remove any redundant type declaration packages when the primary library bundles its own types.

## 7. Testing
All tests use Vitest and Supertest and run strictly against the dedicated test database (MONGODB_URI_TEST). The test database must never conflict with development data and is cleaned between test runs. Every endpoint requires automated tests covering:
- Success scenario
- Validation error (400)
- Missing or malformed token (401)
- Insufficient role permission (403)
- Non-existent resource or foreign resource ownership (404)
- Unique constraint conflict (409) where applicable
- Rate limit violation (429) on sensitive authentication routes
Run typecheck, test suites, and npm audit before committing any changes.

## 8. Postman and API Documentation
Every new or modified endpoint must be recorded in backend/postman/collection.json using standard variables (such as {{baseUrl}}), verified with embedded test scripts, and contain no real credentials. In parallel, document the endpoint in docs/API.md with purpose, role requirements, request format, expected status codes (200, 201, 400, 401, 403, 404, 409, 423, 429), and business logic.

## 9. Version Control
Create focused, granular commits using standard conventional commit prefixes (feat, fix, docs, chore, test, refactor).
- Do not include co-author trailers, automated attribution markers, or tool names in commit messages or file comments.
- Verify with git status that no .env or untracked sensitive files are staged.
- Never push to remote branches unless explicitly instructed.
- Force pushing is strictly prohibited.

## 10. Frontend Rules
When implementing frontend screens in later phases:
- Reconstruct screens as modular React components inspired by the visual design system in design/ui-reference/clinical_prestige/DESIGN.md.
- Never copy static HTML templates directly.
- Strip all demo state-testing bars, sandbox banners, hardcoded dates, multi-city references, tele-consultation mentions, and unverified compliance claims (HIPAA, DISHA, ABHA) per section 15 of the spec.
- Every screen must implement loading skeletons, empty states, and error handling.

## 11. Code Style
Write clean, strict TypeScript. Avoid the any type; when unavoidable, provide an explanatory comment. Keep functions small, modular, and single-purpose. Use descriptive variable and function names. Add comments only where architectural intent or complex logic is not obvious. All demo and seed data must be purely fictional.

## 12. Definition of Done
A task is complete only when:
1. All required code is written and functional.
2. All unit and integration tests pass on the test database.
3. TypeScript typecheck passes with zero errors.
4. npm audit reports no high or critical vulnerabilities.
5. Postman collection and docs/API.md are updated.
6. docs/PROJECT_STATUS.md is updated.
7. Changes are committed locally with a clean conventional commit message.
8. No secrets or environment files are staged or tracked.

## 13. Final Report Format
Conclude every completed task with a clear report containing:
- Summary table of added or modified endpoints/components.
- Packages and versions verified during the task.
- Automated test and typecheck verification results.
- Any decisions taken differently from the spec and the rationale.
- Explicit manual actions required by the user (if any).
