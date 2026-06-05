import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// 전역 테마 관리를 위한 Context 생성
const ThemeContext = createContext(undefined);

// 테마 상태를 앱 전체에 주입해주는 Provider 컴포넌트
export const ThemeProvider = ({ children }) => {
  
  // 시스템 기본 테마(다크모드 여부) 감지 함수
  const getSystemTheme = () => {
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
    return systemDark ? "dark" : "light";
  };

  // 로컬스토리지에 저장된 테마를 우선 적용, 없으면 시스템 설정을 따름
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || getSystemTheme());

  
  // 테마 상태가 변경될 때마다 HTML 태그의 data-theme 속성 갱신
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);


  // 실시간 시스템 테마 변경 감지 및 브라우저 크로스 호환성 대응
  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return;

    const handleSystemThemeChange = (event) => {
      // 시스템 설정이 변경되면, 기존 수동 설정을 해제하고 시스템 설정을 강제 동기화
      localStorage.removeItem("theme"); 
      setTheme(event.matches ? "dark" : "light");
    };

    // 브라우저 호환성 개선
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
      return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(handleSystemThemeChange);
      return () => mediaQuery.removeListener(handleSystemThemeChange);
    }
  }, []);

  // 테마 스위치 토글 함수
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }, []);


  // 하위 컴포넌트 전역에서 사용할 테마 상태와 제어 함수 바인딩
  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};


// 하위 페이지 및 컴포넌트에서 테마를 간편하게 꺼내 쓰기 위한 커스텀 훅
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme은 ThemeProvider 컨텍스트 내부에서만 사용 가능합니다.");
  }
  return context;
};