# Kcalculator Handover: Admin + Bug Report (2026-03-16)

## Scope of this handover
This document captures the current state of the temporary pause on bug reporting and admin discoverability, including what was changed, what still needs debugging, and how to continue later in any AI tool.

## What was changed now

### 1) Bug report feature hidden for next build
- Feature flag set to disabled:
  - `src/constants.js`
  - `ENABLE_BETA_BUG_REPORT = false`
- Effect:
  - Bug buttons are no longer rendered by `buildBugReportButton`.
  - Bug modal functions remain in code but are no-op due to flag guard.

### 2) Admin icon/button removed from UI navigation
- Removed settings Admin button from setup screen:
  - `index.html` (`settings-admin-btn` removed)
- Removed header admin icon button:
  - `index.html` (`admin-header-btn` removed)
- Effect:
  - No visible entry point to admin from UI.

### 3) Admin route only through `/admin`
- Route helper added in app boot flow:
  - `src/main.js`
  - `isAdminRoute()`
  - `openAdminIfRoute()`
- Behavior:
  - Only opens admin page when browser path is exactly `/admin`.
  - If not logged in and path is `/admin`, setup/login screen is shown first.
  - After login/register/restore, app re-checks route and opens admin page if path is `/admin`.

## Important current behavior
- Admin page still enforces user checks in `src/pages/admin.js`:
  - Requires Supabase config.
  - Requires authenticated user.
  - Requires allowlisted email (`VITE_ADMIN_EMAILS`) unless localhost fallback.
- UI no longer advertises admin; direct URL is required.

## Known unresolved issue before pause
Primary unresolved issue: bug report POST returned `401` from function gateway.

Observed symptom:
- Response/log style indicated function gateway auth rejection before function execution.

Previously attempted mitigations:
- Frontend now sends Authorization fallback (`Bearer <access_token || anon_key>`).
- Edge functions now accept both service key env names:
  - `SERVICE_ROLE_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

Likely root causes to verify later:
1. Function auth/JWT gateway requirement mismatch.
2. Frontend deployed build/env mismatch (old bundle or wrong Supabase URL/key).
3. Function env variables incomplete for deployed environment.

## Files relevant for later continuation

### Frontend bug reporting
- `src/ui/bug-report.js`
- `src/constants.js`
- `src/ui/autocomplete.js`
- `src/modals/match-core.js`
- `src/styles/components.css`

### Admin page flow
- `src/pages/admin.js`
- `src/main.js`
- `index.html`
- `src/styles/pages.css`
- `src/styles/mobile.css`
- `src/ui/misc.js`

### Supabase edge functions
- `supabase/functions/report-issue/index.ts`
- `supabase/functions/admin-issues/index.ts`

### Supabase schema
- `supabase/migrations/20260316103000_create_issue_reports.sql`

## Resume checklist (later)

1. Re-enable beta bug report UI
- Set `ENABLE_BETA_BUG_REPORT` back to `true` in `src/constants.js`.

2. Confirm deployed frontend uses expected Supabase env
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

3. Validate edge function environment variables
- `SERVICE_ROLE_KEY` (or fallback name)
- `ADMIN_EMAILS` (for admin endpoint)

4. Verify function gateway auth mode
- Confirm `report-issue` function can be called by intended client auth model.

5. End-to-end test
- Submit bug report from app.
- Confirm row in `public.issue_reports`.
- Confirm admin can list/update status.

## Quick acceptance criteria for next iteration
- Bug report submit returns success message.
- New row appears in `issue_reports` with context/message/status.
- Admin page opens only via `/admin` and only for authenticated allowlisted admins.
- No admin navigation controls visible in standard UI.

## Notes for any future AI assistant
- This repo is plain JS modules + Vite + Supabase edge functions.
- Keep behavior-first changes small and reversible.
- Preserve the direct-route admin access model unless requested otherwise.
