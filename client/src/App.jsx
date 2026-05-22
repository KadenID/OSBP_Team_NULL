import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';

import LoginPage from "./Components/login_page/LoginPage";
import MainPage from "./Components/main_page/MainPage";
import MyPage from "./Components/my_page/MyPage";
import { API_BASE_URL } from "./apiConfig";

// 보호된 라우트 컴포넌트: 로그인하지 않은 사용자의 접근을 차단
const ProtectedRoute = ({ accessToken, children }) => {
  const location = useLocation();
  if (!accessToken) {
    // 현재 위치를 저장하여 로그인 후 다시 돌아올 수 있게 함
    return <Navigate to="/" state={{ from: location }} replace />;
  }
  return children;
};

// 공개 전용 라우트 컴포넌트: 로그인한 사용자가 로그인 페이지에 접근하는 것을 차단
const PublicRoute = ({ accessToken, children }) => {
  const location = useLocation();
  const from = location.state?.from?.pathname || "/main";
  if (accessToken) {
    return <Navigate to={from} replace />;
  }
  return children;
};

function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const refreshPromise = useRef(null); // 진행 중인 refresh 요청 저장


  // 다크모드 테마 관리 로직
  const getSystemTheme = () => {
    const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
      return systemDark ? "dark" : "light";
  };

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || getSystemTheme();
  });

  // 테마 상태가 변경될 때마다 저장
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // 실시간으로 시스템 테마가 변경되면 브라우저 테마도 자동 연동
  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return;

    const handleSystemThemeChange = (event) => {
      // 시스템 설정이 바뀌면, 수동 모드를 해제하고 시스템 설정을 강제로 따름
      localStorage.removeItem("theme"); 
      const systemTheme = event.matches ? "dark" : "light";
      setTheme(systemTheme);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, []);

  // 테마 스위치 토글 함수
  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  }, []);


  // 토큰 갱신 함수
  const refresh = useCallback(async () => {
    // 이미 요청이 진행 중이면 해당 요청의 결과를 기다림 (경쟁 상태 방지)
    if (refreshPromise.current) return refreshPromise.current;

    refreshPromise.current = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        const data = await response.json();

        if (response.ok && data.access_token) {
          setAccessToken(data.access_token);
          return data.access_token;
        } else if (response.status === 401) {
          setAccessToken(null);
        }
      } catch (error) {
        console.error("Silent refresh network error:", error);
      } finally {
        refreshPromise.current = null; // 요청 완료 후 초기화
      }
      return null;
    })();

    return refreshPromise.current;
  }, []);

  // 초기화: 마운트 시점에 silent refresh 시도
  useEffect(() => {
    const initAuth = async () => {
      await refresh();
      setIsInitializing(false);
    };
    initAuth();
  }, [refresh]);

  // 자동 갱신 예약: accessToken 상태에 따라 타이머 관리
  useEffect(() => {
    let refreshTimer;

    if (accessToken) {
      // 25분마다 갱신 예약
      refreshTimer = setInterval(() => {
        refresh();
      }, 25 * 60 * 1000);
    }

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [accessToken, refresh]);

  // 로그아웃 함수
  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: "POST",
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      setAccessToken(null);
    }
  }, [accessToken]);

  if (isInitializing) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: 'var(--background-color, #ffffff)',
        color: 'var(--text-color, #333)'
      }}>
        로딩 중...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={
          <PublicRoute accessToken={accessToken}>
            <LoginPage onLogin={setAccessToken} theme={theme} toggleTheme={toggleTheme}/>
          </PublicRoute>
        } />
        <Route path="/main" element={
          <ProtectedRoute accessToken={accessToken}>
            <MainPage accessToken={accessToken} onLogout={handleLogout} theme={theme} toggleTheme={toggleTheme} />
          </ProtectedRoute>
        } />
        <Route path="/mypage" element={
          <ProtectedRoute accessToken={accessToken}>
            <MyPage accessToken={accessToken} onLogout={handleLogout} />
          </ProtectedRoute>
        } />
        {/* 잘못된 경로 접근 시 메인으로 이동 */}
        <Route path="*" element={<Navigate to="/main" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
