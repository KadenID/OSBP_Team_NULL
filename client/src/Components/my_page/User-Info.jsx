import "./User-Info.css";

function UserInfo() {
    const userInfo = {
        name: "",
        studentId: "",
        department: "",
    };

    return (
        <section className="user-info-card">
            <div className="user-info-header">
                <p className="user-info-subtitle">User Information</p>
                <h2 className="user-info-title">사용자 정보</h2>
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
