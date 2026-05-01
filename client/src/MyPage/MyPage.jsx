import "./MyPage.css";
import { FiLogOut, FiHome } from "react-icons/fi";
import {useNavigate} from "react-router-dom";

function MyPageCard({ title, content }) {
    return (
        <div className="mypage-card">
            <h2 className="mypage-card-title">{title}</h2>
            <p className="mypage-card-content">{content}</p>
        </div>
    );
}

function MyPage() {
    const navigate = useNavigate();

    return(
        <div className="mypage-container">
            
            {/* 
            메인화면 전환 버튼 
            */}
            <div className="top-right-menu">
                <button className="main-button" onClick={()=> navigate("/")}>
                    <FiHome className="main-icon" />
                    메인
                </button>
            </div>

            {/* 
            마이페이지 상단 영역
            - 페이지 제목 및 간단한 설명 문구 표시
            */}
            <div className="mypage-header">
                <h1 className="mypage-title">마이페이지</h1>
                <p className="mypage-subtitle">사용자 정보를 확인하세요</p>
            </div>

            {/* 
            마이페이지 주요 카드 영역
            - LMS 연동상태, 알림 설정, 시간표 입력 카드 배치
            */}
            <div className="mypage-grid">
                
                {/* 
                LMS 연동 상태 카드
                - 사용자의 LMS 계정 연동 여부 표시
                 */}
                <MyPageCard title="LMS 연동 상태" content="연동 여부 및 사용자 정보 표시 영역" />

                {/* 
                알림 설정 카드
                - 과제 및 공지 알림 설정 영역
                 */}
                <MyPageCard title="알림 설정" content="과제 및 공지 알림 설정 영역" />

                {/*
                 시간표 입력 카드
                - 사용자 시간표 입력 및 관리 영역
                 */}
                <MyPageCard title="시간표 입력" content="사용자 시간표 입력 및 관리 영역" />

                {/*
                로그아웃 버튼 영역
                 */}
                <div className="mypage-footer">
                    <button className="logout-button">
                        <FiLogOut className="logout-icon" />
                        로그아웃
                    </button>
                </div>

            </div>
            
        </div> 
    );
}

export default MyPage;