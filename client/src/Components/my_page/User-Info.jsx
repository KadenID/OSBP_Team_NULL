import "./User-Info.css";

const EMPTY_USER_INFO = {
    name: "",
    studentId: "",
    department: "",
    lmsConnected: false,
};

function UserInfo() {
    // TODO: 추후 API를 통해 받아온 사용자 정보로 교체 예정
    const userInfo = EMPTY_USER_INFO;

    const emptyText = "연동 후 표시됩니다";
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
