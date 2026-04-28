import "./MyPage.css";
import { FiLogOut} from "react-icons/fi";

function MyPage() {
    return(
        <div className="mypage-container">
            
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
                <div className="mypage-card">
                    <h2 className="mypage-card-title">LMS 연동 상태</h2>
                    <p className="mypage-card-content">연동 여부 표시 영역</p>
                </div>

                {/* 
                알림 설정 카드
                - 과제 및 공지 알림 설정 영역
                 */}
                <div className="mypage-card">
                    <h2 className="mypage-card-title">알림 설정</h2>
                    <p className="mypage-card-content">과제 및 공지 알림 설정 영역</p>
                </div>

                {/*
                 시간표 입력 카드
                - 사용자 시간표 입력 및 관리 영역
                 */}
                <div className="mypage-card">
                    <h2 className="mypage-card-title">시간표 입력</h2>
                    <p className="mypage-card-content">수업 시간표 입력 영역</p>
                </div>

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