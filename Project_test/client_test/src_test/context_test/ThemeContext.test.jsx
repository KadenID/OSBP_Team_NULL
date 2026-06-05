import { render, screen, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ThemeProvider, useTheme } from "../../../../Project/client/src/context/ThemeContext";

const TestComponent = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-text">{theme}</span>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
};

describe('ThemeContext 유닛 테스트', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ThemeProvider가 테마 값을 정상적으로 제공하는가', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const themeText = screen.getByTestId('theme-text');
    expect(themeText.textContent).toBeDefined();
  });

  it('버튼 클릭 시 테마가 변경되고 localStorage에 저장되는가', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const themeText = screen.getByTestId('theme-text');
    const toggleBtn = screen.getByRole('button', { name: /toggle/i });

    const initialTheme = themeText.textContent;
    const expectedTheme = initialTheme === 'light' ? 'dark' : 'light';

    act(() => {
      toggleBtn.click();
    });

    expect(themeText.textContent).toBe(expectedTheme);
    expect(localStorage.getItem('theme')).toBe(expectedTheme);
  });

  it('localStorage에 저장된 테마가 있으면 시스템 테마보다 우선 적용되는가', () => {
    localStorage.setItem('theme', 'dark');

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
      matches: false, // 시스템은 light
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme-text').textContent).toBe('dark');
  });

  it('시스템 테마 변경을 감지하고 동기화하는가 (addEventListener 브랜치)', () => {
    const addEventListenerMock = vi.fn();
    const removeEventListenerMock = vi.fn();

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: removeEventListenerMock,
    })));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(addEventListenerMock).toHaveBeenCalledWith('change', expect.any(Function));

    const callback = addEventListenerMock.mock.calls[0][1];
    act(() => {
      callback({ matches: true });
    });

    expect(screen.getByTestId('theme-text').textContent).toBe('dark');
    // 시스템 변경 감지 시 localStorage 수동 설정이 제거되어야 함
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('시스템 테마 변경 감지 — light으로 전환되는가', () => {
    const addEventListenerMock = vi.fn();

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
      matches: true, // 초기 다크모드
      media: query,
      addEventListener: addEventListenerMock,
      removeEventListener: vi.fn(),
    })));

    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const callback = addEventListenerMock.mock.calls[0][1];
    act(() => {
      callback({ matches: false }); // 라이트모드로 변경
    });

    expect(screen.getByTestId('theme-text').textContent).toBe('light');
  });

  it('레거시 브라우저에서 addListener/removeListener 브랜치가 작동하는가 (Lines 40-42)', () => {
    const addListenerMock = vi.fn();
    const removeListenerMock = vi.fn();

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      // addEventListener 없음 → addListener 폴백 분기 실행
      addEventListener: undefined,
      addListener: addListenerMock,
      removeListener: removeListenerMock,
    })));

    const { unmount } = render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(addListenerMock).toHaveBeenCalledWith(expect.any(Function));

    // 콜백 수동 실행 — 다크모드 전환
    const callback = addListenerMock.mock.calls[0][0];
    act(() => {
      callback({ matches: true });
    });

    expect(screen.getByTestId('theme-text').textContent).toBe('dark');

    // 언마운트 시 removeListener 호출 확인
    unmount();
    expect(removeListenerMock).toHaveBeenCalledWith(callback);
  });

  it('matchMedia가 없는 환경에서 early return이 작동하는가', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(() =>
      render(
        <ThemeProvider>
          <TestComponent />
        </ThemeProvider>
      )
    ).not.toThrow();
  });

  it('useTheme을 Provider 밖에서 사용하면 에러를 던지는가', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<TestComponent />)).toThrow(
      'useTheme은 ThemeProvider 컨텍스트 내부에서만 사용 가능합니다.'
    );

    consoleSpy.mockRestore();
  });
});