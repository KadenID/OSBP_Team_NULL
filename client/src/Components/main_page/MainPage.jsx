import React from 'react';
import './MainPage.css';
import AssignmentTab from "../assignment-tab/AssignmentTab.jsx";


function MainPage() {

  return (
    <>
      <header>
        <div className="layout">
            <h1>학습 대시보드</h1>
            <p>오늘의 과제를 확인하세요!</p>
        </div>
        
      </header>

      <main className="dashboard">

        <div className="left-section">
          <div className="left"><AssignmentTab/></div>
          <div className="left">알림탭</div>
        </div>

        <div className="right">Ai 기능</div>

      </main>

    </>
  );
}

export default MainPage;
