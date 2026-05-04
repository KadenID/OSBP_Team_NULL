import React, { useState, useEffect } from 'react';
import './MainPage.css';
import AssignmentTab from "../assignment-tab/AssignmentTab.jsx";

function MainPage() {

  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };


  return (
    <>
      <div className="layout">

      <header>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>학습 대시보드</h1>
            <button onClick={toggleTheme} className="theme-toggle-btn">
                    {isDarkMode ? '🌞' : '🌙'}
            </button>
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