import React, { useState, useEffect } from 'react';
import './MainPage.css';
import AssignmentTab from "../assignment-tab/AssignmentTab.jsx";
import NoticeTab from "../notice-tab/NoticeTab.jsx";
import { useNavigate } from "react-router-dom";
import { FiHome } from "react-icons/fi";
import { useTheme } from "../../context/ThemeContext.jsx";

function MainPage({ accessToken, onLogout }) {

  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="mainpage">
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
    </div>
  );
}

export default MainPage;