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

  // 초기화 및 자동 갱신 예약
  useEffect(() => {
    let refreshTimer;

    const initAuth = async () => {
      const token = await refresh();
      setIsInitializing(false);

      if (token) {
        // 25분마다 갱신 예약
        refreshTimer = setInterval(refresh, 25 * 60 * 1000);
      }
    };

    initAuth();

    return () => {
      if (refreshTimer) clearInterval(refreshTimer);
    };
  }, [refresh]);

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
        backgroundColor: 'var(--bg-color, #f9f9f9)',
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
            <LoginPage onLogin={setAccessToken} />
          </PublicRoute>
        } />
        <Route path="/main" element={
          <ProtectedRoute accessToken={accessToken}>
            <MainPage accessToken={accessToken} onLogout={handleLogout} />
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
