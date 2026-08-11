# Module 4 — App shell & navigation

- **Effort:** 3 days
- **Depends on:** M2 (`window.api`, `lib/api.ts`), M3 (`auth:*` channels)
- **Delivers:** the React app shell — `AppShell` (sidebar + navbar + footer ports),
  the react-router route table with lazy loading, the TanStack Query setup with a
  global Toaster (replacing HTMX toasts), the `RequireAuth` gate, and the two auth
  screens (Create Admin / Login) that consume M3. The dashboard route is a
  placeholder here and is filled by M5.

## 1. Goal

After this module the app is a real navigable UI: a first-run user creates the admin,
logs in, and sees an empty shell with a sidebar and navbar. Every future feature module
only adds a route + a feature folder; the shell does not change.

## 2. Inputs / sources (Django templates to port)

| Django source                                        | Ports to                         |
| ---------------------------------------------------- | -------------------------------- |
| `crown_crm/templates/base.html`                      | App root layout, Toaster wiring  |
| `crown_crm/templates/partials/_sidebar.html`         | `Sidebar` component              |
| `crown_crm/templates/partials/_navbar.html`          | `Navbar` component               |
| `crown_crm/templates/partials/_footer.html`          | `Footer` component               |
| HTMX toast events (`base.html` `message` listener)   | `Toaster` + TanStack Query invalidation |
| `crown_crm/templates/organizations/dashboard.html`   | Dashboard route stub (M5 fills it) |

## 3. Design decisions (pinned)

1. **`react-router` v6/7 data-less mode:** plain `<Routes>` with lazy `React.lazy`
   imports; no loaders (data comes from TanStack Query).
2. **TanStack Query replaces HTMX refresh semantics:** every "table that reloads when
   data changes" maps to a `useQuery` key + `invalidateQueries` after a mutation.
3. **One Toaster, global** — a React context around a bootstrap toast container,
   replacing `window.showToast` / SweetAlert toasts. Mutations push toasts on
   success/error.
4. **`RequireAuth` gate** sits above the shell routes; it re-checks `auth:me` when the
   window regains focus (covers M3 auto-lock), and redirects to `/login`.
5. **Sidebar mirrors the Django org nav**, but with **flattened links** — no slug, no
   org switcher (single gym). Org switcher and "Create New Organization" are dropped
   (tenancy decision).
6. **Bootstrap from npm** (offline), not CDN. If `react-bootstrap` was not chosen in M0,
   hand-roll modal/toast primitives with plain `bootstrap` — keep it consistent.

## 4. Implementation steps

### 4.1 Query client (`src/renderer/src/lib/query.ts`)

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,          // match HTMX "table stays until invalidated"
      refetchOnWindowFocus: true, // re-checks auth after auto-lock / window focus
      retry: 1,
    },
    mutations: {
      onError: (err) => {
        // surfaced as a toast by the Toaster; see §4.3
        console.error("mutation failed", err);
      },
    },
  },
});
```

### 4.2 Toaster (`src/renderer/src/components/Toaster.tsx`)

Replaces `base.html`'s `notifiq` SweetAlert toast mixin with a Bootstrap toast stack:

```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastLevel = "success" | "info" | "warning" | "error";
interface Toast { id: number; level: ToastLevel; message: string }

const ToastCtx = createContext<(level: ToastLevel, message: string) => void>(() => {});

export function ToasterProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((level: ToastLevel, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, level, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-container position-fixed top-0 end-0 p-3">
        {toasts.map((t) => (
          <div key={t.id} className={`toast show text-bg-${t.level === "error" ? "danger" : t.level}`}>
            <div className="toast-body">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
```

`useToast()` is the replacement for `window.showToast(message, level)`. Success/error
toasts from mutations are pushed in the mutation's `onSuccess`/`onError`.

### 4.3 Auth gate + screens

`RequireAuth` — a wrapper around the shell routes. On mount it reads `auth:me`; a
`null` response redirects to `/login`. It also listens for window `focus` to re-check
(so M3 auto-lock drops an idle user back to the lock screen):

```tsx
// src/renderer/src/components/RequireAuth.tsx
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { call } from "../lib/api";

export function RequireAuth() {
  const [state, setState] = useState<"loading" | "ok" | "anon">("loading");

  const check = async () => {
    const me = await call(window.api.auth.me());
    setState(me ? "ok" : "anon");
  };

  useEffect(() => {
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, []);

  if (state === "loading") return <div className="p-5 text-center">Loading…</div>;
  return state === "ok" ? <Outlet /> : <Navigate to="/login" replace />;
}
```

`CreateAdminPage` / `LoginPage` are simple controlled forms calling
`window.api.auth.register` / `login`. On success: register → navigate `/`; login →
navigate `/`. On error: `ApiCallError.code === 'VALIDATION'` shows field errors from
`details`, otherwise a toast. `LoginPage` also pre-checks `auth:status`: if
`needsAdmin` it renders the create-admin form instead (first-run).

Route decision on entry (`/login`): `auth:status` → `{ needsAdmin, authenticated }` →
renders `CreateAdminPage` or `LoginPage` accordingly. This is the walking-skeleton
flow (M0→M3).

### 4.4 AppShell (`src/renderer/src/components/AppShell.tsx`)

Port of `base.html` layout: `main-wrapper` > `sidebar` + `page-wrapper` > `navbar` +
`page-content` (children) + `footer`.

```tsx
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";

export function AppShell() {
  return (
    <div className="main-wrapper">
      <Sidebar />
      <div className="page-wrapper">
        <Navbar />
        <div className="page-content">
          <Outlet />
        </div>
        <Footer />
      </div>
    </div>
  );
}
```

### 4.5 Sidebar (`src/renderer/src/components/Sidebar.tsx`)

Port of `partials/_sidebar.html`. Differences from Django: no `request.organization`,
no org switcher, no admin-gate on Settings (single admin):

```tsx
import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", icon: "box", end: true },
  { to: "/leads", label: "All Leads", icon: "users" },
  { to: "/accounting/sales", label: "Membership Sales", icon: "dollar-sign" },
  { to: "/accounting/receipts", label: "Receipts", icon: "book-open" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="sidebar-header">
        <a href="#" className="sidebar-brand">
          <p className="fs-4">{/* gym name from app_settings (M10) — fallback "Crown CRM" */}</p>
        </a>
      </div>
      <div className="sidebar-body">
        <ul className="nav">
          <li className="nav-item nav-category">Main</li>
          {links.map((l) => (
            <li key={l.to} className="nav-item">
              <NavLink to={l.to} end={l.end} className="nav-link">
                <i className="link-icon" data-feather={l.icon}></i>
                <span className="link-title">{l.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
```

Active-state styling comes from `NavLink` (replaces the `url_name`/`path|slice` template
logic). Feather icons are replaced once in `App.tsx` via the `feather-icons` npm package
(the Django `feather.replace()` on every HTMX swap becomes a single post-mount call;
React re-renders the `<i data-feather>` DOM, so call `feather.replace()` in a
`useEffect` after route changes, or use a small `<FeatherIcon>` component).

### 4.6 Navbar (`src/renderer/src/components/Navbar.tsx`)

Port of `partials/_navbar.html` minus the org switcher dropdown (single gym) and minus
the "Create New Organization" button. Keep: sidebar toggler, search input (non-functional
in the shell; wired to global search in M6), profile dropdown with the admin name/email
from `auth:me` and a Logout button (with the same `ConfirmDialog` "Are you sure?" pattern
from the Django navbar, but via our `ConfirmDialog` component).

### 4.7 Router (`src/renderer/src/router.tsx`)

```tsx
import { lazy, Suspense } from "react";
import { createHashRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";

const LoginPage = lazy(() => import("./features/auth/LoginPage"));
const DashboardPage = lazy(() => import("./features/dashboard/DashboardPage"));
const LeadsPage = lazy(() => import("./features/leads/LeadsPage"));

export const router = createHashRouter([
  {
    path: "/login",
    element: (
      <Suspense fallback={null}>
        <LoginPage />
      </Suspense>
    ),
  },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Suspense fallback={null}><DashboardPage /></Suspense> }, // M5
      { path: "leads", element: <Suspense fallback={null}><LeadsPage /></Suspense> },   // M6
      { path: "clients", element: <Suspense fallback={null}><ClientsPage /></Suspense> },
      { path: "accounting/sales", element: <Suspense fallback={null}><SalesPage /></Suspense> },
      { path: "accounting/receipts", element: <Suspense fallback={null}><ReceiptsPage /></Suspense> },
      { path: "logistics/services", element: <Suspense fallback={null}><ServicesPage /></Suspense> },
      { path: "logistics/products", element: <Suspense fallback={null}><ProductsPage /></Suspense> },
      { path: "settings", element: <Suspense fallback={null}><SettingsPage /></Suspense> },
    ],
  },
]);
```

Notes:

- **`createHashRouter`** — file-based routes inside Electron; hash routing avoids
  `will-navigate` friction (M2 hardening blocks `loadURL` navigations, but hash changes
  are same-document and safe).
- Lazy routes keep startup fast (master plan §1 performance research). Pages that do not
  exist yet (clients/sales/…) render a placeholder component until their module.
- `routes` mirror the master plan §5 Module 4 list exactly.

### 4.8 App root (`src/renderer/src/App.tsx`)

```tsx
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { queryClient } from "./lib/query";
import { ToasterProvider } from "./components/Toaster";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToasterProvider>
        <RouterProvider router={router} />
      </ToasterProvider>
    </QueryClientProvider>
  );
}
```

## 5. Acceptance criteria (definition of done)

1. First run: `/login` shows "Create Admin Account"; creating it lands on `/` (shell).
2. Re-login on restart: `auth:me` is `null` until the password is entered.
3. Sidebar/navbar/footer match the Django layout; active link states work.
4. Routes: `/`, `/leads`, `/clients`, `/accounting/sales`, `/accounting/receipts`,
   `/logistics/services`, `/logistics/products`, `/settings` all render (stubs allowed)
   with lazy loading.
5. `useToast()` shows success/error toasts; a failed mutation surfaces an error toast.
6. Window refocus after M3 auto-lock returns the user to `/login`.
7. No CDN references anywhere; Bootstrap/feather-icons load from npm bundles.
8. `npm run build` + `npm run lint` green.

## 6. Edge cases / gotchas

- **`auth:me` on startup** returns `null` (no persisted session) — the `RequireAuth`
  loading state must not flash a redirect before `me` resolves; gate on the `loading`
  state.
- **Hash router + `will-navigate`:** only block non-self navigations; hash changes are
  fine. Never use `window.location` (full reload) inside the renderer.
- **Feather icons:** `feather.replace()` is destructive; call it once after mount and
  after route changes, not on every render (or components will re-run it pointlessly).
- **Auto-lock UX:** the shell does not need a lock screen — redirecting to `/login`
  (with the flag cleared) is sufficient for v1; a dedicated lock screen is a later
  nicety.
- **First-run race:** `LoginPage` must not enable the login form before `auth:status`
  resolves, or it flashes the wrong screen.

## 7. Files touched

Created (in `crm-electron/`): `src/renderer/src/lib/query.ts`,
`src/renderer/src/components/{Toaster,RequireAuth,AppShell,Sidebar,Navbar,Footer,
ConfirmDialog}.tsx`, `src/renderer/src/router.tsx`,
`src/renderer/src/features/auth/{LoginPage,CreateAdminPage}.tsx`,
`src/renderer/src/features/{dashboard,leads,clients,accounting,logistics,settings}/index.tsx`
(stubs), `src/renderer/src/App.tsx` (rewritten), `src/renderer/src/main.tsx`.

Django files read (no writes): `templates/base.html`, `templates/partials/_sidebar.html`,
`templates/partials/_navbar.html`, `templates/partials/_footer.html`.

Next: M5 (DashboardPage content — metrics, charts, tables) and M6 (LeadsPage) replace the
stubs.
