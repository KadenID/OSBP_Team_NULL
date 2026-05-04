import "./MyPage.css";
import { FiLogOut, FiHome } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const MY_PAGE_CARDS = [
    {
        id: "lms",
        title: "LMS 연동 상태",
        content: "연동 여부 및 사용자 정보 표시 영역",
    },
    {
        id: "alarm",
        title: "알림 설정",
        content: "과제 및 공지 알림 설정 영역",
    },
    {
        id: "timetable",
        title: "시간표 입력",
        content: "사용자 시간표 입력 및 관리 영역",
    },
];


function MyPageCard({ title = "", content = "" }) {
    return (
        <section className="mypage-card">
            <h2 className="mypage-card-title">{title}</h2>
            {content && <p className="mypage-card-content">{content}</p>}
        </section>
    );
}

function MyPage() {
    const navigate = useNavigate();

    const handleLogout = () => {
        // TODO: 로그인 기능 구현 후 실제 로그아웃 로직 연결
        navigate("/");
    };

    return(
        <div className="mypage-container">
            
            {/* 메인화면 전환 버튼 */}
            <div className="top-right-menu">
                <button type="button" className="main-button" onClick={() => navigate("/")}>
                    <FiHome className="main-icon" />
                    메인
                </button>
            </div>

            {/* 마이페이지 상단 영역 */}
            <header className="mypage-header">
                <h1 className="mypage-title">마이페이지</h1>
                <p className="mypage-subtitle">사용자 정보를 확인하세요</p>
            </header>

            {/* 마이페이지 주요 카드 영역 */}
            <div className="mypage-grid">
                {MY_PAGE_CARDS.map((card) => (
                    <MyPageCard
                        key={card.id}
                        title={card.title}
                        content={card.content}
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
    );
}

export default MyPage;