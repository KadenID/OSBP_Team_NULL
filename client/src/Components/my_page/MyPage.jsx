import React, { useEffect, useState } from "react";
import AlarmSettings from "./AlarmSettings";
import AlarmHistory from "./AlarmHistory";
import "./AlarmSettings.css";
import "./MyPage.css";
import UserInfo from "./User-Info";
import "./User-Info.css";
import { FiLogOut, FiHome, FiChevronDown } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

function MyPageCard({ title = "", content = "", defaultOpen = true }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <section className="mypage-card">
            <div className="mypage-card-header" onClick={() => setIsOpen(!isOpen)}>
                <h2 className="mypage-card-title">{title}</h2>
                <FiChevronDown className={`mypage-card-toggle-icon ${isOpen ? "is-open" : ""}`} />
            </div>
            <div className={`mypage-card-content ${isOpen ? "is-open" : "is-closed"}`}>
                {content}
            </div>
        </section>
    );
}

function MyPage({ accessToken, onLogout }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();
    // 저장된 테마가 없으면 시스템 테마를 기준으로 마이페이지 테마 설정

    const handleLogout = async () => {
        if (onLogout) {
            await onLogout();
            navigate("/");
        }
    };

    // MY_PAGE_CARDS를 컴포넌트 내부로 이동시켜 accessToken을 주입할 수 있도록 함
    const myPageCards = [
        {
            id: "alarm",
            title: "알림 설정",
            content: <AlarmSettings accessToken={accessToken} />,
            defaultOpen: true,
        },
        {
            id: "alarm-history",
            title: "알림 내역",
            content: <AlarmHistory accessToken={accessToken} />,
            defaultOpen: false, // 알림 내역은 기본적으로 접어둠
        },
        {
            id: "timetable",
            title: "시간표 입력",
            content: "사용자 시간표 입력 및 관리 영역",
            defaultOpen: false,
        },
    ];

    return(
        <div className="mypage-page">
            <div className="mypage-container">

                {/* 마이페이지 상단 영역 */}
                <header className="mypage-header">
                    <div className="mypage-title-row">
                        <h1 className="mypage-title">마이페이지</h1>
                    
                        <button type="button" className="main-button" onClick={() => navigate("/main")}>
                            <FiHome className="main-icon" />
                            메인
                        </button>
                    </div>
                
                    <p className="mypage-subtitle">사용자 정보를 확인하세요</p>
                    </header>


            {/* 마이페이지 주요 카드 영역 */}
            <div className="mypage-grid">
                <UserInfo accessToken={accessToken} />
                
                {myPageCards.map((card) => (
                    <MyPageCard
                        key={card.id}
                        title={card.title}
                        content={card.content}
                        defaultOpen={card.defaultOpen}
                    />
                ))}
            </div>
               
                    {/* 로그아웃 버튼 영역 */}
                <div className="mypage-footer">
                    <button type="button" className="logout-button" onClick={handleLogout}>
                        <FiLogOut className="logout-icon" />
                        로그아웃
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MyPage;