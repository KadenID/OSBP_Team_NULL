import { useEffect } from "react";
import useUserStore from "../../store/useUserStore";
import "./User-Info.css";

function UserInfo({ accessToken }) {
    const { userInfo, fetchUserInfo } = useUserStore();

    useEffect(() => {
        if (accessToken) {
            fetchUserInfo(accessToken);
        }
    }, [accessToken, fetchUserInfo]);

    const isLoading = userInfo.isLoading;
    const emptyText = isLoading ? "불러오는 중..." : "연동 후 표시됩니다";
    const statusClass = userInfo.lmsConnected ? "connected" : "disconnected";
    const statusText = userInfo.lmsConnected ? "LMS 연동 완료" : "LMS 미연동";

    const userInfoItems = [
        { id: "name", label: "이름", value: userInfo.name },
        { id: "studentId", label: "학번", value: userInfo.studentId },
        { id: "department", label: "학과", value: userInfo.department },
    ];

    return (
        <section className="user-info-card">
            {/* 사용자 정보 헤더 */}
            <div className="user-info-header">
                <h2 className="user-info-title">사용자 정보</h2>

                <span
                    className={`lms-status ${statusClass}`}
                    aria-label={`LMS 상태: ${statusText}`}
                >
                    {statusText}
                </span>
            </div>

            {/* 사용자 상세 정보 */}
            <div className="user-info-list">
                {userInfoItems.map((item) => (
                    <div className="user-info-item" key={item.id}>
                        <span className="user-info-label">{item.label}</span>
                        <strong className="user-info-value">
                            {item.value || emptyText}
                        </strong>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default UserInfo;
