import React, { useState, useEffect } from 'react';
import './MainPage.css';
import AssignmentTab from "../assignment-tab/AssignmentTab.jsx";
import { useNavigate } from "react-router-dom";

function MainPage() {

  const navigate = useNavigate();

  // 초기 테마 설정
  const [theme, setTheme] = useState(() => {

    const saved = localStorage.getItem('theme');
    if (saved) return saved;

    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return systemDark ? 'dark' : 'light';
    });
  

// 테마 변경 시 DOM + 저장 동기화
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);


  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };


  return (
    <>
      <div className="layout">

      <header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>학습 대시보드</h1>

              <div className="top-right-menu">
                  <button onClick={toggleTheme} className="dark-button" style={{ marginRight: '10px' }}>
                      {theme === 'dark' ? '🌞' : '🌙'}
                  </button>
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
            <div className="left"><AssignmentTab/></div>
            <div className="left">알림탭</div>
          </div>

          <div className="right">Ai 기능</div>

        </main>
      </div>
    </>
  );
}

export default MainPage;