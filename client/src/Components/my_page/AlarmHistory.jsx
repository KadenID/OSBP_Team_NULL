import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";

function AlarmHistory({ accessToken }) {
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!accessToken) return;
            try {
                const response = await fetch(`${API_BASE_URL}/api/notification-history`, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                const result = await response.json();
                if (result.success) {
                    setHistory(result.data);
                }
            } catch (error) {
                console.error("알림 내역 로드 오류:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchHistory();
    }, [accessToken]);

    const formatDate = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleString('ko-KR', {
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (isLoading) return <div className="alarm-empty-text">불러오는 중...</div>;

    return (
        <div className="alarm-settings">
            <div className="alarm-section">
                <h3 className="alarm-section-title">최근 알림 발송 내역</h3>
                <div className="alarm-course-list">
                    {history.length === 0 ? (
                        <p className="alarm-empty-text">최근 30일간 발송된 알림이 없습니다.</p>
                    ) : (
                        history.map((item) => (
                            <div className="alarm-course-item" key={item.id} style={{ cursor: 'default' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span className="alarm-course-name" style={{ fontSize: '0.95rem' }}>{item.title}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--card-content)' }}>{formatDate(item.sent_at)}</span>
                                    </div>
                                    <p className="alarm-description" style={{ margin: 0, fontSize: '0.85rem' }}>{item.message}</p>
                                    <div style={{ marginTop: '6px' }}>
                                        <span style={{ 
                                            fontSize: '0.7rem', 
                                            padding: '2px 6px', 
                                            background: 'var(--alarm-section-bg)', 
                                            borderRadius: '4px',
                                            color: 'var(--alarm-button)'
                                        }}>
                                            {item.channel} 발송 완료
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default AlarmHistory;
