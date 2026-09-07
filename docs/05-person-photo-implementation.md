# Person Photo Implementation (Issue #106)

## Overview

Allow front desk staff to add a photograph of a Person for easy identification. Photo belongs to the **Person** entity (not Lead or Customer) so it persists across lifecycle changes (Lead → Customer conversion).

## Architecture Decision

**Photo belongs to Person.** When a Lead converts to a Customer, the photo persists because both reference the same `person_id`. This is enforced at the domain level — the `UpdatePersonPhoto` use case operates on `personId`, not on lead or customer IDs.

## Data Flow

```
Renderer                    IPC                     Application             Storage
─────────────────────────────────────────────────────────────────────────────────
PersonAvatar
  ├─ File picker ──────► window.api.person ──────► updatePersonPhoto ──► photo-storage.ts
  │   (base64)              .updatePhoto()           │                    (disk)
  │                                                  │
  ├─ Webcam capture ───► window.api.person ──────► updatePersonPhoto ──► photo-storage.ts
  │   (base64)              .updatePhoto()           │                    (disk)
  │                                                  │
  └─ Display ◄───────── window.api.person ◄────── getPersonPhoto ◄────── readFileSync
                           .getPhoto()              (returns base64)
```

## File Storage

- Location: `{userData}/photos/{organization_id}/`
- Filename: `{uuid}.{ext}` — extension preserved from original
- Allowed types: jpg, jpeg, png, webp
- Max size: 5 MB
- Old photo deleted when replaced

## Schema

### `people` table
```sql
photo_filename TEXT  -- UUID-based filename, nullable
```

## Backend Files

| File | Purpose |
|------|---------|
| `src/main/lib/photo-storage.ts` | Disk I/O: save, delete, validate photos |
| `src/main/application/person-photo.ts` | Use cases: updatePersonPhoto, deletePersonPhoto, getPersonPhoto |
| `src/main/ipc/person.ts` | IPC handler registration |
| `src/shared/contracts/person-photo.ts` | Zod schemas + TypeScript types |
| `src/preload/index.ts` | Exposes `window.api.person.*` |

## Frontend Files

| File | Purpose |
|------|---------|
| `src/renderer/src/features/people/person-photo.ts` | Shared TanStack Query hooks |
| `src/renderer/src/components/person/person-avatar.tsx` | Main avatar component |
| `src/renderer/src/components/person/photo-uploader.tsx` | File picker sub-component |
| `src/renderer/src/components/person/photo-capturer.tsx` | Webcam trigger sub-component |
| `src/renderer/src/components/person/webcam-capture-dialog.tsx` | Webcam capture modal |
| `src/renderer/src/components/person/photo-constants.ts` | Validation + file reading utils |

## PersonAvatar Component

### Two Operating Modes

**Persisted mode** (personId passed):
- Fetches photo via `usePersonPhoto(personId)`
- Saves via `useUpdatePersonPhoto()`
- Deletes via `useDeletePersonPhoto()`
- Used in: Edit Lead dialog, Lead Detail, Customer Detail

**Transient mode** (no personId, onPendingChange callback):
- Holds photo in local state
- Emits `{ filename, data }` to parent via `onPendingChange`
- Parent uploads after entity creation
- Used in: New Lead form

### Props

```typescript
interface PersonAvatarProps {
  personId?: number        // persisted mode
  name: string             // for initials fallback
  size?: 'sm' | 'default' | 'lg'
  editable?: boolean       // show upload/capture/delete controls
  onPendingChange?: (photo: PendingPhoto | null) => void  // transient mode
}
```

### Upload/Capture Toggle

When `editable=true` and no photo exists, the component renders a segmented toggle:
- **Upload** — file picker (jpg/png/webp, max 5MB)
- **Capture** — webcam capture dialog

Clicking either activates that mode and shows the corresponding sub-component.

## Integration Points

### New Lead Form
- Renders `PersonAvatar` above Full name input (transient mode)
- Photo stored in local state during form fill
- After lead creation (`CreatedLead` returns `personId`), photo is uploaded via `updatePersonPhoto`

### Edit Lead Dialog
- Renders `PersonAvatar` above Full name input (persisted mode, `personId` from lead)
- Photo changes save immediately via IPC

### Lead Detail Identity Card
- Renders `PersonAvatar` in header with edit/delete controls
- Permission-gated by `lead.edit`

### Customer Detail Identity Card
- Renders `PersonAvatar` in header with edit/delete controls
- Uses `personId` from customer output (added to contract)
- Permission-gated by `lead.edit`

## Backend Modification: `getPersonPhoto`

The `getPersonPhoto` use case was updated to:
1. Read the photo file from disk
2. Return base64-encoded data in the `photoData` field
3. Return absolute path in `photoPath` field

This avoids Electron's `file://` protocol restrictions — the renderer can display photos directly via `data:image/jpeg;base64,...` URLs.

## Tests

- `tests/renderer/new-lead-dialog.test.tsx` — existing tests pass (form still works with avatar added)
- `tests/renderer/leads-page.test.tsx` — existing tests pass
- Component tests for PersonAvatar: pending (TODO)

## Table Avatars with Batch Photo Loading

### Problem

Many table rows each render a `PersonAvatar` needing a photo fetch. Individual IPC calls per row would be wasteful.

### Solution: `batshit` Windowed Batcher

Uses `@yornaath/batshit` (TanStack-recommended) to batch per-person `usePersonPhoto` calls into a single `person.photo:getMany` IPC call within a 10ms window.

**Flow:**
```
Table renders 20 PersonCells
  └─ Each calls usePersonPhoto(personId)
       └─ Each calls photoBatcher.fetch(personId)
            └─ Within 10ms window, batshit coalesces into:
                 window.api.person.getPhotos({ personIds: [1,2,3,...20] })
                   └─ One IPC → main reads 20 files → returns Record<personId, base64|null>
```

**Caching:** `staleTime: 5 minutes`. Photos are static — only invalidated on explicit update/delete mutations (which call `qc.invalidateQueries`).

### Batch IPC

| Item | Value |
|------|-------|
| Channel | `person.photo:getMany` |
| Input | `{ personIds: number[] }` |
| Output | `{ photos: Record<number, string \| null> }` |
| Permission | `LEAD_VIEW` |
| Backend | `getManyPersonPhotos()` in `application/person-photo.ts` |

### PersonCell Component

`src/renderer/src/components/person/person-cell.tsx` — reusable avatar+name cell used across all tables.

```tsx
<PersonCell personId={number|string} name={name} subtext={ReactNode?} />
```

Renders `PersonAvatar` (size="sm", editable=false) + name + optional subtext.

### Tables with Person Avatars

| Table | personId source |
|-------|----------------|
| Lead Table | `lead.personId` |
| Follow-ups Table | `FollowUpRow.personId` (added) |
| Customer Table | `customer.personId` |
| Memberships Table | `MembershipRow.personId` (added) |
| Invoices Table | `Invoice.customer.personId` (added) |
| Recent Leads (dashboard) | `lead.personId` |
| Upcoming Followups (dashboard) | `FollowUpRow.personId` |
| Membership Expirations (dashboard) | `member.personId` (added to PersonRef) |
| Payments Due (dashboard) | `member.personId` (added to PersonRef) |
| Leads Going Cold (dashboard) | `lead.personId` |
| Payments (finance) | `customer.personId` (added) |
| Refunds (finance) | `customer.personId` (added) |
| Credits (finance) | `customer.personId` (added) |
| Receivables (finance) | `FinanceInvoice.customer.personId` |

### Backend `personId` Surfacing

Added `personId` to these IPC output contracts:

| Contract | Field |
|----------|-------|
| `dashboard.ts` `DashboardPersonRef` | `member.personId` |
| `invoices.ts` `CustomerRef` | `customer.personId` |
| `collections.ts` `CollectionCustomerRef` | `customer.personId` |
| `finance.ts` (getAllPayments/Refunds/Credits) | `customer.personId` |
