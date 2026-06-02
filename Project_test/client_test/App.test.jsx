import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../../Project/client/src/App'; // 경로 수정
import { MemoryRouter } from 'react-router-dom';

describe('App Component', () => {
  it('renders without crashing', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    );
  });
});
