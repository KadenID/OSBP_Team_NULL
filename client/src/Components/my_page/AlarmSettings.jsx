import { useState } from "react";

/* 전체 과목 기본 알림 옵션 */
const reminderOptions = [
    { id: "none", label: "알림 없음", value: 0, unit: "none" },
    { id: "30min", label: "30분 전", value: 30, unit: "minute" },
    { id: "1hour", label: "1시간 전", value: 1, unit: "hour" },
    { id: "3hour", label: "3시간 전", value: 3, unit: "hour" },
    { id: "1day", label: "1일 전", value: 1, unit: "day" },
];

/* 과목별 추가 알림 옵션 */
const courseReminderOptions = [
    { id: "3hours", label: "마감 3시간 전", value: 3, unit: "hour" },
    { id: "6hours", label: "마감 6시간 전", value: 6, unit: "hour" },
    { id: "12hours", label: "마감 12시간 전", value: 12, unit: "hour" },
    { id: "1day", label: "마감 1일 전", value: 1, unit: "day" },
];

/* 과목 목록 */
const courses = [
    { id: "course1", name: "과목명1" },
    { id: "course2", name: "과목명2" },
];

function AlarmSettings() {
    /* 전체 알림 상태 */
    const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
    const [saveMessage, setSaveMessage] = useState("");
    
    /* 전체 과목 기본 알림 상태 */
    const [defaultReminder, setDefaultReminder] = useState({
        id: "1hour",
        type: "preset",
        value: 1,
        unit: "hour",
    });
    
    /* 과목별 추가 알림 상태 */
    const [selectedCourseId, setSelectedCourseId] = useState("");
    const [selectedReminder, setSelectedReminder] = useState("6hours");
    const [courseReminders, setCourseReminders] = useState({});
    
    const isSelectedCourseAlreadyAdded =
    selectedCourseId !== "" && courseReminders[selectedCourseId];
    
    const isAddButtonDisabled =
    !isAlarmEnabled || !selectedCourseId || isSelectedCourseAlreadyAdded;
    
    /* 과목별 알림 추가 */
    const handleAddCourseReminder = () => {
        if (!selectedCourseId || courseReminders[selectedCourseId]) return;
        
        setCourseReminders((prev) => ({
            ...prev,
            [selectedCourseId]: selectedReminder,
        }));
        
        setSelectedCourseId("");
        setSelectedReminder("6hours");
    };
    
    /* 과목별 알림 삭제 */
    const handleDeleteCourseReminder = (courseId) => {
        setCourseReminders((prev) => {
            const updated = { ...prev };
            delete updated[courseId];
            return updated;
        });
    };
    
    /* 과목별 알림 라벨 가져오기 */
    const getReminderLabel = (reminderId) => {
        const reminder = courseReminderOptions.find(
            (option) => option.id === reminderId
        );
        
        return reminder ? reminder.label : reminderId;
    };
    
    /* 알림 설정 저장 */
    const handleSaveAlarmSettings = () => {
        const isDefaultAlarmDisabled = defaultReminder.id === "none";
        
        console.log({
            isAlarmEnabled,
            isDefaultAlarmDisabled,
            defaultReminder,
            courseReminders,
        });

        setSaveMessage("알림 설정이 저장되었습니다.");

        setTimeout(() => {
            setSaveMessage("");
        }, 3000);
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
                onChange={(e) => setIsAlarmEnabled(e.target.checked)}/>
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
                        setDefaultReminder((prev) => ({
                            id: "custom",
                            type: "custom",
                            value: prev.type === "custom" ? prev.value : 2,
                            unit: prev.type === "custom" ? prev.unit : "hour",
                        }))
                    }
                    > 직접 설정 </button>
                </div>
                
                {/* 직접 설정 입력 영역 */}
                {defaultReminder.type === "custom" && (
                    <div className="custom-reminder-box">
                        <span>마감</span>
                        
                        <input
                        type="number"
                        min="1"
                        disabled={!isAlarmEnabled}
                        value={defaultReminder.value}
                        onChange={(e) => {
                            const nextValue = Math.max(1, Number(e.target.value) || 1);
                            setDefaultReminder({
                                ...defaultReminder,
                                id: "custom",
                                type: "custom",
                                value: nextValue,
                            });
                        }}/>
                        
                        <select
                        value={defaultReminder.unit}
                        disabled={!isAlarmEnabled}
                        onChange={(e) =>
                            setDefaultReminder({
                                ...defaultReminder,
                                id: "custom",
                                type: "custom",
                                unit: e.target.value,
                            })
                        }>
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
                
                {/* 과목별 알림 추가 입력 영역 */}
                <div className="course-reminder-add-row">
                    <select
                    className="alarm-select"
                    disabled={!isAlarmEnabled}
                    value={selectedCourseId}
                    onChange={(e) => setSelectedCourseId(e.target.value)}
                    >
                        <option value="">과목 선택</option>
                        {courses.map((course) => (
                            <option
                            key={course.id}
                            value={course.id}
                            disabled={Boolean(courseReminders[course.id])}
                            >
                                {course.name}
                                {courseReminders[course.id] ? " - 이미 추가됨" : ""}
                            </option>
                        ))}
                    </select>
                    
                    <select
                    className="alarm-select"
                    disabled={!isAlarmEnabled}
                    value={selectedReminder}
                    onChange={(e) => setSelectedReminder(e.target.value)}
                    >
                        {courseReminderOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    
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
                    {Object.entries(courseReminders).map(([courseId, reminder]) => {
                        const course = courses.find((c) => c.id === courseId);
                        
                        return (
                        <div className="alarm-course-item" key={courseId}>
                            <span className="alarm-course-name">{course?.name}</span>
                            
                            <div className="alarm-course-info">
                                <span className="alarm-course-time">
                                    {getReminderLabel(reminder)}
                                </span>
                            </div>
                            
                            <button
                            type="button"
                            className="delete-reminder-button"
                            disabled={!isAlarmEnabled}
                            onClick={() => handleDeleteCourseReminder(courseId)}
                            >
                            삭제
                            </button>
                        </div>
                        );
                    })}
                </div>
            </div>
            
            {/* 알림 설정 저장 */}
            <div className="save-alarm-wrapper">
                {saveMessage && isAlarmEnabled && (
                    <p className="alarm-save-message">
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
};

export default AlarmSettings;