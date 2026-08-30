````plaintext
Build a reusable Next.js + TypeScript shadcn/ui autocomplete component named `AutocorrectCombobox`.

The component must integrate with:

- TanStack Form for form state and validation.
- TanStack Query for asynchronous searching and creation.
- shadcn/ui Combobox, Command, Popover, Button, Spinner, Field, and related primitives.

The component should search backend-backed values as the user types. If no exact matching value exists, display:

+ Add <search_text>

When the user selects an existing option, store its backend ID in the TanStack Form field. When the user selects the add option, create the value through a TanStack Query mutation, then automatically select the returned backend ID.

## Required packages

Use the project’s existing package manager to install:

```bash
pnpm add @tanstack/react-form @tanstack/react-query
````

Use the installed versions and inspect their current APIs rather than assuming outdated syntax.

## Option types

Create reusable types:

```typescript
export type AutocorrectOption<TId extends string | number = string> = {
  id: TId
  label: string
  description?: string
}
```

Define a search function type:

```typescript
export type SearchOptions<TId extends string | number = string> = (
  query: string,
  signal?: AbortSignal
) => Promise<AutocorrectOption<TId>[]>
```

Define a create function type:

```typescript
export type CreateOption<TId extends string | number = string> = (
  label: string,
  signal?: AbortSignal
) => Promise<AutocorrectOption<TId>>
```

## TanStack Form integration

The component should work as a field adapter instead of owning its own form state.

Support a field prop compatible with a TanStack Form field API:

```typescript
type AutocorrectFieldProps<TId extends string | number> = {
  field: {
    state: {
      value: TId | null | undefined
      meta: {
        isTouched: boolean
        isValid: boolean
        errors: unknown[]
      }
    }
    handleChange: (value: TId | null) => void
    handleBlur: () => void
  }
}
```

If the project uses a different TanStack Form field type, adapt the type to the installed version instead of using `any`.

The component must:

- Read the selected backend ID from `field.state.value`.
- Call `field.handleChange(option.id)` when selecting an existing option.
- Call `field.handleChange(createdOption.id)` after creating a new option.
- Call `field.handleChange(null)` when clearing the field.
- Call `field.handleBlur()` when the combobox loses focus or closes.
- Display validation errors from `field.state.meta.errors`.
- Set `aria-invalid` when the field is invalid.
- Use shadcn `Field`, `FieldLabel`, `FieldDescription`, and `FieldError` where available.
- Never store the display label as the form value. The form value must always be the backend ID.

Example usage:

```typescriptreact
const form = useForm({
  defaultValues: {
    customerId: null as string | null,
  },
  onSubmit: async ({ value }) => {
    await saveOrder({
      customerId: value.customerId,
    })
  },
})

<form.Field
  name="customerId"
  validators={{
    onChange: ({ value }) =>
      value ? undefined : "Please select a customer.",
  }}
>
  {(field) => (
    <AutocorrectCombobox
      field={field}
      label="Customer"
      placeholder="Select a customer"
      search={searchCustomers}
      create={createCustomer}
    />
  )}
</form.Field>
```

## TanStack Query integration

Use TanStack Query inside the component.

The component should:

- Use `useQuery` for search results.
- Use `useMutation` for creating a missing option.
- Use a debounced query string.
- Disable the query when:

- The popover is closed.
- The trimmed query is shorter than `minSearchLength`.

- Use a stable query key such as:

```typescript
;['autocorrect-options', query]
```

- Pass an `AbortSignal` to the search callback when supported.
- Use `enabled` rather than manually fetching inside `useEffect`.
- Do not call `fetch` directly inside `useEffect`.
- Configure a reasonable `staleTime`, such as 30 seconds.
- Keep previous search results visible while a new query is loading when supported by the installed TanStack Query version.
- Use `isPending`, `isFetching`, `isError`, and `error` to render appropriate states.
- Use a mutation for creation:

```typescript
const createMutation = useMutation({
  mutationFn: ({ label }: { label: string }) => create(label, abortSignal),
  onSuccess: (createdOption) => {
    field.handleChange(createdOption.id)
  }
})
```

Adapt the implementation to the installed TanStack Query API.

After successful creation:

- Select the returned option ID.
- Preserve the returned option label for display.
- Close the popover.
- Clear or reset the search input.
- Optionally update or invalidate the relevant query cache.
- Prevent duplicate creation while the mutation is pending.

## Component props

Implement props similar to:

```typescript
type AutocorrectComboboxProps<TId extends string | number = string> = {
  field: AutocorrectFieldAdapter<TId>

  search: SearchOptions<TId>
  create: CreateOption<TId>

  label?: string
  description?: string
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  minSearchLength?: number
  debounceMs?: number
  disabled?: boolean
  className?: string
}
```

The parent should provide backend callbacks. Do not hardcode API URLs, database queries, or mock data inside the reusable component.

## UI behavior

Use shadcn Combobox composition:

- A `Popover` controls the dropdown.
- A `Button` acts as the combobox trigger.
- A `Command` contains the search input and options.
- Use `CommandInput`, `CommandList`, `CommandEmpty`, `CommandGroup`, and `CommandItem`.
- Use `Check` for the selected option.
- Use `Plus` for the create option.
- Use `Spinner` or an equivalent shadcn loading indicator.

The trigger should display:

- The selected option label when selected.
- The placeholder when no value is selected.
- A clear action when appropriate.

The command list should display:

1. Loading state while searching.
2. Error state when searching fails.
3. Existing matching options.
4. An add option when appropriate.
5. Empty state when no results and creation is not possible.

Each option should support:

- Mouse selection.
- Arrow-key navigation.
- Enter selection.
- Escape to close.
- Screen reader announcements.

## Add-option rules

For a query such as `Acme`, show:

```plaintext
+ Add Acme
```

Only show the add option when:

- The trimmed query is not empty.
- The query meets `minSearchLength`.
- There is no exact case-insensitive match.
- A create mutation is not already pending.
- The component is not disabled.

Do not show the add option for an exact match such as:

- `Acme` when an option is labeled `Acme`.
- `acme` when an option is labeled `Acme`.

Use normalized comparison:

```typescript
const normalized = query.trim().toLocaleLowerCase()
```

Do not use the search result label as the selected form value. Always use the option’s backend `id`.

## Selected label preservation

The form field stores only the ID, but the UI needs to display the selected label.

Support one of these strategies:

Recommended:

```typescript
selectedOption?: AutocorrectOption<TId> | null
```

If `selectedOption` is not provided:

- Keep the most recently selected option in component state.
- Update it when an existing or newly created option is selected.
- Use the cached selected option label even if it is absent from the current search results.

For edit forms, prefer accepting `selectedOption` or a `getOptionById` callback so the selected label can be loaded from the backend.

## Debouncing

Implement debouncing without fetching inside `useEffect`.

Accept a `debounceMs` prop, defaulting to approximately 250–300ms.

If a small custom debounce hook is necessary, it may update debounced state inside an effect, but the actual backend request must be performed by TanStack Query.

Avoid race conditions:

- Cancel stale requests with `AbortController` where possible.
- Use TanStack Query’s query key to separate results.
- Never allow an older response to overwrite newer results.

## Error handling

Search errors should render an accessible error message inside the command list.

Creation errors should:

- Keep the popover open.
- Keep the typed query intact.
- Display an inline error.
- Allow the user to retry.
- Avoid duplicate submissions.

Do not expose raw server errors directly to users unless safe. Prefer a friendly fallback message.

## Accessibility

Implement:

- A visible or screen-reader-only label.
- `aria-expanded` on the trigger.
- `aria-controls` for the popup content.
- `aria-invalid` based on TanStack Form metadata.
- `aria-describedby` for descriptions and errors.
- Keyboard navigation through Command.
- Correct focus management through Popover.
- A screen-reader-only status for loading and creation.
- No inaccessible clickable `div` elements.

For Enter handlers, account for IME composition:

```typescript
if (event.nativeEvent.isComposing || event.keyCode === 229) {
  return
}
```

Do not submit the enclosing form when Enter is only selecting an autocomplete option.

## Demo page

Update `app/page.tsx` with a working TanStack Form demo.

The demo should:

- Create a TanStack Query client.
- Render the form inside `QueryClientProvider`.
- Create a TanStack Form with a field named `customerId`.
- Search a simulated list of customers through an async callback.
- Create a new customer with a generated UUID.
- Submit the form and display the selected backend ID.
- Show the selected customer label separately.
- Include validation requiring a customer selection.
- Demonstrate:

1. Existing-option search.
2. Existing-option selection.
3. Missing-option creation.
4. Automatic selection of the created UUID.
5. Form validation error.
6. Loading and mutation states.

Example callback shape:

```typescript
const searchCustomers = async (query: string, signal?: AbortSignal) => {
  await delay(300, signal)

  const normalizedQuery = query.trim().toLowerCase()

  return customers.filter((customer) => customer.label.toLowerCase().includes(normalizedQuery))
}

const createCustomer = async (label: string, signal?: AbortSignal) => {
  await delay(500, signal)

  return {
    id: crypto.randomUUID(),
    label,
    description: 'Created just now'
  }
}
```

Use a real database callback in production. The demo may use temporary in-memory data only to illustrate the integration.

## Project structure

Use:

```plaintext
components/
  autocorrect-combobox.tsx

app/
  page.tsx
  layout.tsx
```

If a Query provider is reused across the app, create:

```plaintext
components/
  providers.tsx
```

The provider should create the `QueryClient` once per browser session:

```typescriptreact
'use client'

const [queryClient] = useState(
  () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000
        }
      }
    })
)
```

Do not instantiate a new `QueryClient` on every render.

## Styling requirements

Follow shadcn conventions:

- Use semantic tokens.
- Use `cn()` for conditional classes.
- Use `gap-*`, not `space-y-*` or `space-x-*`.
- Use `size-*` for equal width and height.
- Do not use raw colors such as `text-white`, `bg-black`, or `bg-blue-500`.
- Use at most two font families.
- Keep the UI responsive and mobile-friendly.
- Use proper `Field` composition rather than arbitrary form layout markup.

## Validation

After implementation:

1. Run the project type checker or production build.
2. Verify the page in a real browser.
3. Test searching for an existing option.
4. Test selecting an existing option.
5. Test adding a missing option.
6. Confirm the TanStack Form field contains only the backend ID.
7. Confirm the created option’s returned ID is automatically selected.
8. Test validation errors.
9. Test search errors.
10. Test creation errors.
11. Test keyboard navigation.
12. Test loading states.
13. Confirm no request is made below the minimum query length.
14. Confirm stale search results do not overwrite newer results.

```plaintext

The key architectural rule is: **TanStack Form owns the selected backend ID, while TanStack Query owns asynchronous searching and creation.** The combobox should only manage transient UI state such as the open state, search text, and cached display label.
```
