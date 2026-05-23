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

    const handleDeleteHistory = async (e, historyId) => {
        e.stopPropagation(); // 카드 클릭(URL 이동) 방지
        if (!accessToken) return;
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/notification-history/${historyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                setHistory((prev) => prev.filter(item => item.id !== historyId));
            }
        } catch (error) {
            console.error("알림 내역 삭제 오류:", error);
        }
    };

    if (isLoading) return <div className="alarm-empty-text">불러오는 중...</div>;

    return (
        <div className="alarm-settings">
            <div className="alarm-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 className="alarm-section-title" style={{ margin: 0 }}>최근 알림 발송 내역</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--card-content)' }}>최근 30일 내역만 표시됩니다.</span>
                </div>
                <div className="alarm-course-list">
                    {history.length === 0 ? (
                        <p className="alarm-empty-text">최근 30일간 발송된 알림이 없습니다.</p>
                    ) : (
                        history.map((item) => (
                            <div 
                                className="alarm-course-item" 
                                key={item.id} 
                                onClick={() => item.url && window.open(item.url, '_blank')}
                                style={{ 
                                    cursor: item.url ? 'pointer' : 'default',
                                    position: 'relative',
                                    display: 'block' // grid에서 block으로 변경하여 내부 커스텀 배치
                                }}
                            >
                                <button 
                                    onClick={(e) => handleDeleteHistory(e, item.id)}
                                    style={{
                                        position: 'absolute',
                                        top: '10px',
                                        right: '10px',
                                        background: 'none',
                                        border: 'none',
                                        color: '#9ca3af',
                                        cursor: 'pointer',
                                        fontSize: '1.1rem',
                                        padding: '4px',
                                        zIndex: 2
                                    }}
                                    title="삭제"
                                >
                                    &times;
                                </button>

                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', paddingRight: '25px' }}>
                                    <span className="alarm-course-name" style={{ fontSize: '0.95rem' }}>{item.title}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--card-content)' }}>{formatDate(item.sent_at)}</span>
                                </div>
                                <p className="alarm-description" style={{ margin: 0, fontSize: '0.85rem', color: 'var(--card-content)' }}>{item.message}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
                                    <span style={{ 
                                        fontSize: '0.7rem', 
                                        padding: '2px 6px', 
                                        background: 'var(--alarm-section-bg)', 
                                        borderRadius: '4px',
                                        color: 'var(--alarm-button)',
                                        fontWeight: '600'
                                    }}>
                                        {item.channel} 발송 완료
                                    </span>
                                    {item.url && item.url !== "/" && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--alarm-button)', fontWeight: '600' }}>
                                            과제 바로가기 ↗
                                        </span>
                                    )}
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
