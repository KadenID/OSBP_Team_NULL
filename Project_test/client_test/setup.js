import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Global Fetch Mocking
vi.stubGlobal('fetch', vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ access_token: 'mock-access-token' }),
  })
));
