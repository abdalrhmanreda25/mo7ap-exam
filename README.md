# mo7ap exam

منصة امتحانات عربية للثانوية العامة. Next.js (App Router) + Firebase (Auth, Firestore, Cloud Functions).

Status: **Phases 1 to 3 complete** (foundation and auth, data model and rules, curriculum, question bank, exam builder and publish). Later phases (exam engine, student experience, analytics, deployment) are not started. Admin results and student management are not built yet. Pages marked as placeholders are not product features yet.

## Requirements

- Node.js 22+
- Java 21+ for the Firebase emulators (Java 17 works today with a warning)
- Firebase CLI: `npm i -g firebase-tools` or use `npx firebase-tools`

## Local development (emulators, no real project needed)

```bash
npm install
npm run emulators          # Auth :9099, Firestore :8181, Emulator UI :4000
npm run dev                # http://localhost:3000
```

`.env.local` is preconfigured for the `demo-mo7ap-exam` project (demo ID, no real credentials). Keep `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` locally.

Create the first admin and a student (the CLI is the only account-creation path):

```bash
npm run admin:cli -- provision --email you@example.com --name "اسم المشرف" --role ADMIN
npm run admin:cli -- provision --email student@example.com --name "اسم الطالب" --role STUDENT
```

The command prints a single-use password-setup link. With emulators, open the Auth emulator UI or the printed link to set the password. Later, send the link privately to the account owner.

Deactivate or reactivate an account:

```bash
npm run admin:cli -- set-active --email student@example.com --active false
npm run admin:cli -- set-active --email student@example.com --active true
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build (includes type generation) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:emulator` | Provisioning, Firestore rules, and exam composition/publish tests against the emulators |
| `npm run test:e2e` | Seeds emulator accounts, starts emulators and dev server, runs Playwright (desktop + mobile) |
| `npm run admin:cli -- ...` | Account provisioning and activation |

## Architecture (Phase 1)

```
src/
  app/
    (auth)/            login, forgot-password (public shell)
    (student)/         student layout + dashboard   -> requireRole("STUDENT")
    admin/             admin layout + home          -> requireRole("ADMIN")
    unauthorized/      forbidden page
    api/auth/session/  POST: ID token -> httpOnly session cookie; DELETE: sign out
  proxy.ts             optimistic redirect when no session cookie (not an authz boundary)
  lib/firebase/
    config.ts          public web config (NEXT_PUBLIC_* only)
    client.ts          browser SDK (sign-in, reset, sign-out)
    admin-core.ts      Admin SDK bootstrap (no server-only guard; used by CLI)
    admin.ts           server-only wrapper for the app
  lib/auth/
    roles.ts           ADMIN | STUDENT, home paths, safe redirect check
    session.ts         getSessionUser / requireRole (server)
    session-config.ts  cookie policy, same-origin check
    provisioning.ts    trusted account administration (claims, profile doc, audit)
  features/auth/       forms, schemas, Arabic error mapping
scripts/admin-cli.ts   local admin CLI
firestore.rules        default deny-all (Phase 2 adds explicit grants)
```

### Login flow

1. Browser signs in with Firebase Auth (email + password).
2. Browser sends the ID token to `POST /api/auth/session`.
3. Server verifies the token with `checkRevoked=true`, confirms the `role` custom claim and `users/{uid}` (`isActive: true`, matching role), then creates a 5-day Firebase session cookie.
4. Cookie is `__session`, `httpOnly`, `sameSite=lax`, `secure` in production.
5. Every guarded page calls `requireRole()`, which re-verifies the cookie on the server.

### Authorization sources

- Role: custom claim `role`, set only by `scripts/admin-cli.ts` through `provisionUser()`. A role change revokes refresh tokens.
- Account status: Firebase Auth `disabled` flag and `users/{uid}.isActive`. Both are checked. Deactivation revokes refresh tokens.
- `users/{uid}` is written only by Admin SDK code. Client writes are denied by rules.

### Security limitations (current)

- Page guards and the proxy are not a substitute for data-level checks. Every privileged data function (Phase 4 Cloud Functions, Phase 2 rules) must independently re-check identity, role, ownership and state.
- Session cookies remain valid until expiry unless refresh tokens are revoked. Deactivation revokes them, but a session already in use continues until the next `checkRevoked` check, which happens on each request.
- `.env.local` contains only emulator placeholders. Production values are not configured yet.
- No App Check, rate limiting, or Cloud Functions yet (Phases 4 and 7).

## Production configuration (not done yet)

Required public values (Firebase console > Project settings > Web app):

```
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_APP_ID
```

Server-only (hosting provider secret store, never `NEXT_PUBLIC_`):

```
FIREBASE_PROJECT_ID              (or rely on NEXT_PUBLIC_FIREBASE_PROJECT_ID)
GOOGLE_APPLICATION_CREDENTIALS   (path to a service-account JSON outside the repo, or use ADC on the host)
```

Deployment (hosting target, Firebase project, backups, restore test) is part of Phase 7. Nothing here has been deployed.

## Tests: what they cover

- `tests/unit`: role logic, open-redirect guard, same-origin/CSRF check, cookie policy, form schemas, Arabic error mapping.
- `tests/emulator`: provisioning writes claims, profile and audit log; deactivated user's session is rejected; role change revokes old session.
- `tests/e2e`: sign-in for student and admin, wrong password, deactivated account, role-based redirects, sign-out, forged cookie, cross-origin and content-type rejection on the session API, RTL attributes, mobile overflow.

Firestore Security Rules (`tests/rules`): 51 direct client-SDK attack cases against the emulator. Exam composition and publish (`tests/emulator/exam-publish.test.ts`): 11 cases including a publish race. Data model, security matrix, and write path: [docs/data-model.md](docs/data-model.md).
