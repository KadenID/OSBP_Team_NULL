import { useEffect, useState, useMemo, useCallback } from "react";
import { API_BASE_URL } from "../../apiConfig";
import useAssignmentStore from "../../store/useAssignmentStore";
import "./AlarmSettings.css";

/* 알림 단위별 최대 입력값 */
const reminderMaxByUnit = {
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
    const { fetchAssignments } = useAssignmentStore();

    /* --- 상태 선언 --- */
    const [email, setEmail] = useState("");
    const [tempEmail, setTempEmail] = useState("");
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [emailAlerts, setEmailAlerts] = useState(false);
    const [browserAlerts, setBrowserAlerts] = useState(false);
    const [courseReminders, setCourseReminders] = useState([]);
    const [courses, setCourses] = useState([{ id: "all", name: "전체 과목" }]);
    
    const [permissionStatus, setPermissionStatus] = useState(
        typeof Notification !== "undefined" ? Notification.permission : "default"
    );
    
    const [saveMessage, setSaveMessage] = useState("");
    const [testMessage, setTestMessage] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isInitialLoad, setIsInitialLoad] = useState(true);

    /* 과목별 알림 추가 상태 */
    const [selectedCourseId, setSelectedCourseId] = useState("all");
    const [reminderValue, setReminderValue] = useState("1");
    const [reminderUnit, setReminderUnit] = useState("hour");

    const reminderMaxValue = reminderMaxByUnit[reminderUnit];
    const isReminderValueInvalid = reminderValue === "" || Number(reminderValue) < 1 || Number(reminderValue) > reminderMaxValue;
    const isAddButtonDisabled = (!emailAlerts && !browserAlerts) || !selectedCourseId || isReminderValueInvalid;

    /* --- 데이터 로드 및 초기화 --- */
    
    useEffect(() => {
        if (accessToken) {
            fetchAssignments(accessToken);
        }
    }, [accessToken, fetchAssignments]);

    const getCourseName = useCallback((courseId) => {
        if (courseId === "all") return "전체 과목";
        const course = courses.find((c) => String(c.id) === String(courseId));
        return course ? course.name : courseId;
    }, [courses]);

    // 정렬된 알림 목록
    const sortedCourseReminders = useMemo(() => {
        if (!courseReminders || !Array.isArray(courseReminders)) return [];
        
        const courseOrderMap = new Map();
        courses.forEach((c, index) => {
            courseOrderMap.set(String(c.id), index);
        });

        return [...courseReminders].sort((a, b) => {
            if (a.courseId === "all" && b.courseId !== "all") return -1;
            if (a.courseId !== "all" && b.courseId === "all") return 1;
            
            const orderA = courseOrderMap.has(String(a.courseId)) ? courseOrderMap.get(String(a.courseId)) : 9999;
            const orderB = courseOrderMap.has(String(b.courseId)) ? courseOrderMap.get(String(b.courseId)) : 9999;
            
            if (orderA !== orderB) return orderA - orderB;
            
            const getMins = (r) => {
                const val = Number(r.value);
                if (r.unit === 'minute') return val;
                if (r.unit === 'hour') return val * 60;
                if (r.unit === 'day') return val * 1440;
                return 0;
            };
            return getMins(a) - getMins(b);
        });
    }, [courseReminders, courses]);

    useEffect(() => {
        const fetchSettingsAndCourses = async () => {
            if (!accessToken) return;
            try {
                const settingsResponse = await fetch(`${API_BASE_URL}/api/user-settings`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const settingsResult = await settingsResponse.json();
                if (settingsResult.success && settingsResult.data) {
                    setEmail(settingsResult.data.email || "");
                    setTempEmail(settingsResult.data.email || "");
                    setEmailAlerts(settingsResult.data.emailAlerts ?? true);
                    setBrowserAlerts(settingsResult.data.browserAlerts ?? true);
                    setCourseReminders(settingsResult.data.courseReminders ?? []);
                    if (settingsResult.data.browserAlerts) {
                        checkAndSyncSubscription();
                    }
                }

                const coursesResponse = await fetch(`${API_BASE_URL}/api/courses?include_custom=true`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const coursesResult = await coursesResponse.json();
                if (coursesResult.success && Array.isArray(coursesResult.data)) {
                    setCourses([
                        { id: "all", name: "전체 과목" },
                        ...coursesResult.data
                    ]);
                }
            } catch (error) {
                console.error("데이터 로드 오류:", error);
            } finally {
                setIsInitialLoad(false);
            }
        };
        fetchSettingsAndCourses();
    }, [accessToken]);

    /* --- 권한 및 구독 로직 --- */

    const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    };

    const subscribeToPush = async () => {
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                alert("이 브라우저는 푸시 알림을 지원하지 않습니다.");
                setBrowserAlerts(false);
                return;
            }

            const keyResponse = await fetch(`${API_BASE_URL}/api/vapid-public-key`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const keyResult = await keyResponse.json();
            if (!keyResult.success || !keyResult.publicKey) {
                throw new Error("서버에서 VAPID 키를 가져올 수 없습니다.");
            }

            const registration = await navigator.serviceWorker.ready;
            
            try {
                const existingSubscription = await registration.pushManager.getSubscription();
                if (existingSubscription) {
                    await existingSubscription.unsubscribe();
                }
            } catch (subError) {
                console.warn("기존 구독 해제 중 오류 발생:", subError);
            }

            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);

            if (permission !== 'granted') {
                alert("알림 권한이 거부되었습니다.\n주소창 왼쪽의 [사이트 정보] 아이콘을 클릭하여 알림 권한을 '허용'으로 변경해주세요.");
                setBrowserAlerts(false);
                return;
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey)
            });

            const subscriptionJSON = subscription.toJSON();

            const saveResponse = await fetch(`${API_BASE_URL}/api/push-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(subscriptionJSON),
            });

            if (!saveResponse.ok) {
                throw new Error("서버에 구독 정보를 저장하지 못했습니다.");
            }
        } catch (error) {
            console.error("푸시 구독 오류:", error);
            alert(`알림 구독 중 오류가 발생했습니다: ${error.message}`);
            setBrowserAlerts(false);
        }
    };

    const unsubscribeFromPush = async () => {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    const subscriptionJSON = subscription.toJSON();
                    await fetch(`${API_BASE_URL}/api/push-subscription`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify(subscriptionJSON),
                    });
                    await subscription.unsubscribe();
                }
            }
        } catch (error) {
            console.error("구독 해제 중 오류:", error);
        }
    };

    const checkAndSyncSubscription = async () => {
        if (!('serviceWorker' in navigator)) return;
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
            const subscription = await registration.pushManager.getSubscription();
            if (!subscription && browserAlerts) {
                subscribeToPush();
            }
        }
    };

    const [isTestSending, setIsTestSending] = useState(false);

    /* --- 이벤트 핸들러 --- */

    const handleSaveEmail = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (tempEmail && !emailRegex.test(tempEmail)) {
            alert("올바른 이메일 형식이 아닙니다.");
            return;
        }

        setEmail(tempEmail);
        setIsEditingEmail(false);
        if (!tempEmail) {
            setEmailAlerts(false);
        }
    };

    const handleTestNotification = async () => {
        if (!accessToken || isTestSending) return;
        setIsTestSending(true);
        setTestMessage("발송 중...");
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/test-notification`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                setTestMessage("발송 완료!");
            } else {
                setTestMessage(result.message || "발송 실패");
            }
        } catch (error) {
            setTestMessage("오류 발생");
        } finally {
            setIsTestSending(false);
            setTimeout(() => setTestMessage(""), 3000);
        }
    };

    useEffect(() => {
        if (isInitialLoad || !accessToken) return;

        setIsSaving(true);
        setSaveMessage("변경사항 저장 중...");
        
        const saveTimer = setTimeout(async () => {
            try {
                await fetch(`${API_BASE_URL}/api/user-settings`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        email,
                        emailAlerts,
                        browserAlerts,
                        courseReminders,
                    }),
                });
                setSaveMessage("모든 변경사항이 저장되었습니다.");
            } catch (error) {
                setSaveMessage("저장 중 오류 발생");
            } finally {
                setIsSaving(false);
            }
        }, 800);

        return () => clearTimeout(saveTimer);
    }, [email, emailAlerts, browserAlerts, courseReminders, accessToken, isInitialLoad]);

    const handleAddCourseReminder = () => {
        if (isAddButtonDisabled) return;
        const normalizedValue = Math.min(reminderMaxValue, Math.max(1, Number(reminderValue) || 1));
        setCourseReminders((prev) => [
            ...prev,
            { id: createReminderId(), courseId: selectedCourseId, value: normalizedValue, unit: reminderUnit },
        ]);
        setSelectedCourseId("all");
        setReminderValue("1");
        setReminderUnit("hour");
    };

    const handleDeleteCourseReminder = (reminderId) => {
        setCourseReminders((prev) => prev.filter((r) => r.id !== reminderId));
    };

    useEffect(() => {
        if (!saveMessage || isSaving) return;
        const timerId = setTimeout(() => setSaveMessage(""), 3000);
        return () => clearTimeout(timerId);
    }, [saveMessage, isSaving]);

    return (
        <div className="alarm-settings">
            {/* 1. 채널별 설정 (이메일/푸시) */}
            <div className="alarm-section alarm-channel-group">
                {/* 이메일 알림 그룹 */}
                <div>
                    <div className="alarm-toggle-row">
                        <div>
                            <h4 className="alarm-course-name">이메일 알림</h4>
                            <p className="alarm-description">메일함으로 마감 알림을 보냅니다.</p>
                        </div>
                        <label className="alarm-switch">
                            <input
                                type="checkbox"
                                checked={emailAlerts}
                                disabled={!email}
                                onChange={(e) => setEmailAlerts(e.target.checked)}
                            />
                            <span className="alarm-slider"></span>
                        </label>
                    </div>
                    <div className="alarm-email-input-wrapper">
                        {isEditingEmail ? (
                            <>
                                <input
                                    type="email"
                                    className="alarm-email-input"
                                    placeholder="알림을 받을 이메일 주소 입력"
                                    value={tempEmail}
                                    onChange={(e) => setTempEmail(e.target.value)}
                                    autoFocus
                                />
                                <button 
                                    type="button" 
                                    className="add-reminder-button"
                                    onClick={handleSaveEmail}
                                >
                                    저장
                                </button>
                            </>
                        ) : (
                            <>
                                <div className={`alarm-email-display ${!email ? 'empty' : ''}`}>
                                    {email || "등록된 이메일이 없습니다."}
                                </div>
                                <button 
                                    type="button" 
                                    className="add-reminder-button secondary"
                                    onClick={() => {
                                        setTempEmail(email);
                                        setIsEditingEmail(true);
                                    }}
                                >
                                    수정
                                </button>
                            </>
                        )}
                    </div>
                    {!email && !isEditingEmail && (
                        <p className="alarm-error-text">
                            ※ 이메일을 등록해야 알림을 활성화할 수 있습니다.
                        </p>
                    )}
                </div>

                {/* 브라우저 푸시 알림 그룹 */}
                <div className="alarm-toggle-row">
                    <div>
                        <h4 className="alarm-course-name">브라우저 푸시 알림</h4>
                        <p className="alarm-description">브라우저 알림창으로 즉시 알림을 보냅니다.</p>
                        {permissionStatus === 'denied' && (
                            <p className="alarm-error-text">
                                ※ 브라우저 설정에서 알림 권한이 거부되어 있습니다.<br />
                                (해제 방법: 주소창 왼쪽 [사이트 정보] 아이콘 클릭 &gt; 알림 [허용]으로 변경)
                            </p>
                        )}
                    </div>
                    <label className="alarm-switch">
                        <input
                            type="checkbox"
                            checked={browserAlerts}
                            onChange={(e) => {
                                const checked = e.target.checked;
                                setBrowserAlerts(checked);
                                if (checked) subscribeToPush();
                                else unsubscribeFromPush();
                            }}
                        />
                        <span className="alarm-slider"></span>
                    </label>
                </div>
            </div>

            {/* 3. 테스트 버튼 */}
            <div className="alarm-test-wrapper">
                {testMessage && (
                    <span className="alarm-test-status">
                        {testMessage}
                    </span>
                )}
                <button 
                    type="button" 
                    className="alarm-test-button" 
                    disabled={isTestSending}
                    onClick={handleTestNotification}
                >
                    {isTestSending ? "처리 중..." : "테스트 알림 발송"}
                </button>
            </div>

            {/* 4. 과목별 알림 설정 */}
            <div className={(!emailAlerts && !browserAlerts) ? "alarm-disabled" : ""}>
                <div className="alarm-section">
                    <h3 className="alarm-section-title">과목별 알림 추가</h3>
                    <div className="course-reminder-add-row">
                        <select
                            className="alarm-select"
                            value={selectedCourseId}
                            onChange={(e) => setSelectedCourseId(e.target.value)}
                        >
                            {courses.map((course) => (
                                <option key={course.id} value={course.id}>{course.name}</option>
                            ))}
                        </select>

                        <div className="custom-reminder-box">
                            <span>마감</span>
                            <input
                               type="number"
                               min="1"
                               value={reminderValue}
                               onChange={(e) => setReminderValue(e.target.value)}
                            />
                            <select value={reminderUnit} onChange={(e) => setReminderUnit(e.target.value)}>
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

                    <div className="alarm-course-list">
                        {sortedCourseReminders.length === 0 ? (
                            <p className="alarm-empty-text">설정된 알림이 없습니다.</p>
                        ) : (
                            sortedCourseReminders.map((reminder) => (
                                <div className="alarm-course-item" key={reminder.id}>
                                    <span className="alarm-course-name">{getCourseName(reminder.courseId)}</span>
                                    <div className="alarm-course-info">
                                        <span className="alarm-course-time">마감 {reminder.value}{reminder.unit === 'minute' ? '분' : reminder.unit === 'hour' ? '시간' : '일'} 전</span>
                                    </div>
                                    <button
                                        type="button"
                                        className="delete-reminder-button"
                                        onClick={() => handleDeleteCourseReminder(reminder.id)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className="save-alarm-wrapper">
                    {saveMessage && (
                        <p className="alarm-save-message">
                            {saveMessage}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AlarmSettings;
