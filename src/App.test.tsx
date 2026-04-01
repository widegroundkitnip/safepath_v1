import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import App from './App'

describe('App', () => {
  test('renders the browser fallback shell and settings workflow', async () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Safepath' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(
      await screen.findByRole('heading', { name: 'Generate messy fake datasets for scanning' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'History' }))
    expect(await screen.findByText('No history yet')).toBeInTheDocument()
  })
})
