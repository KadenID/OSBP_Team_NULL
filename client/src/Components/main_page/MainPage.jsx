import React, { useState, useEffect } from 'react';
import './MainPage.css';
import AssignmentTab from "../assignment-tab/AssignmentTab.jsx";
import NoticeTab from "../notice-tab/NoticeTab.jsx";
import { useNavigate } from "react-router-dom";
import { FiHome } from "react-icons/fi";

function MainPage({ accessToken, onLogout }) {

  const navigate = useNavigate();

  // 초기 테마 설정
  // 저장된 테마가 없으면 시스템 테마를 초기값으로 사용
  const getSystemTheme = () => {
   const systemDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;

    return systemDark ? "dark" : "light";
  };

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("theme") || getSystemTheme();
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mediaQuery) return;

    // 시스템 테마가 변경되면 저장된 테마를 초기화하고 시스템 테마를 따름
    const handleSystemThemeChange = (event) => {
      const systemTheme = event.matches ? "dark" : "light";

      localStorage.removeItem("theme");
      setTheme(systemTheme);
    };

    mediaQuery.addEventListener("change", handleSystemThemeChange);

    return () => {
      mediaQuery.removeEventListener("change", handleSystemThemeChange);
    };
  }, []);

  // 버튼으로 선택한 테마는 저장하여 재접속 시에도 유지
  const toggleTheme = () => {
    setTheme((prev) => {
      const nextTheme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", nextTheme);
      return nextTheme;
    });
  };

  return (
    <>
      <div className="layout">

      <header>
          <div className="header-top">
            <h1>학습 대시보드</h1>

              <div className="top-right-menu">
                  {/* 테마 토글 버튼: 현재 상태에 따라 해/달 아이콘 표시 */}
                  <button onClick={toggleTheme} className="dark-button">
                      {theme === 'dark' ? '🌞' : '🌙'}
                  </button>

                  {/* 마이페이지 이동 버튼 */}
                  <button type="button" className="my-button" onClick={() => navigate("/mypage")}>
                      <FiHome className="main-icon" />
                      Mypage
                  </button>
              </div>

          </div>
            <p>오늘의 과제를 확인하세요!</p>
        </header>
          
        <main className="dashboard">

          <div className="left-section">
            <div className="left"><AssignmentTab accessToken={accessToken}/></div>
            <div className="left"><NoticeTab/></div>
          </div>

          <div className="right">Ai 기능</div>

        </main>
      </div>
    </>
  );
}

export default MainPage;