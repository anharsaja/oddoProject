import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Registered by hand because Testing Library only installs its own cleanup hook
// when the test globals are enabled, and this project keeps them off.
afterEach(() => {
  cleanup()
})
