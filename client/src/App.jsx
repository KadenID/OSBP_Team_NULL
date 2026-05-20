import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import LoginPage from "./Components/login_page/LoginPage";
import MainPage from "./Components/main_page/MainPage";
import MyPage from "./Components/my_page/MyPage";
import { API_BASE_URL } from "./apiConfig";

function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // 토큰 갱신 함수
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (response.ok && data.access_token) {
        setAccessToken(data.access_token);
        return data.access_token;
      }
    } catch (error) {
      console.error("Silent refresh failed:", error);
    }
    setAccessToken(null);
    return null;
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

  if (isInitializing) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>로딩 중...</div>;
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={setAccessToken} accessToken={accessToken} />} />
        <Route path="/main" element={<MainPage accessToken={accessToken} />} />
        <Route path="/mypage" element={<MyPage accessToken={accessToken} />} />
      </Routes>
    </Router>
  );
}

export default App;
