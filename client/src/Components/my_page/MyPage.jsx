import React, { useEffect, useState } from "react";
import AlarmSettings from "./AlarmSettings";
import AlarmHistory from "./AlarmHistory";
import "./AlarmSettings.css";
import "./MyPage.css";
import UserInfo from "./User-Info";
import "./User-Info.css";
import { FiLogOut, FiHome, FiChevronDown, FiUserX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import useUserStore from "../../store/useUserStore";


import { useTheme } from '../../context/ThemeContext.jsx';


const MY_PAGE_CARDS = [
    {
        id: "alarm",
        title: "알림 설정",
        content: <AlarmSettings />,
    },
];

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
            defaultOpen: true, // 알림 내역 기본 열림
        },
    ];

    const withdraw = useUserStore((state) => state.withdraw);

    const handleWithdraw = async () => {
        if (window.confirm("정말로 모든 정보를 삭제하고 탈퇴하시겠습니까?\n\n※ 본 서비스의 데이터만 삭제되며, 개신누리(LMS) 계정에는 어떠한 영향도 주지 않습니다.\n※ 삭제된 데이터는 복구할 수 없습니다.")) {
            const result = await withdraw(accessToken);
            if (result.success) {
                alert("그동안 서비스를 이용해 주셔서 감사합니다. 모든 정보가 안전하게 삭제되었습니다.");
                if (onLogout) {
                    // onLogout을 호출하여 App.jsx의 accessToken 상태를 null로 설정
                    await onLogout();
                }
                navigate("/");
            } else {
                alert(result.message || "탈퇴 처리 중 오류가 발생했습니다.");
            }
        }
    };

    return(
        <div className="mypage-page">
            <div className="mypage-container">

                {/* 마이페이지 상단 영역 */}
                <header className="mypage-header">
                    <div className="mypage-title-row">
                        <h1 className="mypage-title">마이페이지</h1>
                        <button type="button" className="dark-button" onClick={toggleTheme}>
                            {theme === 'dark' ? '🌙' : '🌞'}
                        </button>
                        <button type="button" className="main-button" onClick={() => navigate("/main")}>
                            <FiHome className="main-icon" />
                            Mainpage
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
               
                    {/* 로그아웃 및 탈퇴 버튼 영역 */}
                <div className="mypage-footer">
                    <button type="button" className="withdraw-button" onClick={handleWithdraw}>
                        <FiUserX className="withdraw-icon" />
                        서비스 탈퇴
                    </button>
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