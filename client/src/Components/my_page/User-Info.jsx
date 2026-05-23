import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import "./User-Info.css";

const EMPTY_USER_INFO = {
    name: "",
    studentId: "",
    department: "",
    lmsConnected: false,
};

function UserInfo({ accessToken }) {
    const [userInfo, setUserInfo] = useState(EMPTY_USER_INFO);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Access Token을 기반으로 로그인한 사용자 정보 조회
        const fetchUserInfo = async () => {
            if (!accessToken) {
                setUserInfo(EMPTY_USER_INFO);
                setIsLoading(false);
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/api/me`, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    },
                });

                if (!response.ok) {
                    throw new Error("사용자 정보 조회 실패");
                }

                const result = await response.json();
                const profile = result.data || {};

                // API 응답 필드를 화면 표시용 상태로 변환
                setUserInfo({
                    name: profile.name || "",
                    studentId: profile.student_id || "",
                    department: profile.department || "",
                    lmsConnected: true,
                });
            } catch (error) {
                console.error(error);
                setUserInfo(EMPTY_USER_INFO);
            } finally {
                setIsLoading(false);
            }
        };

        fetchUserInfo();
    }, [accessToken]);

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