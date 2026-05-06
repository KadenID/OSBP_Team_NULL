import { useState } from "react";

function AlarmSettings() {
  const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);

  return (
    <div className="alarm-settings">
      <div className="alarm-toggle-row">
        <div>
          <h3 className="alarm-toggle-title">전체 알림</h3>
          <p className="alarm-description">
            과제 알림 기능을 켜거나 끌 수 있습니다.
          </p>
        </div>

        <label className="alarm-switch">
          <input
            type="checkbox"
            checked={isAlarmEnabled}
            onChange={() => setIsAlarmEnabled(!isAlarmEnabled)}
          />
          <span className="alarm-slider"></span>
        </label>
      </div>

      <div className={!isAlarmEnabled ? "alarm-disabled" : ""}>
        {/* 전체 과목 기본 알림 */}
        <div className="alarm-section">
          <h3 className="alarm-section-title">전체 과목 기본 알림</h3>
          <label className="alarm-label">알림 시간</label>

          <select className="alarm-select" disabled={!isAlarmEnabled}>
            <option>마감 1시간 전</option>
            <option>마감 3시간 전</option>
            <option>마감 6시간 전</option>
            <option>마감 12시간 전</option>
            <option>마감 1일 전</option>
          </select>
        </div>

        {/* 과목별 추가 알림 */}
        <div className="alarm-section">
          <h3 className="alarm-section-title">과목별 추가 알림</h3>

          <div className="alarm-course-item">
            <span className="alarm-course-name">과목명</span>
            <select className="alarm-select" disabled={!isAlarmEnabled}>
              <option>마감 6시간 전</option>
              <option>마감 12시간 전</option>
              <option>마감 1일 전</option>
            </select>
          </div>

          <div className="alarm-course-item">
            <span className="alarm-course-name">과목명</span>
            <select className="alarm-select" disabled={!isAlarmEnabled}>
              <option>마감 6시간 전</option>
              <option>마감 12시간 전</option>
              <option>마감 1일 전</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlarmSettings;