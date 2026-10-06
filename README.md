# Tigermom

A phone-friendly pregnancy conversation app. Scope and voice principles are in [IDEA_SCOPE.md](IDEA_SCOPE.md).

- GitHub: https://github.com/throwingmonkeys/Tigermom
- Convex project: https://dashboard.convex.dev/t/throwingmonkeys/tigermom
- Development backend: https://animated-shepherd-226.ap-southeast-2.convex.cloud

## Start working

Open PowerShell:

```powershell
cd C:\Users\sonja\Tigermom
cdx
```

Run `npm run dev` to start the frontend at http://127.0.0.1:5173. Run `npm run dev:backend` separately for backend development. A fresh checkout needs `npm install` and local configuration for the existing Tigermom project.

Local connection settings are in `.env.local`, which is excluded from GitHub. Never commit keys, passwords, or real people's data.

Database, backend, sign-in, and website hosting use Convex. Git pushes do not deploy.

## Current build

Home, phone-code screens, conversation, source links, report controls, privacy, feedback, and coming-soon membership are implemented. A labelled, read-only sample is available without sign-in.

Convex Auth phone sign-in is wired and development signing keys are configured. No OTP bypass is included. SMS delivery is not connected. The phone provider awaits an owner-approved HTTPS adapter (`SMS_DELIVERY_URL` and `SMS_DELIVERY_SECRET` in Convex), which receives `{ phone, code, expiresInSeconds }` with a Bearer secret. Do not set an arbitrary endpoint. Choose the sender, implement its delivery rate limits and Indian sender requirements, then test a real round trip.

Convex Agent uses a stateless response pipeline, the Convex AI Gateway, restricted source search, and India-focused instructions. AI is disabled until the owner approves processing/costs and confirms gateway eligibility. `AI_MODEL` defaults to `openai/gpt-5`; `AI_ENABLED=true` enables the pipeline. Confirm support for web search and `store:false`, and provider data handling before enabling it. No AI request has been tested. Citations and instructions alone cannot guarantee medical accuracy; check actual answers with reliable sources and human review.

Written report uploads accept PDFs, JPG, PNG, or WebP, up to three at 10 MB each. Authenticated HTTP upload checks both type and file signature. Free-session messages stay in page memory and are not saved to the database. Ending deletes reports; a five-minute server lease covers tab closure or a page left in the background. Voice recognition is an optional browser feature with consent; reading aloud uses a local-device voice only. Neither has been tested on a real device.

Feedback is a temporary private reflection and is explicitly not saved, preserving the free-user privacy rule. Paid membership is coming soon, with no payments or saved history in this first version.

## Check it

```powershell
npm test
npm run build
npm run check:cloud
```

Eight automated checks cover session/file deletion, access isolation, expiry, unsigned upload rejection, trusted-link validation, sample sources, phone gating, and a simulated conversation/end/feedback flow. Build compiles TypeScript and the frontend. Cloud checks test the actual development deployment's access rejection and public signing-key endpoint.

Screen tests use a simulated page and mocked service calls, not a real browser. The browser tool reported no connected browsers. Desktop/mobile appearance, real OTP, real AI, and voice remain unverified. The design reviewer returned `recapture` pending desktop/mobile screenshots.

On this machine, npm/Convex network commands may need `$env:NODE_USE_SYSTEM_CA='1'` to use Windows' trusted certificates. Certificate verification remains enabled. `npm run setup:auth` preserves existing signing keys, generates missing ones without printing or saving private keys, and sets the development `SITE_URL`.

## Hosting

Convex Static Hosting is wired with auth routes preserved at the root. `npm run deploy` publishes to Convex production at its `.convex.site` address; it has not been run. Configure production auth and services separately, using the hosted address for `SITE_URL`.

For a development-hosted smoke check after pushing the backend, use `npx @convex-dev/static-hosting upload --build`. No hosted upload or production release was performed during this build. See [BUILD_STATUS.md](BUILD_STATUS.md) for remaining work.
