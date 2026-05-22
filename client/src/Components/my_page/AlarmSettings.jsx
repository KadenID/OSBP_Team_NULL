import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

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

function AlarmSettings({ accessToken }) {
    /* 전체 알림 상태 */
    const [isAlarmEnabled, setIsAlarmEnabled] = useState(true);
    const [saveMessage, setSaveMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    
    /* 과목별 알림 추가 상태 */
    const [selectedCourseId, setSelectedCourseId] = useState("all");
    const [reminderValue, setReminderValue] = useState("1");
    const [reminderUnit, setReminderUnit] = useState("hour");
    const [courseReminders, setCourseReminders] = useState([]);

    const reminderMaxValue = reminderMaxByUnit[reminderUnit];

    const isReminderValueInvalid = reminderValue === "" || Number(reminderValue) < 1 || Number(reminderValue) > reminderMaxValue;

    const isAddButtonDisabled =
    !isAlarmEnabled || !selectedCourseId || isReminderValueInvalid;

    /* 초기 설정 불러오기 */
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    useEffect(() => {
        const fetchSettings = async () => {
            if (!accessToken) {
                // 부모 컴포넌트(App -> MyPage)에서 토큰이 아직 안 왔을 수 있음
                return;
            }
            try {
                console.log("알림 설정 불러오는 중...");
                const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const result = await response.json();
                if (result.success && result.data) {
                    console.log("불러온 설정:", result.data);
                    setIsAlarmEnabled(result.data.isAlarmEnabled ?? true);
                    setCourseReminders(result.data.courseReminders ?? []);
                }
            } catch (error) {
                console.error("설정 로드 중 오류 발생:", error);
            } finally {
                setTimeout(() => setIsInitialLoad(false), 100);
            }
        };
        fetchSettings();
    }, [accessToken]);

    /* 자동 저장 로직 (디바운싱) */
    useEffect(() => {
        if (isInitialLoad || !accessToken) return;

        console.log("변경 감지, 자동 저장 예약...");
        setIsSaving(true);
        setSaveMessage("변경사항 저장 중...");
        
        const saveTimer = setTimeout(async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        isAlarmEnabled,
                        courseReminders,
                    }),
                });
                const result = await response.json();
                if (result.success) {
                    console.log("자동 저장 완료");
                    setSaveMessage("모든 변경사항이 저장되었습니다.");
                } else {
                    setSaveMessage("저장에 실패했습니다.");
                }
            } catch (error) {
                console.error("자동 저장 중 오류 발생:", error);
                setSaveMessage("저장 중 서버 오류 발생");
            } finally {
                setIsSaving(false);
            }
        }, 500);

        return () => clearTimeout(saveTimer);
    }, [isAlarmEnabled, courseReminders, accessToken, isInitialLoad]);


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

    /* 알림 설정 저장 메시지 타이머 */
    useEffect(() => {
        // "저장 중..."일 때는 메시지를 지우지 않음
        if (!saveMessage || isSaving) return;

        const timerId = setTimeout(() => {
            setSaveMessage("");
        }, 3000);

        return () => clearTimeout(timerId);
    }, [saveMessage, isSaving]);

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

                {/* 자동 저장 메시지 표시 */}
                <div className="save-alarm-wrapper" style={{ minHeight: '24px' }}>
                    {saveMessage && isAlarmEnabled && (
                        <p
                            className="alarm-save-message"
                            role="status"
                            aria-live="polite"
                            style={{ textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }}
                        >
                            {saveMessage}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AlarmSettings;