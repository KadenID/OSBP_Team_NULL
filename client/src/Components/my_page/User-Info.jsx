import "./User-Info.css";

function UserInfo() {
    const userInfo = {
        name: "",
        studentId: "",
        department: "",
        lmsConnected: false,
    };

    return (
        <section className="user-info-card">
            <div className="user-info-header">
                <div>
                    <p className="user-info-subtitle">User Information</p>
                    <h2 className="user-info-title">사용자 정보</h2>
                </div>
                
                <span className={userInfo.lmsConnected? "lms-status connected": "lms-status disconnected"}>
                    {userInfo.lmsConnected ? "LMS 연동 완료" : "LMS 미연동"}
                </span>
            </div>

            <div className="user-info-content">
                <div calssName="user-profile-icon">
                    {userInfo.name? userInfo.name.charAt(0): "?"}
                </div>
            </div>

            <div className="user-info-list">
                <div className="user-info-item">
                    <span className="user-info-label">이름</span>
                    <strong className="user-info-value">
                        {userInfo.name || "연동 후 표시됩니다"}
                    </strong>
                </div>

                <div className="user-info-item">
                    <span className="user-info-label">학번</span>
                    <strong className="user-info-value">
                        {userInfo.studentId || "연동 후 표시됩니다"}
                    </strong>
                </div>

                <div className="user-info-item">
                    <span className="user-info-label">학과</span>
                    <strong className="user-info-value">
                        {userInfo.department || "연동 후 표시됩니다"}
                    </strong>
                </div>
            </div>
        </section>
    );
}

export default UserInfo;
