import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from '../../Project/client/src/App';
import { MemoryRouter } from 'react-router-dom';

describe('App Component', () => {
  it('renders without crashing and performs initial auth check', async () => {
    render(
      <App />
    );

    // fetch가 최소 한 번은 호출되었는지 확인 (silent refresh)
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});

