import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/shared/contracts/errors'
import type { ReferenceData } from '../../src/shared/contracts/sales'
import { NewLeadDialog } from '@/features/leads/components/new-lead-dialog'
import { renderWithClient, referenceData } from './setup'

function renderDialog(): ReturnType<typeof renderWithClient> & { onOpenChange: ReturnType<typeof vi.fn> } {
  const onOpenChange = vi.fn()
  const utils = renderWithClient(<NewLeadDialog open onOpenChange={onOpenChange} />)
  return { ...utils, onOpenChange }
}

const createButton = (): HTMLElement => screen.getByRole('button', { name: 'Create lead' })
const nameInput = (): HTMLElement => screen.getByLabelText(/^Name/)
const phoneInput = (): HTMLElement => screen.getByLabelText(/^Phone/)
const sourceTrigger = (): HTMLElement => screen.getByRole('combobox')

/** Fill the required fields so the form can submit, then wait for the source to be seeded. */
async function fillRequired(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await waitFor(() => expect(sourceTrigger()).toHaveTextContent('Walk-in'))
  await user.type(nameInput(), 'Rahul Mehta')
  await user.type(phoneInput(), '9876501234')
}

describe('NewLeadDialog', () => {
  it('keeps the submit button disabled until the required fields are valid', async () => {
    renderDialog()
    const user = userEvent.setup()

    expect(createButton()).toBeDisabled()

    await user.type(nameInput(), 'Rahul Mehta')
    await user.type(phoneInput(), '9876501234')

    await waitFor(() => expect(createButton()).toBeEnabled())
  })

  it('reacts live: red while a field is incomplete, green once it is valid', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(nameInput(), 'R')

    // completeWhen flips as soon as there is input, so the field evaluates live.
    expect(screen.getByText('Enter the person\u2019s full name')).toBeInTheDocument()
    expect(nameInput()).toHaveAttribute('aria-invalid', 'true')
    expect(nameInput()).not.toHaveAttribute('data-valid')

    await user.type(nameInput(), 'ahul Mehta')

    expect(nameInput()).not.toHaveAttribute('aria-invalid')
    expect(nameInput()).toHaveAttribute('data-valid', 'true')
    expect(screen.queryByText('Enter the person\u2019s full name')).not.toBeInTheDocument()
  })

  it('shows a live phone counter and strips non-digit input', async () => {
    renderDialog()
    const user = userEvent.setup()

    expect(screen.getByText('10 digits remaining')).toBeInTheDocument()

    await user.type(phoneInput(), '98')
    expect(screen.getByText('8 digits remaining')).toBeInTheDocument()

    await user.type(phoneInput(), '76501234')
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).toHaveValue('9876501234')

    // Extra digits beyond the 10-digit cap are dropped.
    await user.type(phoneInput(), '555')
    expect(phoneInput()).toHaveValue('9876501234')
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('explains a too-short phone with a granular error after blur', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '98765012')
    await user.tab()

    expect(screen.getByText('Enter all 10 digits')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createButton()).toBeDisabled()
  })

  it('flags a wrong starting digit immediately, without waiting for 10 digits', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '5')

    expect(screen.getByText('Start with 6-9 (mobile) or 0/2 (landline)')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true')
    expect(createButton()).toBeDisabled()
  })

  it('accepts a landline starting with 0 (mobile or landline)', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '0221234567')

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).not.toHaveAttribute('aria-invalid')
    expect(phoneInput()).toHaveAttribute('data-valid', 'true')
  })

  it('accepts a landline starting with 2', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(phoneInput(), '2212345678')

    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(phoneInput()).toHaveAttribute('data-valid', 'true')
  })

  it('wires the helper line through aria-describedby', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.click(phoneInput())
    await user.tab()

    const phone = phoneInput()
    expect(phone).toHaveAttribute('aria-describedby', 'phone-error')
    expect(document.getElementById('phone-error')).toHaveTextContent(
      'Mobile number is required'
    )
  })

  it('treats email as optional but validates it granularly once typed', async () => {
    renderDialog()
    const user = userEvent.setup()

    const email = screen.getByLabelText(/^Email/)

    // Optional: an empty email is not an error.
    await user.click(email)
    await user.tab()
    expect(screen.queryByText('Enter a valid email')).not.toBeInTheDocument()

    await user.type(email, 'rahul.example.com')
    await user.tab()
    expect(screen.getByText('Email must contain an @')).toBeInTheDocument()

    await user.type(email, 'rahul@example.com')
    expect(email).toHaveAttribute('data-valid', 'true')
    expect(screen.queryByText('Email must contain an @')).not.toBeInTheDocument()
  })

  it('creates the lead with the full payload, plan/goal/notes included', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)
    await user.type(screen.getByLabelText(/^Email/), 'rahul@example.com')
    await user.type(screen.getByLabelText(/^Plan interest/), 'Annual Premium')
    await user.type(screen.getByLabelText(/^Goal/), 'Weight loss')
    await user.type(screen.getByLabelText(/^Notes/), 'Wants the morning batch')

    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith({
        fullName: 'Rahul Mehta',
        phone: '9876501234',
        email: 'rahul@example.com',
        sourceId: 1,
        planInterest: 'Annual Premium',
        goal: 'Weight loss',
        notes: 'Wants the morning batch'
      })
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('surfaces a backend ApiError inline instead of a toast', async () => {
    vi.mocked(window.api.leads.create).mockRejectedValueOnce(
      new ApiError('CONFLICT', 'A lead with this phone already exists')
    )

    renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)
    await user.click(createButton())

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'A lead with this phone already exists'
      )
    })
    expect(screen.queryByText('Created!')).not.toBeInTheDocument()
  })

  it('does not call create when the form is invalid', async () => {
    renderDialog()
    const user = userEvent.setup()

    await user.type(nameInput(), 'Rahul Mehta')
    await user.type(phoneInput(), '98765012')

    expect(createButton()).toBeDisabled()
    expect(window.api.leads.create).not.toHaveBeenCalled()
  })

  it('seeds the source to the first active source once reference data arrives', async () => {
    let resolve!: (data: ReferenceData) => void
    vi.mocked(window.api.leads.getReferenceData).mockReturnValue(
      new Promise<ReferenceData>((res) => {
        resolve = res
      })
    )

    renderDialog()

    // Vocabulary still loading: the select shows its placeholder and submit stays disabled.
    expect(sourceTrigger()).toHaveTextContent('Where did they come from?')
    expect(createButton()).toBeDisabled()

    resolve(referenceData)

    await waitFor(() => expect(sourceTrigger()).toHaveTextContent('Walk-in'))
  })

  it('lets the user pick a source and submits it', async () => {
    const { onOpenChange } = renderDialog()
    const user = userEvent.setup()

    await fillRequired(user)

    await user.click(sourceTrigger())
    await user.click(screen.getByRole('option', { name: 'Instagram' }))

    await user.click(createButton())

    await waitFor(() => {
      expect(window.api.leads.create).toHaveBeenCalledTimes(1)
      expect(window.api.leads.create).toHaveBeenCalledWith(
        expect.objectContaining({ sourceId: 2 })
      )
    })

    await waitFor(() => expect(screen.getByText('Created!')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})
