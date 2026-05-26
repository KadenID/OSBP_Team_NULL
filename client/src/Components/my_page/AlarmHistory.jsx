import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../apiConfig";
import "./AlarmSettings.css";

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
                <div className="alarm-section-header">
                    <h3 className="alarm-section-title">최근 알림 발송 내역</h3>
                    <span className="alarm-helper-text">최근 30일 내역만 표시됩니다.</span>
                </div>
                <div className="alarm-course-list">
                    {history.length === 0 ? (
                        <p className="alarm-empty-text">최근 30일간 발송된 알림이 없습니다.</p>
                    ) : (
                        history.map((item) => (
                            <div 
                                className={`alarm-history-item ${item.url ? 'link' : ''}`} 
                                key={item.id} 
                                onClick={() => item.url && window.open(item.url, '_blank')}
                            >
                                <button 
                                    className="alarm-history-close"
                                    onClick={(e) => handleDeleteHistory(e, item.id)}
                                    title="삭제"
                                >
                                    &times;
                                </button>

                                <div className="alarm-history-header">
                                    <span className="alarm-history-title">{item.title}</span>
                                    <span className="alarm-helper-text">{formatDate(item.sent_at)}</span>
                                </div>
                                <p className="alarm-description">{item.message}</p>
                                <div className="alarm-history-footer">
                                    <span className="alarm-badge">
                                        {item.channel} 발송 완료
                                    </span>
                                    {item.url && item.url !== "/" && (
                                        <span className="alarm-link-text">
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
