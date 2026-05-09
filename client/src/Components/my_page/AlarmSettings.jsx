import { useState } from "react";

function AlarmSettings() {
    const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
    const [defaultReminder, setDefaultReminder] = useState({
        id: "1hour",
        type: "preset",
        value: 1,
        unit: "hour"
    });
    
    const reminderOptions = [
        { id: "30min", label: "30분 전", value: 30, unit: "minute" },
        { id: "1hour", label: "1시간 전", value: 1, unit: "hour" },
        { id: "3hour", label: "3시간 전", value: 3, unit: "hour" },
        { id: "1day", label: "1일 전", value: 1, unit: "day" }
    ];
    const courses = [
        { id: "course1", name: "과목명1" },
        { id: "course2", name: "과목명2" }
    ]

    const [selectedCourseId, setSelectedCourseId] = useState("");
    const [selectedReminder, setSelectedReminder] = useState("6hours");
    const [courseReminders, setCourseReminders] = useState({});

    const handleCourseReminderChange = (courseId, value) => {
        setCourseReminders((prev) => ({...prev, [courseId]: value,}));
    };

    const handleAddCourseReminder = () => {
        if (!selectedCourseId) return;

        setCourseReminders((prev) => ({...prev, [selectedCourseId]: selectedReminder,
        }));
        
        setSelectedCourseId("");
        setSelectedReminder("6hours");
    };

    const handleDeleteCourseReminder = (courseId) => {
        setCourseReminders((prev) => {
            const updated = { ...prev };
            delete updated[courseId];
            return updated;
        });
    };
    
    const getReminderLabel = (value) => {
        const labels = {
            "3hours": "마감 3시간 전",
            "6hours": "마감 6시간 전",
            "12hours": "마감 12시간 전",
            "1day": "마감 1일 전",
        };
        
        return labels[value] || value;
    };

  return (
    <div className="alarm-settings">
      <div className="alarm-toggle-row">
        <div>
          <h3 className="alarm-section-title">전체 알림</h3>
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

          <div className="reminder-chip-group">
            {reminderOptions.map((option) => (
                <button
                key={option.id}
                type="button"
                disabled={!isAlarmEnabled}
                className={
                    defaultReminder.id === option.id 
                    ? "reminder-chip active"
                    : "reminder-chip"
                }
                onClick={() =>
                    setDefaultReminder({
                        id: option.id,
                        type: "preset",
                        value: option.value,
                        unit: option.unit,
                    })
                }
            >
                {option.label}
            </button>
     ))}

            <button
            type="button"
            disabled={!isAlarmEnabled}
            className={
                defaultReminder.type === "custom"
                ? "reminder-chip active"
                : "reminder-chip"
            }
            onClick={() =>
                setDefaultReminder({
                    id: "custom",
                    type: "custom",
                    value: 2,
                    unit: "hour",
                })
            }
            >
                직접 설정
            </button>
          </div>
          
          {defaultReminder.type === "custom" && (
            <div className="custom-reminder-box">
                <span>마감</span>

                <input
                    type="number"
                    min="1"
                    disabled={!isAlarmEnabled}
                    value={defaultReminder.value}
                    onChange={(e) =>
                        setDefaultReminder({
                            ...defaultReminder,
                            id : "custom",
                            type: "custom",
                            value: Number(e.target.value),
                        })
                    }
                />

                <select
                    value={defaultReminder.unit}
                    disabled={!isAlarmEnabled}
                    onChange={(e) =>
                        setDefaultReminder({
                            ...defaultReminder,
                            id : "custom",
                            type: "custom",
                            unit: e.target.value,
                        })
                    }
                >
                    <option value="minute">분</option>
                    <option value="hour">시간</option>
                    <option value="day">일</option>
                </select>

                <span>전</span>
            </div>
         )}

        </div>

        {/* 과목별 추가 알림 */}
        <div className="alarm-section">
          <h3 className="alarm-section-title">과목별 추가 알림</h3>

          <div className="course-reminder-add-row">
            <select
            className="alarm-select"
            disabled={!isAlarmEnabled}
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            >
                <option value="">과목 선택</option>
                
                {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                        {course.name}
                    </option>
                ))}
            </select>
            
            <select
            className="alarm-select"
            disabled={!isAlarmEnabled}
            value={selectedReminder}
            onChange={(e) => setSelectedReminder(e.target.value)}
            >
                <option value="3hours">마감 3시간 전</option>
                <option value="6hours">마감 6시간 전</option>
                <option value="12hours">마감 12시간 전</option>
                <option value="1day">마감 1일 전</option>
                </select>
                
                <button
                type="button"
                className="add-reminder-button"
                disabled={!isAlarmEnabled}
                onClick={handleAddCourseReminder}
                >
                    추가
                </button>

                <div className="alarm-course-list">
                    {Object.entries(courseReminders).map(([courseId, reminder]) => {
                        const course = courses.find((c) => c.id === courseId);
                        
                        return (
                        <div className="alarm-course-item" key={courseId}>
                            <span className="alarm-course-name">
                                {course?.name}
                            </span>
                        <div className="alarm-course-info">
                            <span className="alarm-course-time">
                                {getReminderLabel(reminder)}
                            </span>
                        </div>
                        
                        <button
                        type="button"
                        className="delete-reminder-button"
                        onClick={() =>
                            handleDeleteCourseReminder(courseId)
                        }
                        > 삭제 
                        </button>
                        </div>
                        );
                    })}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}

export default AlarmSettings;