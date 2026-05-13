import { useEffect, useState } from "react";

/* 과목 목록 */
const courses = [
    { id: "all", name: "전체 과목" },
    { id: "course1", name: "과목명1" },
    { id: "course2", name: "과목명2" },
];

/* 알림 단위별 최대 입력값 */
const reminderMaxByUnit ={
    minute: 59,
    hour: 23,
    day: 30,
};

const createReminderId = () => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random()}`;
};

function AlarmSettings() {
    /* 전체 알림 상태 */
    const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
    const [saveMessage, setSaveMessage] = useState("");
    
    /* 과목별 알림 추가 상태 */
    const [selectedCourseId, setSelectedCourseId] = useState("all");
    const [reminderValue, setReminderValue] = useState("1");
    const [reminderUnit, setReminderUnit] = useState("hour");
    const [courseReminders, setCourseReminders] = useState([]);

    const reminderMaxValue = reminderMaxByUnit[reminderUnit];

    const isReminderValueInvalid = reminderValue === "" || Number(reminderValue) < 1 || Number(reminderValue) > reminderMaxValue;

    const isAddButtonDisabled =
    !isAlarmEnabled || !selectedCourseId || isReminderValueInvalid;


    /* 과목별 알림 추가 */
    const handleAddCourseReminder = () => {
        if (isAddButtonDisabled) return;
        
        const normalizedValue = Math.min(
            reminderMaxValue,
            Math.max(1, Number(reminderValue) || 1)
        );
        
        setCourseReminders((prev) => [
            ...prev,
            {
                id: createReminderId(),
                courseId: selectedCourseId,
                value: normalizedValue,
                unit: reminderUnit,
            },
        ]);
        
        setSelectedCourseId("all");
        setReminderValue("1");
        setReminderUnit("hour");
    };

    /* 과목별 알림 삭제 */
    const handleDeleteCourseReminder = (reminderId) => {
        setCourseReminders((prev) =>
            prev.filter((reminder) => reminder.id !== reminderId)
        );
    };

    const getCourseName = (courseId) => {
        const course = courses.find((course) => course.id === courseId);
        return course ? course.name : "알 수 없는 과목";
    };

    const getUnitLabel = (unit) => {
        switch (unit) {
            case "minute":
                return "분";
            case "hour":
                return "시간";
            case "day":
                return "일";
            default:
                return unit;
        }
    };

    /* 알림 설정 저장 */
    useEffect(() => {
        if (!saveMessage) return;

        const timerId = setTimeout(() => {
            setSaveMessage("");
        }, 3000);

        return () => clearTimeout(timerId);
    }, [saveMessage]);

    const handleSaveAlarmSettings = () => {
        console.log({
            isAlarmEnabled,
            courseReminders,
        });

        setSaveMessage("알림 설정이 저장되었습니다.");
    };

    return (
        <div className="alarm-settings">
            {/* 전체 알림 켜기/끄기 */}
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
                        onChange={(e) => setIsAlarmEnabled(e.target.checked)}
                    />
                    <span className="alarm-slider"></span>
                </label>
            </div>

            <div className={!isAlarmEnabled ? "alarm-disabled" : ""}>
                {/* 과목별 알림 추가 */}
                <div className="alarm-section">
                    <h3 className="alarm-section-title">과목별 알림 추가</h3>

                    <div className="course-reminder-add-row">
                        <select
                            className="alarm-select"
                            disabled={!isAlarmEnabled}
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                        >
                            {courses.map((course) => (
                                <option key={course.id} value={course.id}>
                                    {course.name}
                                </option>
                            ))}
                        </select>

                        <div className="custom-reminder-box">
                            <span>마감</span>

                            <input
                               type="number"
                               min="1"
                               max={reminderMaxValue}
                               disabled={!isAlarmEnabled}
                               value={reminderValue}
                               onChange={(e) => {
                                const value = e.target.value;

                                if (value === "") {
                                    setReminderValue("");
                                    return;
                                }

                                const nextValue = Math.min(
                                reminderMaxValue,
                                Math.max(1, Number(value))
                                );
                                
                                setReminderValue(String(nextValue));
                            }}
                            onBlur={() => {
                                if (reminderValue === "" || Number(reminderValue) < 1) {
                                    setReminderValue("1");
                                    return;
                                }
                                
                                if (Number(reminderValue) > reminderMaxValue) {
                                    setReminderValue(String(reminderMaxValue));
                                }
                            }}
                        />

                            <select
                                value={reminderUnit}
                                disabled={!isAlarmEnabled}
                                onChange={(e) => {
                                    const nextUnit = e.target.value ;
                                    const nextMaxValue = reminderMaxByUnit[nextUnit] ?? 1;

                                    setReminderUnit(nextUnit);

                                    if(Number(reminderValue) > nextMaxValue) {
                                        setReminderValue(String(nextMaxValue));
                                    }
                                }}
                            >
                                <option value="minute">분</option>
                                <option value="hour">시간</option>
                                <option value="day">일</option>
                            </select>

                            <span>전</span>
                        </div>

                        <button
                            type="button"
                            className="add-reminder-button"
                            disabled={isAddButtonDisabled}
                            onClick={handleAddCourseReminder}
                        >
                            추가
                        </button>
                    </div>

                    {/* 과목별 알림 목록 */}
                    <div className="alarm-course-list">
                        {courseReminders.length === 0 ? (
                            <p className="alarm-empty-text">
                                설정된 알림이 없습니다.
                            </p>
                        ) : (
                            courseReminders.map((reminder) => (
                                <div className="alarm-course-item" key={reminder.id}>
                                    <span className="alarm-course-name">
                                        {getCourseName(reminder.courseId)}
                                    </span>

                                <div className="alarm-course-info">
                                    <span className="alarm-course-time">
                                        마감 {reminder.value}
                                        {getUnitLabel(reminder.unit)} 전
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    className="delete-reminder-button"
                                    disabled={!isAlarmEnabled}
                                    onClick={() =>
                                        handleDeleteCourseReminder(reminder.id)
                                    }
                                >
                                    삭제
                                </button>
                            </div>
                            ))
                        )}
                    </div>
                </div>

                {/* 알림 설정 저장 */}
                <div className="save-alarm-wrapper">
                    {saveMessage && isAlarmEnabled && (
                        <p
                            className="alarm-save-message"
                            role="status"
                            aria-live="polite"
                        >
                            {saveMessage}
                        </p>
                    )}

                    <button
                        type="button"
                        className="save-alarm-button"
                        onClick={handleSaveAlarmSettings}
                        disabled={!isAlarmEnabled}
                    >
                        알림 설정 저장
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AlarmSettings;