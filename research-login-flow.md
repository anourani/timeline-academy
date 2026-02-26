# Login Flow Research — Timeline Academy

> Comprehensive analysis of every component, hook, utility, and database policy involved in
> the authentication and login experience.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Tech Stack & Dependencies](#2-tech-stack--dependencies)
3. [Supabase Client Configuration](#3-supabase-client-configuration)
4. [AuthContext — Global State](#4-authcontext--global-state)
5. [AuthModal — The Login UI](#5-authmodal--the-login-ui)
6. [Entry Points That Trigger the Login Flow](#6-entry-points-that-trigger-the-login-flow)
7. [Sign-In Flow (Step by Step)](#7-sign-in-flow-step-by-step)
8. [Sign-Up Flow (Step by Step)](#8-sign-up-flow-step-by-step)
9. [Password Reset Flow](#9-password-reset-flow)
10. [Sign-Out Flow](#10-sign-out-flow)
11. [Session Lifecycle & Token Management](#11-session-lifecycle--token-management)
12. [Post-Login Behavior — Draft Migration](#12-post-login-behavior--draft-migration)
13. [Local Draft System (Logged-Out Persistence)](#13-local-draft-system-logged-out-persistence)
14. [Autosave System (Logged-In Persistence)](#14-autosave-system-logged-in-persistence)
15. [Account Management (Post-Auth)](#15-account-management-post-auth)
16. [Database Schema & Row-Level Security](#16-database-schema--row-level-security)
17. [Error Handling — Complete Catalog](#17-error-handling--complete-catalog)
18. [Network Resilience & Retry Logic](#18-network-resilience--retry-logic)
19. ["Failed to Fetch" Error — Root Cause Analysis](#19-failed-to-fetch-error--root-cause-analysis)
20. [Known Issues & Observations](#20-known-issues--observations)
21. [File Reference Index](#21-file-reference-index)

---

## 1. Architecture Overview

```
main.tsx
  └─ <ErrorBoundary>
       └─ <AuthProvider>              ← context wraps entire app
            └─ <Router>
                 ├─ / ──► <App>       ← main editor (auth-aware)
                 └─ /view/:id ──► <TimelineViewer>  ← public read-only view
```

Authentication is implemented with **Supabase Auth** (email + password). There is no
OAuth/social login, no magic-link sign-in, and no anonymous/guest accounts. The entire
auth state lives in a single React Context (`AuthContext`) that wraps the application at
the root level in `main.tsx`.

---

## 2. Tech Stack & Dependencies

| Layer | Technology |
|-------|-----------|
| Frontend | React 18.3.1 + TypeScript, Vite 5.4.2 |
| Routing | React Router DOM 6.22.0 |
| Auth & Database | Supabase (`@supabase/supabase-js` 2.39.3) |
| Auth UI helpers | `@supabase/auth-ui-react` 0.4.7 (installed but **unused** — custom UI is used instead) |
| Hosting | Netlify (SPA redirect in `netlify.toml`) |

**Environment variables required:**
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/public API key

Both are validated at client startup in `src/lib/supabase.ts:6-10`. If either is missing
the app throws immediately, before React renders.

---

## 3. Supabase Client Configuration

**File:** `src/lib/supabase.ts`

```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,       // stores session in localStorage
    autoRefreshToken: true,     // auto-refreshes JWT before expiry
    detectSessionInUrl: true    // picks up tokens from redirect URLs (password reset)
  },
  global: {
    headers: { 'x-application-name': 'timeline.academy' }
  },
  fetch: (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
    }).catch(error => {
      console.error('Supabase fetch error:', error);
      throw error;    // ← re-throws, no retry at this layer
    });
  }
});
```

**Key behaviors:**
- A custom `fetch` wrapper adds `Cache-Control: no-cache` headers to every Supabase request.
- The custom fetch catches errors and logs them, but does **not** retry — it re-throws.
- On module load, `testConnection()` fires a lightweight `SELECT count` against `timelines`
  to verify connectivity. If this fails, it logs a warning but does **not** block the app.
- Realtime is configured at 10 events/second max.

---

## 4. AuthContext — Global State

**File:** `src/contexts/AuthContext.tsx`

### Provided interface

```ts
interface AuthContextType {
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

### Initialization (on mount)

1. Calls `supabase.auth.getSession()` to hydrate user state from the persisted
   localStorage session.
2. If the session fetch fails (e.g. expired/corrupt refresh token), calls `handleAuthError`
   which may force a sign-out.
3. Sets up `supabase.auth.onAuthStateChange()` listener for reactive session tracking.

### Auth state change listener

Handles three event types:
- `TOKEN_REFRESHED` → updates user from the new session
- `SIGNED_OUT` → sets user to `null`
- All other events (including `SIGNED_IN`, `USER_UPDATED`) → sets user from session

### Error handling (`handleAuthError`)

Checks if the error message contains `refresh_token_not_found` or `invalid refresh token`.
If so, forces a sign-out to clear the corrupt session. This is called from:
- `getSession()` failure on mount
- `signIn()` failure
- `signUp()` failure

### signOut behavior

```ts
const signOut = async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  } catch (error) {
    console.error('Error signing out:', error);
    setUser(null);  // ← force-clears user even if API call fails
  }
};
```

Sign-out is resilient: it always clears the local user state, even if the Supabase
API call fails (e.g. network error).

---

## 5. AuthModal — The Login UI

**File:** `src/components/Auth/AuthModal.tsx`

A single modal component that serves three modes, controlled by internal state:

| Mode | Title shown | Fields | Submit action |
|------|------------|--------|---------------|
| Sign In (`!isSignUp && !isForgotPassword`) | "Sign In" | email + password | `signIn(email, password)` |
| Sign Up (`isSignUp`) | "Create Account" | email + password | `signUp(email, password)` |
| Forgot Password (`isForgotPassword`) | "Reset Password" | email only | `resetPasswordForEmail(email)` |

### Props

```ts
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultIsSignUp?: boolean;  // controls initial mode
}
```

### State reset behavior

When the modal opens (`isOpen` transitions to `true`), ALL internal state is reset:
- Mode resets to `defaultIsSignUp` prop value
- `isForgotPassword` resets to `false`
- email, password, error, message are all cleared
- `isLoading` resets to `false`

### Supabase configuration guard

Before rendering the form, the component checks that `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` exist. If either is missing, it renders a fallback message
instructing the user to "Connect to Supabase" instead of the auth form.

### Form submission (`handleSubmit`)

```
1. preventDefault()
2. Clear error + message, set isLoading = true
3. Branch by mode:
   a. Forgot Password → supabase.auth.resetPasswordForEmail(email, { redirectTo })
   b. Sign Up → signUp(email, password) from AuthContext → closes modal on success
   c. Sign In → signIn(email, password) from AuthContext → closes modal on success
4. On error → maps error messages to user-friendly text (see Error Handling section)
5. finally → set isLoading = false
```

### Navigation within the modal

- "Already have an account?" / "Need an account?" → toggles `isSignUp`
- "Forgot Password?" → enters forgot-password mode (only visible in sign-in mode)
- "Back to Sign In" → exits forgot-password mode

### Input validation

- Email: HTML `type="email"` + `required`
- Password: HTML `type="password"` + `required` + `minLength={6}`
- All inputs are `disabled` while `isLoading` is true

---

## 6. Entry Points That Trigger the Login Flow

There are **5 distinct places** in the UI that can open the AuthModal:

### 1. GlobalNav — Sign In button
**File:** `src/components/Header/GlobalNav.tsx`
```
onSignInClick → App.tsx: setIsSignUp(false); setShowAuthModal(true)
```
Opens modal in **sign-in** mode. Only visible when `user` is `null`.

### 2. GlobalNav — Sign Up button
**File:** `src/components/Header/GlobalNav.tsx`
```
onSignUpClick → App.tsx: setIsSignUp(true); setShowAuthModal(true)
```
Opens modal in **sign-up** mode. Only visible when `user` is `null`.

### 3. SidePanel — Sign In button
**File:** `src/components/SidePanel/SidePanel.tsx`
```
handleAuthClick(false) → onAuthClick prop → App.handleAuthClick(false)
```
Opens modal in **sign-in** mode. Panel closes first, then modal opens.

### 4. SidePanel — Create Account button
**File:** `src/components/SidePanel/SidePanel.tsx`
```
handleAuthClick(true) → onAuthClick prop → App.handleAuthClick(true)
```
Opens modal in **sign-up** mode. Panel closes first, then modal opens.

### 5. Cloud save nudge banner
**File:** `src/App.tsx:246-263`
```
onClick → setIsSignUp(true); setShowAuthModal(true)
```
A blue banner appears when user is not signed in AND has events on the timeline AND
hasn't dismissed the nudge. Clicking "Sign up" opens modal in **sign-up** mode.

### Note: Duplicate AuthModal instances

There are **two** `<AuthModal>` components rendered in the tree:
1. In `App.tsx` (line 292) — controlled by `showAuthModal` state
2. In `Header.tsx` (line 126) — controlled by its own `showAuthModal` state

The `Header.tsx` instance has its own `handleAuthClick` that sets local state, but
the `onAuthClick` prop from `App.tsx` controls the `App.tsx` instance. In practice, the
`SidePanel` calls `onAuthClick` which triggers `App.tsx`'s modal, while `Header.tsx`'s
modal is only triggered internally (but currently has no direct trigger path from the UI).

---

## 7. Sign-In Flow (Step by Step)

```
User clicks "Sign In" button
    │
    ▼
AuthModal opens (isSignUp = false)
    │
    ▼
User enters email + password, clicks "Sign In"
    │
    ▼
handleSubmit() called
    ├─ setError(''), setMessage(''), setIsLoading(true)
    │
    ▼
AuthContext.signIn(email, password)
    │
    ▼
supabase.auth.signInWithPassword({ email, password })
    │
    ├─── SUCCESS ──────────────────────────────────────┐
    │    Supabase stores session in localStorage       │
    │    onAuthStateChange fires with SIGNED_IN event  │
    │    AuthContext sets user from session             │
    │    AuthModal calls onClose()                     │
    │    Modal disappears                              │
    │    App re-renders with user ≠ null               │
    │    Draft migration fires (see Section 12)        │
    │    Timeline loads from Supabase                  │
    │                                                  │
    ├─── FAILURE ──────────────────────────────────────┘
    │    Error thrown from signInWithPassword
    │    AuthContext.handleAuthError checks for token issues
    │    Error re-thrown to AuthModal
    │    AuthModal maps error to user-friendly message
    │    Error displayed in red banner
    │    isLoading set to false
```

---

## 8. Sign-Up Flow (Step by Step)

```
User clicks "Create Account"
    │
    ▼
AuthModal opens (isSignUp = true)
    │
    ▼
User enters email + password (min 6 chars), clicks "Create Account"
    │
    ▼
handleSubmit() called
    │
    ▼
AuthContext.signUp(email, password)
    │
    ▼
supabase.auth.signUp({ email, password })
    │
    ├─── SUCCESS ───────────────────────────────────────────┐
    │    Supabase creates user in auth.users                │
    │    If email confirmation is OFF: session issued        │
    │      → onAuthStateChange fires                        │
    │      → modal closes, user is logged in                │
    │    If email confirmation is ON: no session yet         │
    │      → modal still closes (potential UX issue — the   │
    │        user won't see a "check your email" message)   │
    │                                                       │
    ├─── FAILURE ───────────────────────────────────────────┘
    │    e.g. "User already registered"
    │    Error shown in AuthModal
```

### Important observation about sign-up

On successful sign-up, the modal calls `onClose()` immediately. If Supabase has email
confirmation enabled (the default), the user won't actually have a session yet, and the
modal will close with **no feedback** telling them to check their email. The user would
then try to sign in and see an "Email not confirmed" error.

---

## 9. Password Reset Flow

```
User is on Sign In screen → clicks "Forgot Password?"
    │
    ▼
handleForgotPassword()
    ├─ setIsForgotPassword(true)
    ├─ clears error, message, password
    │
    ▼
Modal title changes to "Reset Password"
Password field hides; only email field shown
    │
    ▼
User enters email, clicks "Reset Password"
    │
    ▼
handleSubmit() → isForgotPassword branch
    │
    ▼
supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${window.location.origin}/reset-password`
})
    │
    ├─── SUCCESS ───────────────────────────────────────┐
    │    Green message: "If an account exists with      │
    │    this email, you will receive password reset     │
    │    instructions."                                 │
    │    Email field cleared                            │
    │    Modal stays open                               │
    │                                                   │
    ├─── RATE LIMIT ERROR ──────────────────────────────┤
    │    Red message: "Too many reset attempts.         │
    │    Please try again later."                       │
    │                                                   │
    ├─── OTHER ERROR ───────────────────────────────────┘
         Standard error display
```

### Important observation about password reset redirect

The `redirectTo` is set to `${window.location.origin}/reset-password`, but there is
**no `/reset-password` route** defined in `Router.tsx`. The only routes are `/` and
`/view/:timelineId`. The Netlify SPA redirect (`/* → /index.html`) will serve the
main app, but the app has no logic to handle the `/reset-password` path or the
recovery token in the URL. The `detectSessionInUrl: true` setting on the Supabase
client may still pick up the token, but there's no dedicated UI for entering a new
password via this flow.

---

## 10. Sign-Out Flow

```
User clicks "Sign Out" in SidePanel
    │
    ▼
ConfirmationModal opens
    title: "Sign Out"
    message: "Are you sure you want to sign out?"
    │
    ├─ User clicks "Cancel" → modal closes, nothing happens
    │
    ├─ User clicks "Sign Out"
    │     │
    │     ▼
    │   SidePanel.handleSignOut()     (not AuthContext.signOut!)
    │     │
    │     ▼
    │   supabase.auth.signOut()       (direct Supabase call)
    │     │
    │     ├─── SUCCESS ────────────────────────────────┐
    │     │    onAuthStateChange fires SIGNED_OUT       │
    │     │    AuthContext sets user = null              │
    │     │    SidePanel closes                         │
    │     │    App re-renders in logged-out state       │
    │     │                                             │
    │     ├─── FAILURE ────────────────────────────────┘
    │          console.error logged
    │          alert('Failed to sign out. Please try again.')
    │          SidePanel stays open
```

### Observation: Two sign-out implementations

The `SidePanel.handleSignOut()` calls `supabase.auth.signOut()` directly (line 65),
while `AuthContext.signOut()` does the same but with a safety net that force-clears
the user state even on failure. The SidePanel does **not** use the AuthContext version,
so if the Supabase API call fails, the user remains in a "stuck logged in" state in
the SidePanel (though `onAuthStateChange` might still fire depending on the error type).

---

## 11. Session Lifecycle & Token Management

### Session storage

Supabase stores the session (access token + refresh token) in `localStorage` under
keys prefixed with `sb-<project-ref>-auth-token`. The `persistSession: true` config
enables this.

### Token refresh

With `autoRefreshToken: true`, the Supabase client automatically refreshes the JWT
before it expires (default: 1 hour). The refresh happens in the background via the
Supabase JS SDK's internal scheduler.

When a token refresh succeeds:
- `onAuthStateChange` fires with event `TOKEN_REFRESHED`
- `AuthContext` updates the user from the new session

When a token refresh fails:
- Supabase typically fires `SIGNED_OUT`
- If the error contains `refresh_token_not_found` or `invalid refresh token`,
  `AuthContext.handleAuthError` triggers a sign-out

### Session detection in URL

With `detectSessionInUrl: true`, the Supabase client checks the current URL on
initialization for auth-related fragments (e.g., `#access_token=...`). This is used
for password reset redirects and email confirmation links.

### Startup sequence

```
1. main.tsx renders <AuthProvider>
2. AuthProvider useEffect runs:
   a. supabase.auth.getSession() → hydrates user from localStorage
   b. supabase.auth.onAuthStateChange() → subscribes to future changes
3. Concurrently: supabase.ts testConnection() runs (non-blocking)
4. App.tsx renders, reads user from AuthContext
5. If user exists: useTimeline loads initial timeline from Supabase
6. If user is null: useLocalDraft hydrates from localStorage
```

---

## 12. Post-Login Behavior — Draft Migration

**File:** `src/App.tsx:89-110`

When a user signs in (or signs up) and has a local draft with events, the app
automatically migrates that draft to Supabase:

```ts
useEffect(() => {
  if (user && draftHydrated) {
    const draft = loadDraft();
    if (draft && draft.events.length > 0) {
      saveTimeline(draft.title, draft.events, draft.scale)
        .then(() => clearDraft())
        .catch((err) => {
          if (err.message === 'Maximum limit of 3 timelines reached') {
            alert('You\'ve reached the 3-timeline limit...');
          } else {
            console.error('Failed to migrate draft:', err);
            clearDraft(); // ← clears draft even on non-limit errors
          }
        });
    } else {
      clearDraft();
    }
  }
}, [user, draftHydrated]);
```

### Behaviors:
- **Happy path:** Draft saved as new timeline → draft cleared from localStorage
- **3-timeline limit hit:** User sees an `alert()` → draft is NOT cleared (preserved
  so they don't lose data)
- **Other errors:** Draft is cleared even though the save failed → **data loss risk**

---

## 13. Local Draft System (Logged-Out Persistence)

**File:** `src/hooks/useLocalDraft.ts`

When no user is signed in, timeline data is persisted to `localStorage` under the key
`timeline_draft`.

| Operation | Trigger | Debounce |
|-----------|---------|----------|
| `loadDraft()` | On mount when `!user` | None |
| `saveDraft()` | On any data change when `!user && draftHydrated` | 500ms |
| `clearDraft()` | On login (after migration) | None |

### Draft schema

```ts
interface LocalDraft {
  title: string;
  description: string;
  events: TimelineEvent[];
  categories: CategoryConfig[];
  scale: 'large' | 'small';
  savedAt: string;  // ISO timestamp
}
```

### Failure handling

All localStorage operations are wrapped in try/catch with silent failure — if storage
is full or disabled, the app continues without persistence.

---

## 14. Autosave System (Logged-In Persistence)

**File:** `src/hooks/useAutosave.ts`

When a user IS signed in and has a `timelineId`, changes are autosaved to Supabase.

### Mechanism

1. `handleChange()` is called whenever timeline data changes
2. It sets status to `saving` and invokes a debounced `save()` (2-second debounce)
3. `save()` updates the timeline metadata and then runs a diff-based event save
4. Status transitions: `saving` → `saved` (on success) or `saving` → `error` (on failure)

### Save status indicator

**File:** `src/components/SaveStatusIndicator/SaveStatusIndicator.tsx`

Three visual states:
- **saved** (green): "Changes saved" with checkmark
- **saving** (gray): "Saving changes" with spinner
- **error** (red): "Changes not saved" with alert icon

### Network resilience

The autosave system has two recovery mechanisms:
1. **Online event listener:** When the browser comes back online and there are unsaved
   changes with an `error` status, it automatically retries the save.
2. **beforeunload handler:** If there are unsaved changes when the user tries to close
   the tab, the browser shows a confirmation dialog.

### Diff-based event saving

**File:** `src/utils/saveEvents.ts`

Instead of replacing all events on every save, the system:
1. Fetches current server-side events for the timeline
2. Compares against client state to find inserts, updates, and deletes
3. Executes only the necessary operations (UPDATE → DELETE → INSERT order)

---

## 15. Account Management (Post-Auth)

### Account Details Panel
**File:** `src/components/SidePanel/AccountDetailsPanel.tsx`

- Allows updating display name (stored in `user_metadata.name`)
- Allows updating email (triggers Supabase email verification flow)
- Changes tracked via comparison with initial values; submit button disabled if no changes
- Success: green banner for 3 seconds
- Error: generic `alert('Failed to update account details')`

### Change Password Panel
**File:** `src/components/SidePanel/ChangePasswordPanel.tsx`

1. User enters current password + new password (both min 6 chars)
2. Verifies current password by calling `supabase.auth.signInWithPassword()`
3. If verified, calls `supabase.auth.updateUser({ password: newPassword })`
4. On success: green banner, auto-navigates back to main panel after 2 seconds

**Bug in password verification (line 25-28):**
```ts
const { error: signInError } = await supabase.auth.signInWithPassword({
  email: supabase.auth.getUser().then(res => res.data.user?.email || ''),
  password: currentPassword
});
```
The `email` field receives a **Promise**, not a string. `supabase.auth.getUser()`
returns a Promise, and `.then()` returns another Promise. This Promise object is passed
directly as the email value to `signInWithPassword`, which will likely cause the
verification to always fail or behave unexpectedly.

---

## 16. Database Schema & Row-Level Security

### Tables

| Table | Key Columns | RLS |
|-------|------------|-----|
| `timelines` | id (uuid PK), user_id (FK → auth.users), title, description, scale, categories (JSONB), created_at, updated_at | Enabled |
| `events` | id (uuid PK), timeline_id (FK → timelines ON DELETE CASCADE), title, start_date, end_date, category, created_at | Enabled |
| `timeline_categories` | timeline_id (FK → timelines), + category fields | Enabled |

### RLS Policies Summary

**All policies require `authenticated` role** — there are no policies for `anon`.

| Table | Operation | Policy |
|-------|-----------|--------|
| timelines | SELECT | `auth.uid() = user_id` |
| timelines | INSERT | `auth.uid() = user_id` |
| timelines | UPDATE | `auth.uid() = user_id` (both USING and WITH CHECK) |
| timelines | DELETE | `auth.uid() = user_id` |
| events | SELECT | timeline owned by `auth.uid()` |
| events | INSERT | timeline owned by `auth.uid()` |
| events | UPDATE | timeline owned by `auth.uid()` |
| events | DELETE | timeline owned by `auth.uid()` |

### Timeline Limit

Enforced at the database level via a `BEFORE INSERT` trigger:
```sql
if (select count(*) from timelines where user_id = auth.uid()) >= 3 then
  raise exception 'Maximum limit of 3 timelines reached';
end if;
```

### Scale constraint
```sql
ALTER TABLE timelines ADD CONSTRAINT valid_scale
  CHECK (scale IN ('large', 'small'));
```

---

## 17. Error Handling — Complete Catalog

### AuthModal error mapping (`src/components/Auth/AuthModal.tsx:84-99`)

| Supabase Error Message (contains) | User-Facing Message |
|-----------------------------------|---------------------|
| `Email not confirmed` | "Please check your email to confirm your account before signing in." |
| `Invalid login credentials` | "Invalid email or password." |
| `Email rate limit exceeded` | "Too many attempts. Please try again later." |
| `rate limit` (in password reset) | "Too many reset attempts. Please try again later." |
| Any other `Error` instance | The raw `error.message` is shown |
| Non-Error throw | "An unexpected error occurred" |

### AuthContext error handling (`src/contexts/AuthContext.tsx:42-49`)

| Error Message (contains) | Action |
|--------------------------|--------|
| `refresh_token_not_found` | Force sign-out |
| `invalid refresh token` | Force sign-out |

### useTimeline errors (`src/hooks/useTimeline.ts`)

| Scenario | Error Message | Behavior |
|----------|--------------|----------|
| Initial timeline load fails | "Failed to load timeline. Please try again." | Shown in App.tsx with Retry button |
| Timeline switch fails | Raw error logged | `alert('Failed to load timeline. Please try again.')` |
| 3-timeline limit on create | "Maximum limit of 3 timelines reached" | Thrown to caller |

### useTimelines errors (`src/hooks/useTimelines.ts`)

| Scenario | Behavior |
|----------|----------|
| Fetch fails (non-network) | "Failed to load timelines. Please try again." in SidePanel |
| Fetch fails (network, `fetch` in message) | Retry up to 3 times with exponential backoff |
| Realtime subscription error | "Failed to subscribe to timeline updates" |

### Autosave errors (`src/hooks/useAutosave.ts`)

| Scenario | Behavior |
|----------|----------|
| Save fails | `saveStatus` → `'error'`, "Changes not saved" shown in header |
| Network comes back online while in error state | Automatic retry |

### SidePanel errors (`src/components/SidePanel/SidePanel.tsx`)

| Scenario | Behavior |
|----------|----------|
| Sign-out fails | `alert('Failed to sign out. Please try again.')` |
| Timeline delete fails | `alert('Failed to delete timeline. Please try again.')` |
| Timeline load error | Red "Connection Error" banner with "Try Again" button |

---

## 18. Network Resilience & Retry Logic

### Layer 1: Supabase client fetch wrapper (`src/lib/supabase.ts:30-42`)
- Adds no-cache headers
- Catches errors, logs them, re-throws
- **No retry logic**

### Layer 2: useTimelines hook (`src/hooks/useTimelines.ts:47-56`)
- Retries on network errors (message includes `'fetch'`)
- Max 3 retries
- Exponential backoff: 1s, 2s, 4s

### Layer 3: Autosave (`src/hooks/useAutosave.ts:86-96`)
- Listens for browser `online` event
- If in error state with unsaved changes, retries save when coming back online

### Layer 4: Connection test (`src/lib/supabase.ts:48-63`)
- One-time test on module load
- If fails, logs warning — no retry, app continues
- Can be called again manually but has a `connectionTested` flag that short-circuits

### What has NO retry logic:
- `signIn()` / `signUp()` in AuthContext — single attempt, error shown to user
- `resetPasswordForEmail()` — single attempt
- `loadTimeline()` / `saveTimeline()` in useTimeline — single attempt
- Autosave debounced saves — single attempt (but online handler provides eventual retry)

---

## 19. "Failed to Fetch" Error — Root Cause Analysis

The "Failed to fetch" error occurs when the browser's `fetch()` API cannot complete
the HTTP request. In the context of this app's login flow, here are the likely causes:

### Cause 1: Network connectivity
The user's device is offline or has intermittent connectivity. The Supabase client's
custom `fetch` wrapper at `src/lib/supabase.ts:30-42` will log `'Supabase fetch error'`
and re-throw. Since `signIn()`/`signUp()` have no retry logic, the raw `TypeError:
Failed to fetch` message propagates all the way to AuthModal's catch block.

### Cause 2: Supabase service unavailable
If the Supabase backend is down or the project URL is incorrect/expired, the fetch
will fail. The `VITE_SUPABASE_URL` is validated to exist at startup, but its
**validity** (correct hostname, active project) is not verified before auth calls.

### Cause 3: CORS or mixed content
If the Supabase URL has changed or there's a proxy/CDN misconfiguration, CORS errors
manifest as `TypeError: Failed to fetch` in the browser.

### Cause 4: DNS resolution failure
If the Supabase project subdomain can't be resolved (e.g., project paused/deleted),
DNS lookup fails → `Failed to fetch`.

### How the error surfaces to the user

```
fetch() throws TypeError("Failed to fetch")
  → supabase.ts custom fetch: logs "Supabase fetch error:", re-throws
    → supabase.auth.signInWithPassword returns { error }
      → AuthContext.signIn: handleAuthError (no match), throws error
        → AuthModal catch block:
          → err instanceof Error? YES
          → err.message includes "Email not confirmed"? NO
          → err.message includes "Invalid login credentials"? NO
          → err.message includes "Email rate limit exceeded"? NO
          → Falls through to: setError(err.message)
          → User sees: "Failed to fetch" (raw, unhelpful message)
```

### Missing: No user-friendly network error handling

The AuthModal has specific handling for auth-related errors but has **no detection
or friendly messaging for network errors**. A `TypeError: Failed to fetch` passes
through all guards and is shown raw to the user.

---

## 20. Known Issues & Observations

### Issue 1: "Failed to fetch" shown raw to users
Network errors during login are not caught and translated into a user-friendly message
like "Unable to connect. Please check your internet connection and try again."
See Section 19 for full analysis.

### Issue 2: Sign-up closes modal without confirmation feedback
When email confirmation is enabled in Supabase (the default), `signUp()` resolves
successfully but no session is created. The modal calls `onClose()` immediately, so
the user never sees a "Check your email" message. They'll then try to sign in and
get "Please check your email to confirm your account before signing in."

### Issue 3: Password verification bug in ChangePasswordPanel
The email parameter passed to `signInWithPassword` is a Promise object, not a string
(`src/components/SidePanel/ChangePasswordPanel.tsx:26`). This likely causes password
verification to always fail or produce unexpected behavior.

### Issue 4: Two sign-out implementations
`SidePanel.handleSignOut()` calls `supabase.auth.signOut()` directly, while
`AuthContext.signOut()` adds a safety net of force-clearing user state on error.
The SidePanel should use the AuthContext version for consistency and resilience.

### Issue 5: Draft cleared on non-limit migration errors
In `App.tsx:102`, if draft migration fails for a reason other than the 3-timeline
limit (e.g., a network error), `clearDraft()` is still called, potentially losing
the user's offline work.

### Issue 6: No `/reset-password` route
The password reset email redirects to `${origin}/reset-password`, but no such route
exists. The SPA catch-all will serve the app, and `detectSessionInUrl` may pick up
the token, but there's no UI flow for entering a new password after clicking the
reset link.

### Issue 7: Duplicate AuthModal instances
`App.tsx` and `Header.tsx` both render their own `<AuthModal>`. The `Header.tsx`
instance is independently controlled and could theoretically conflict with the
`App.tsx` instance, though in practice only the `App.tsx` one is triggered by current
UI flows.

### Issue 8: No public RLS policies for TimelineViewer
The `/view/:timelineId` route renders `TimelineViewer` which fetches timeline data.
However, all RLS policies require `authenticated` role. There are no `anon` policies,
which means public link sharing (read-only) would fail for unauthenticated visitors
unless Supabase's RLS is configured differently at the dashboard level than what the
migration files show.

### Issue 9: No loading state during initial session hydration
`AuthContext` doesn't expose an `isLoading` state. When the app first loads,
`supabase.auth.getSession()` is async, but the app immediately renders with
`user = null`. This can cause a flash of logged-out UI before the session hydrates,
and can trigger the local draft hydration even for logged-in users (briefly).

---

## 21. File Reference Index

| File | Role |
|------|------|
| `src/main.tsx` | App entry point; wraps everything in `ErrorBoundary` → `AuthProvider` → `Router` |
| `src/Router.tsx` | Defines routes: `/` (App) and `/view/:id` (TimelineViewer) |
| `src/lib/supabase.ts` | Supabase client initialization, custom fetch, connection test |
| `src/contexts/AuthContext.tsx` | React Context providing `user`, `signIn`, `signUp`, `signOut` |
| `src/components/Auth/AuthModal.tsx` | Login/signup/password-reset modal UI |
| `src/components/Modal/Modal.tsx` | Generic modal wrapper (scroll lock, close button) |
| `src/components/Modal/ConfirmationModal.tsx` | Confirmation dialog (used for sign-out) |
| `src/App.tsx` | Main app component; manages auth modal state, draft migration, nudge banner |
| `src/components/Header/GlobalNav.tsx` | Top nav with Sign In/Sign Up buttons |
| `src/components/Layout/Header.tsx` | Header layout; renders AuthModal + SidePanel |
| `src/components/SidePanel/SidePanel.tsx` | Side panel with timeline list, sign-in prompts, sign-out |
| `src/components/SidePanel/AccountDetailsPanel.tsx` | Name/email update form |
| `src/components/SidePanel/ChangePasswordPanel.tsx` | Password change form |
| `src/components/SaveStatusIndicator/SaveStatusIndicator.tsx` | Visual save status (saved/saving/error) |
| `src/components/ErrorBoundary.tsx` | React error boundary; catches render errors |
| `src/hooks/useTimeline.ts` | Loads/saves individual timelines to Supabase |
| `src/hooks/useTimelines.ts` | Loads timeline list with retry + realtime subscriptions |
| `src/hooks/useAutosave.ts` | Debounced autosave with network recovery |
| `src/hooks/useLocalDraft.ts` | localStorage persistence for logged-out users |
| `src/utils/saveEvents.ts` | Diff-based event save (insert/update/delete) |
| `src/utils/debounce.ts` | Generic debounce utility with cancel support |
| `src/types/event.ts` | TypeScript types for TimelineEvent, CategoryConfig |
| `src/types/timeline.ts` | TypeScript types for Timeline, TimelineScale |
| `supabase/migrations/20250106212432_bold_heart.sql` | Creates timelines + events tables, RLS, timeline limit trigger |
| `supabase/migrations/20250128234637_square_wood.sql` | Creates timeline_categories table, adds description column |
| `supabase/migrations/20250203181722_small_prism.sql` | Adds scale column with constraint |
| `supabase/migrations/20250216223128_tight_bird.sql` | Adds JSONB categories column to timelines |
| `netlify.toml` | SPA redirect config (`/* → /index.html`) |
