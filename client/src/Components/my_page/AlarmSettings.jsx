import { useEffect, useState, useMemo, useCallback } from "react";
import { API_BASE_URL } from "../../apiConfig";
import useAssignmentStore from "../../store/useAssignmentStore";
import useUserStore from "../../store/useUserStore";
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
    const { settings, fetchSettingsAndCourses, updateSettings } = useUserStore();

    /* --- 로컬 상태 (입력 UI 및 피드백용) --- */
    const [tempEmail, setTempEmail] = useState("");
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState(
        typeof Notification !== "undefined" ? Notification.permission : "default"
    );
    const [saveMessage, setSaveMessage] = useState("");
    const [testMessage, setTestMessage] = useState("");
    const [isTestSending, setIsTestSending] = useState(false);

    /* 과목별 알림 추가 로컬 상태 */
    const [selectedCourseId, setSelectedCourseId] = useState("all");
    const [reminderValue, setReminderValue] = useState("1");
    const [reminderUnit, setReminderUnit] = useState("hour");

    /* --- 초기 데이터 로드 --- */
    useEffect(() => {
        if (accessToken) {
            fetchAssignments(accessToken);
            fetchSettingsAndCourses(accessToken);
        }
    }, [accessToken, fetchAssignments, fetchSettingsAndCourses]);

    // 스토어 데이터 로드 시 tempEmail 초기화
    useEffect(() => {
        if (settings.isFetched && !isEditingEmail) {
            setTempEmail(settings.email);
        }
    }, [settings.isFetched, settings.email, isEditingEmail]);

    /* --- 계산된 값 (Memo) --- */
    const getCourseName = useCallback((courseId) => {
        if (courseId === "all") return "전체 과목";
        const course = settings.courses.find((c) => String(c.id) === String(courseId));
        return course ? course.name : courseId;
    }, [settings.courses]);

    const sortedCourseReminders = useMemo(() => {
        const reminders = settings.courseReminders || [];
        const courseOrderMap = new Map();
        settings.courses.forEach((c, index) => {
            courseOrderMap.set(String(c.id), index);
        });

        return [...reminders].sort((a, b) => {
            if (a.courseId === "all" && b.courseId !== "all") return -1;
            if (a.courseId !== "all" && b.courseId === "all") return 1;
            const orderA = courseOrderMap.get(String(a.courseId)) ?? 9999;
            const orderB = courseOrderMap.get(String(b.courseId)) ?? 9999;
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
    }, [settings.courseReminders, settings.courses]);

    const reminderMaxValue = reminderMaxByUnit[reminderUnit];
    const isReminderValueInvalid = reminderValue === "" || Number(reminderValue) < 1 || Number(reminderValue) > reminderMaxValue;
    const isAddButtonDisabled = (!settings.emailAlerts && !settings.browserAlerts) || !selectedCourseId || isReminderValueInvalid;

    /* --- 푸시 알림 권한/구독 로직 --- */
    const urlBase64ToUint8Array = (base64String) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    };

    const subscribeToPush = async () => {
        try {
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
                alert("푸시 알림 미지원 브라우저입니다.");
                updateSettings({ browserAlerts: false }, accessToken);
                return;
            }
            const keyRes = await fetch(`${API_BASE_URL}/api/vapid-public-key`, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const keyResult = await keyRes.json();
            if (!keyResult.success) throw new Error("VAPID 키 획득 실패");

            const registration = await navigator.serviceWorker.ready;
            const existingSub = await registration.pushManager.getSubscription();
            if (existingSub) await existingSub.unsubscribe();

            const permission = await Notification.requestPermission();
            setPermissionStatus(permission);
            if (permission !== 'granted') {
                alert("알림 권한이 필요합니다.");
                updateSettings({ browserAlerts: false }, accessToken);
                return;
            }

            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyResult.publicKey)
            });

            await fetch(`${API_BASE_URL}/api/push-subscription`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                body: JSON.stringify(subscription.toJSON()),
            });
        } catch (error) {
            console.error("구독 오류:", error);
            updateSettings({ browserAlerts: false }, accessToken);
        }
    };

    const unsubscribeFromPush = async () => {
        try {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                const sub = await reg.pushManager.getSubscription();
                if (sub) {
                    await fetch(`${API_BASE_URL}/api/push-subscription`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                        body: JSON.stringify(sub.toJSON()),
                    });
                    await sub.unsubscribe();
                }
            }
        } catch (error) { console.error("해제 오류:", error); }
    };

    /* --- 핸들러 --- */
    const handleSaveEmail = () => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (tempEmail && !emailRegex.test(tempEmail)) {
            alert("올바른 이메일 형식이 아닙니다.");
            return;
        }
        updateSettings({ email: tempEmail, emailAlerts: !!tempEmail && settings.emailAlerts }, accessToken);
        setIsEditingEmail(false);
        setSaveMessage("이메일이 저장되었습니다.");
    };

    const handleToggleEmailAlerts = (checked) => {
        if (!settings.email) return;
        updateSettings({ emailAlerts: checked }, accessToken);
        setSaveMessage(checked ? "이메일 알림 활성화" : "이메일 알림 비활성화");
    };

    const handleToggleBrowserAlerts = (checked) => {
        updateSettings({ browserAlerts: checked }, accessToken);
        if (checked) subscribeToPush();
        else unsubscribeFromPush();
        setSaveMessage(checked ? "브라우저 알림 활성화" : "브라우저 알림 비활성화");
    };

    const handleAddReminder = () => {
        if (isAddButtonDisabled) return;
        const newVal = Math.min(reminderMaxValue, Math.max(1, Number(reminderValue) || 1));
        const newReminders = [
            ...settings.courseReminders,
            { id: createReminderId(), courseId: selectedCourseId, value: newVal, unit: reminderUnit }
        ];
        updateSettings({ courseReminders: newReminders }, accessToken);
        setSelectedCourseId("all");
        setReminderValue("1");
        setSaveMessage("알림이 추가되었습니다.");
    };

    const handleDeleteReminder = (id) => {
        const newReminders = settings.courseReminders.filter(r => r.id !== id);
        updateSettings({ courseReminders: newReminders }, accessToken);
        setSaveMessage("알림이 삭제되었습니다.");
    };

    const handleTestNotification = async () => {
        if (!accessToken || isTestSending) return;
        setIsTestSending(true);
        setTestMessage("발송 중...");
        try {
            const res = await fetch(`${API_BASE_URL}/api/test-notification`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}` } });
            const result = await res.json();
            setTestMessage(result.success ? "발송 완료!" : "발송 실패");
        } catch (e) { setTestMessage("오류 발생"); }
        finally {
            setIsTestSending(false);
            setTimeout(() => setTestMessage(""), 3000);
        }
    };

    useEffect(() => {
        if (saveMessage) {
            const timer = setTimeout(() => setSaveMessage(""), 3000);
            return () => clearTimeout(timer);
        }
    }, [saveMessage]);

    if (settings.isLoading && !settings.isFetched) return <div className="alarm-empty-text">설정 로드 중...</div>;

    return (
        <div className="alarm-settings">
            <div className="alarm-section alarm-channel-group">
                <div>
                    <div className="alarm-toggle-row">
                        <div>
                            <h4 className="alarm-course-name">이메일 알림</h4>
                            <p className="alarm-description">메일함으로 마감 알림을 보냅니다.</p>
                        </div>
                        <label className="alarm-switch">
                            <input
                                type="checkbox"
                                checked={settings.emailAlerts}
                                disabled={!settings.email}
                                onChange={(e) => handleToggleEmailAlerts(e.target.checked)}
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
                                    placeholder="이메일 주소 입력"
                                    value={tempEmail}
                                    onChange={(e) => setTempEmail(e.target.value)}
                                    autoFocus
                                />
                                <button type="button" className="add-reminder-button" onClick={handleSaveEmail}>저장</button>
                            </>
                        ) : (
                            <>
                                <div className={`alarm-email-display ${!settings.email ? 'empty' : ''}`}>
                                    {settings.email || "등록된 이메일이 없습니다."}
                                </div>
                                <button type="button" className="add-reminder-button secondary" onClick={() => setIsEditingEmail(true)}>수정</button>
                            </>
                        )}
                    </div>
                </div>

                <div className="alarm-toggle-row">
                    <div>
                        <h4 className="alarm-course-name">브라우저 푸시 알림</h4>
                        <p className="alarm-description">브라우저 알림창으로 즉시 알림을 보냅니다.</p>
                    </div>
                    <label className="alarm-switch">
                        <input
                            type="checkbox"
                            checked={settings.browserAlerts}
                            onChange={(e) => handleToggleBrowserAlerts(e.target.checked)}
                        />
                        <span className="alarm-slider"></span>
                    </label>
                </div>
            </div>

            <div className="alarm-test-wrapper">
                {testMessage && <span className="alarm-test-status">{testMessage}</span>}
                <button type="button" className="alarm-test-button" disabled={isTestSending} onClick={handleTestNotification}>
                    {isTestSending ? "처리 중..." : "테스트 알림 발송"}
                </button>
            </div>

            <div className={(!settings.emailAlerts && !settings.browserAlerts) ? "alarm-disabled" : ""}>
                <div className="alarm-section">
                    <h3 className="alarm-section-title">과목별 알림 추가</h3>
                    <div className="course-reminder-add-row">
                        <select className="alarm-select" value={selectedCourseId} onChange={(e) => setSelectedCourseId(e.target.value)}>
                            {settings.courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="custom-reminder-box">
                            <span>마감</span>
                            <input type="number" min="1" value={reminderValue} onChange={(e) => setReminderValue(e.target.value)} />
                            <select value={reminderUnit} onChange={(e) => setReminderUnit(e.target.value)}>
                                <option value="minute">분</option>
                                <option value="hour">시간</option>
                                <option value="day">일</option>
                            </select>
                            <span>전</span>
                        </div>
                        <button type="button" className="add-reminder-button" disabled={isAddButtonDisabled} onClick={handleAddReminder}>추가</button>
                    </div>

                    <div className="alarm-course-list">
                        {sortedCourseReminders.length === 0 ? (
                            <p className="alarm-empty-text">설정된 알림이 없습니다.</p>
                        ) : (
                            sortedCourseReminders.map((r) => (
                                <div className="alarm-course-item" key={r.id}>
                                    <span className="alarm-course-name">{getCourseName(r.courseId)}</span>
                                    <div className="alarm-course-info">
                                        <span className="alarm-course-time">마감 {r.value}{r.unit === 'minute' ? '분' : r.unit === 'hour' ? '시간' : '일'} 전</span>
                                    </div>
                                    <button type="button" className="delete-reminder-button" onClick={() => handleDeleteReminder(r.id)}>삭제</button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div className="save-alarm-wrapper">
                    {saveMessage && <p className="alarm-save-message">{saveMessage}</p>}
                </div>
            </div>
        </div>
    );
}

export default AlarmSettings;
