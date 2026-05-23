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

    // 과목명 정렬 기준: 한글 시작 > 영어 시작 > 기타 (사전순)
    const sortCourseNames = useCallback((a, b) => {
        if (!a) return 1;
        if (!b) return -1;

        // 시작 문자가 해당 언어권인지 판별
        const isKoreanStart = (s) => /^[가-힣]/.test(s);
        const isEnglishStart = (s) => /^[a-zA-Z]/.test(s);
        
        const aKo = isKoreanStart(a);
        const bKo = isKoreanStart(b);
        
        // 1. 한글로 시작하는 과목 우선
        if (aKo && !bKo) return -1;
        if (!aKo && bKo) return 1;
        
        const aEn = isEnglishStart(a);
        const bEn = isEnglishStart(b);
        
        // 2. 영어로 시작하는 과목 다음
        if (aEn && !bEn) return -1;
        if (!aEn && bEn) return 1;
        
        // 3. 같은 카테고리 내에서는 사전순 (가나다, ABC)
        return String(a).localeCompare(String(b), 'ko', { sensitivity: 'base' });
    }, []);

    const courses = useMemo(() => {
        // assignment가 없을 경우 빈 배열 반환
        if (!assignment || !Array.isArray(assignment)) {
            return [{ id: "all", name: "전체 과목" }];
        }
        const uniqueSubjects = Array.from(new Set(assignment.map(a => a.subject))).filter(Boolean);
        const sortedSubjects = uniqueSubjects.sort(sortCourseNames);

        return [
            { id: "all", name: "전체 과목" },
            ...sortedSubjects.map(subject => ({ id: subject, name: subject }))
        ];
    }, [assignment, sortCourseNames]);

    const getCourseName = useCallback((courseId) => {
        const course = courses.find((c) => c.id === courseId);
        return course ? course.name : "알 수 없는 과목";
    }, [courses]);

    // 정렬된 알림 목록
    const sortedCourseReminders = useMemo(() => {
        if (!courseReminders || !Array.isArray(courseReminders)) return [];
        
        return [...courseReminders].sort((a, b) => {
            if (a.courseId === "all" && b.courseId !== "all") return -1;
            if (a.courseId !== "all" && b.courseId === "all") return 1;
            
            const nameA = getCourseName(a.courseId);
            const nameB = getCourseName(b.courseId);
            
            const nameComp = sortCourseNames(nameA, nameB);
            if (nameComp !== 0) return nameComp;
            
            const getMins = (r) => {
                const val = Number(r.value);
                if (r.unit === 'minute') return val;
                if (r.unit === 'hour') return val * 60;
                if (r.unit === 'day') return val * 1440;
                return 0;
            };
            return getMins(a) - getMins(b);
        });
    }, [courseReminders, getCourseName, sortCourseNames]);

    useEffect(() => {
        const fetchSettings = async () => {
            if (!accessToken) return;
            try {
                const response = await fetch(`${API_BASE_URL}/api/user-settings`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const result = await response.json();
                if (result.success && result.data) {
                    setEmail(result.data.email || "");
                    setTempEmail(result.data.email || "");
                    setEmailAlerts(result.data.emailAlerts ?? true);
                    setBrowserAlerts(result.data.browserAlerts ?? true);
                    setCourseReminders(result.data.courseReminders ?? []);
                    
                    // 하이드레이션: 브라우저에 구독 정보가 있는지 확인
                    if (result.data.browserAlerts) {
                        checkAndSyncSubscription();
                    }
                }
            } catch (error) {
                console.error("설정 로드 오류:", error);
            } finally {
                setTimeout(() => setIsInitialLoad(false), 100);
            }
        };
        fetchSettings();
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
                throw new Error("VAPID 키 로드 실패");
            }

            const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
            
            // 기존 구독이 있다면 강제로 해제 (구독 정보 초기화 및 갱신)
            const existingSubscription = await registration.pushManager.getSubscription();
            if (existingSubscription) {
                await existingSubscription.unsubscribe();
                console.log("기존 구독 해제 완료 (갱신 준비)");
            }

            // 서비스 워커 업데이트 강제 실행
            await registration.update();

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

            // PushSubscription 객체를 JSON으로 변환 (p256dh, auth 키 포함 보장)
            const subscriptionJSON = subscription.toJSON();

            await fetch(`${API_BASE_URL}/api/push-subscription`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(subscriptionJSON),
            });
            console.log("푸시 신규 구독 및 서버 저장 완료:", subscriptionJSON);
        } catch (error) {
            console.error("푸시 구독 오류:", error);
            alert("알림 구독 중 오류가 발생했습니다.");
            setBrowserAlerts(false);
        }
    };

    const unsubscribeFromPush = async () => {
        try {
            const registration = await navigator.serviceWorker.getRegistration();
            if (registration) {
                const subscription = await registration.pushManager.getSubscription();
                if (subscription) {
                    await subscription.unsubscribe();
                    console.log("푸시 구독 해제 완료");
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
