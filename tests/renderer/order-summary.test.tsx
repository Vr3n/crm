import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OrderSummary } from '../../src/renderer/src/features/memberships/sale/components/order-summary'

vi.mock('@/hooks/use-currency', () => ({ useCurrency: () => 'INR' }))

/**
 * The cheque-number field must appear only while CHEQUE is the selected
 * payment method, stay optional, and report keystrokes up to the form.
 */

function ChequeHarness(): React.JSX.Element {
  const [chequeNumber, setChequeNumber] = useState('')
  return (
    <OrderSummary
      paymentMethod="CHEQUE"
      chequeNumber={chequeNumber}
      onChequeNumberChange={setChequeNumber}
    />
  )
}
describe('OrderSummary — cheque number field', () => {
  it('shows an optional cheque number input when the payment type is CHEQUE', () => {
    render(<OrderSummary paymentMethod="CHEQUE" chequeNumber="CHQ-0042" />)

    expect(screen.getByLabelText(/cheque number/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('CHQ-0042')).toBeInTheDocument()
  })

  it('hides the cheque number input for any other payment type', () => {
    const { rerender } = render(<OrderSummary paymentMethod="UPI" />)
    expect(screen.queryByLabelText(/cheque number/i)).not.toBeInTheDocument()

    rerender(<OrderSummary paymentMethod="" />)
    expect(screen.queryByLabelText(/cheque number/i)).not.toBeInTheDocument()
  })

  it('reports typed cheque numbers through onChequeNumberChange', async () => {
    const user = userEvent.setup()
    render(<ChequeHarness />)

    await user.type(screen.getByLabelText(/cheque number/i), '123456')
    expect(screen.getByDisplayValue('123456')).toBeInTheDocument()
  })
})
