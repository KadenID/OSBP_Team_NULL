import { useEffect, useState, useMemo, useCallback } from "react";
import { API_BASE_URL } from "../../apiConfig";
import useAssignmentStore from "../../store/useAssignmentStore";

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
    const { assignment, fetchAssignments } = useAssignmentStore();

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
        
        // courses 배열에서 각 과목의 인덱스를 맵으로 저장 (빠른 조회를 위함)
        const courseOrderMap = new Map();
        courses.forEach((c, index) => {
            courseOrderMap.set(String(c.id), index);
        });

        return [...courseReminders].sort((a, b) => {
            // 1. "전체 과목" 우선
            if (a.courseId === "all" && b.courseId !== "all") return -1;
            if (a.courseId !== "all" && b.courseId === "all") return 1;
            
            // 2. 서버에서 보내준 courses 리스트의 순서(정규 > 비교과 > 커스텀 & 이름순)를 따름
            const orderA = courseOrderMap.has(String(a.courseId)) ? courseOrderMap.get(String(a.courseId)) : 9999;
            const orderB = courseOrderMap.has(String(b.courseId)) ? courseOrderMap.get(String(b.courseId)) : 9999;
            
            if (orderA !== orderB) return orderA - orderB;
            
            // 3. 같은 과목 내에서의 알림 시간순 정렬
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
                // 1. 설정 로드
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

                // 2. 과목 목록 로드 (서버에서 이미 정렬되어 옴)
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

            // VAPID 키 로드
            const keyResponse = await fetch(`${API_BASE_URL}/api/vapid-public-key`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const keyResult = await keyResponse.json();
            if (!keyResult.success || !keyResult.publicKey) {
                throw new Error("서버에서 VAPID 키를 가져올 수 없습니다.");
            }

            // 서비스 워커가 준비될 때까지 대기
            const registration = await navigator.serviceWorker.ready;
            
            // 기존 구독 확인 및 갱신 처리
            try {
                const existingSubscription = await registration.pushManager.getSubscription();
                if (existingSubscription) {
                    await existingSubscription.unsubscribe();
                    console.log("기존 구독 정보를 갱신하기 위해 초기화했습니다.");
                }
            } catch (subError) {
                console.warn("기존 구독 해제 중 오류 발생 (무시하고 계속):", subError);
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

            if (saveResponse.ok) {
                console.log("푸시 알림 구독 및 서버 저장이 완료되었습니다.");
            } else {
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
                    // 서버에서도 구독 정보 삭제 시도
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
                    console.log("푸시 구독 해제 및 서버 삭제 완료");
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
                // 알림은 켜져있는데 구독이 없다면 재구독 시도
                subscribeToPush();
            }
        }
    };

    const [isTestSending, setIsTestSending] = useState(false);

    /* --- 이벤트 핸들러 --- */

    const handleSaveEmail = () => {
        // 이메일 형식 검사 정규식
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (tempEmail && !emailRegex.test(tempEmail)) {
            alert("올바른 이메일 형식이 아닙니다.");
            return;
        }

        setEmail(tempEmail);
        setIsEditingEmail(false);
        // 이메일이 비어있으면 알림 자동 비활성화
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
            // 메시지가 길어질 수 있으므로 3초 후 자동 삭제
            setTimeout(() => setTestMessage(""), 3000);
        }
    };

    /* 자동 저장 로직 */
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
            <div className="alarm-section" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* 이메일 알림 그룹 */}
                <div>
                    <div className="alarm-toggle-row" style={{ border: 'none', padding: 0, background: 'transparent', marginBottom: '8px' }}>
                        <div>
                            <h4 className="alarm-course-name">이메일 알림</h4>
                            <p className="alarm-description" style={{ fontSize: '0.82rem' }}>메일함으로 마감 알림을 보냅니다.</p>
                        </div>
                        <label className="alarm-switch">
                            <input
                                type="checkbox"
                                checked={emailAlerts}
                                disabled={!email}
                                onChange={(e) => setEmailAlerts(e.target.checked)}
                            />
                            <span className="alarm-slider" style={{ opacity: !email ? 0.5 : 1, cursor: !email ? 'not-allowed' : 'pointer' }}></span>
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                        {isEditingEmail ? (
                            <>
                                <input
                                    type="email"
                                    className="alarm-select"
                                    style={{ 
                                        width: '240px',
                                        height: '40px',
                                        boxSizing: 'border-box',
                                        padding: '10px 12px', 
                                        fontSize: '13px',
                                        cursor: 'text',
                                        background: 'var(--card-bg)',
                                        margin: 0
                                    }}
                                    placeholder="알림을 받을 이메일 주소 입력"
                                    value={tempEmail}
                                    onChange={(e) => setTempEmail(e.target.value)}
                                    autoFocus
                                />
                                <button 
                                    type="button" 
                                    className="add-reminder-button"
                                    style={{ padding: '0 16px', height: '40px', margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={handleSaveEmail}
                                >
                                    저장
                                </button>
                            </>
                        ) : (
                            <>
                                <div 
                                    className="alarm-select"
                                    style={{ 
                                        width: '240px',
                                        height: '40px',
                                        boxSizing: 'border-box',
                                        padding: '10px 12px', 
                                        fontSize: '13px',
                                        cursor: 'default',
                                        background: 'var(--sub-card-bg)',
                                        color: email ? 'var(--title)' : 'var(--card-content)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        opacity: email ? 1 : 0.7,
                                        border: '1px solid var(--alarm-input-border)',
                                        margin: 0
                                    }}
                                >
                                    {email || "등록된 이메일이 없습니다."}
                                </div>
                                <button 
                                    type="button" 
                                    className="add-reminder-button"
                                    style={{ 
                                        padding: '0 16px', 
                                        height: '40px',
                                        margin: 0,
                                        background: 'var(--card-bg)',
                                        color: 'var(--title)',
                                        border: '1px solid var(--alarm-input-border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
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
                        <p style={{ color: '#ff4d4f', fontSize: '0.75rem', marginTop: '4px' }}>
                            ※ 이메일을 등록해야 알림을 활성화할 수 있습니다.
                        </p>
                    )}
                </div>

                {/* 브라우저 푸시 알림 그룹 */}
                <div className="alarm-toggle-row" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                    <div>
                        <h4 className="alarm-course-name">브라우저 푸시 알림</h4>
                        <p className="alarm-description" style={{ fontSize: '0.85rem' }}>브라우저 알림창으로 즉시 알림을 보냅니다.</p>
                        {permissionStatus === 'denied' && (
                            <p style={{ color: '#ff4d4f', fontSize: '0.75rem', marginTop: '4px', lineHeight: '1.4' }}>
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
            <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'flex-end', 
                gap: '12px',
                marginBottom: '20px' 
            }}>
                {testMessage && (
                    <span className="alarm-save-message" style={{ padding: '6px 10px', fontSize: '12px' }}>
                        {testMessage}
                    </span>
                )}
                <button 
                    type="button" 
                    className="add-reminder-button" 
                    style={{ 
                        background: isTestSending ? '#ccc' : '#f0f0f0', 
                        color: '#333', 
                        border: '1px solid #ddd',
                        cursor: isTestSending ? 'not-allowed' : 'pointer',
                        margin: 0
                    }}
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

                        <div className="custom-reminder-box" style={{ border: 'none', background: 'transparent', padding: '0 10px' }}>
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>마감</span>
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

                <div className="save-alarm-wrapper" style={{ minHeight: '24px' }}>
                    {saveMessage && (
                        <p className="alarm-save-message" style={{ textAlign: 'center', color: '#4caf50', fontWeight: 'bold' }}>
                            {saveMessage}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

export default AlarmSettings;
