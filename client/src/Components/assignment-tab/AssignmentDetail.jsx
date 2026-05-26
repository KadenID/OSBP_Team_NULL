import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../apiConfig';
import './AssignmentDetail.css';

const DESCRIPTION_MAX_LENGTH = 1000;

function AssignmentDetail({ assignment, onClose, updateDescription, accessToken }) {

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // LMS 과제 상세 조회 상태
  const [lmsDetail, setLmsDetail] = useState(null);
  const [lmsLoading, setLmsLoading] = useState(false);
  const [lmsError, setLmsError] = useState("");

  // LMS 과제일 때 마운트 시 상세 조회 API 호출
  useEffect(() => {
    if (assignment?.source !== 'lms' || !assignment?.id) return;

    let cancelled = false;
    setLmsLoading(true);
    setLmsError("");
    setLmsDetail(null);

    fetch(`${API_BASE_URL}/api/assignments/${assignment.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    })
      .then((res) => res.json())
      .then((result) => {
        if (cancelled) return;
        if (result.success) {
          setLmsDetail(result.data);
        } else {
          setLmsError("과제 정보를 불러오지 못했습니다.");
        }
      })
      .catch(() => {
        if (!cancelled) setLmsError("네트워크 오류가 발생했습니다.");
      })
      .finally(() => {
        if (!cancelled) setLmsLoading(false);
      });

    return () => { cancelled = true; };
  }, [assignment?.id, assignment?.source, accessToken]);

  if (!assignment) return null;

  // 객체 직접 참조
  const description = assignment.source === 'lms'
    ? "현재 상세 설명을 불러올 수 없습니다.\nLMS 페이지에서 직접 확인해주세요."
    : (assignment.description ?? "");

  // 생성 과제 편집
  const handleEditStart = () => {
    setEditText(assignment.description || "");
    setIsEditing(true);
  };

  // 생성 과제 저장
  const handleSave = () => {
    if (editText.length > DESCRIPTION_MAX_LENGTH) return;

    updateDescription(assignment.id, editText, accessToken);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const isUser = assignment.source === 'user';

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={onClose}>✕</button>

        <h3>과제 상세 정보</h3>
        {/* 과제 기본 정보 요약 */}
        <div className="detail-modal-body">
        <div className="detail-info">
          <p><strong>과목:</strong> {assignment.subject}</p>
          <p><strong>과제:</strong> {assignment.task}</p>
          <p><strong>기한:</strong> {assignment.deadline?.replace('T', ' ').slice(0, 16)}</p>
        </div>
        <hr />

          {/* LMS 과제: 로딩/에러/상세 렌더링 */}
          {!isUser && (
            <>
              {lmsLoading && <p className="detail-loading">상세 정보를 불러오는 중...</p>}
              {lmsError   && <p className="detail-error">{lmsError}</p>}
              {lmsDetail && (
                <>
                  {(lmsDetail.description_html || lmsDetail.description) ? (
                    <div className="detail-section">
                      <span className="detail-section-title">과제 설명</span>
                      {lmsDetail.description_html ? (
                        <div
                          className="detail-html-content"
                          dangerouslySetInnerHTML={{ __html: lmsDetail.description_html }}
                        />
                      ) : (
                        <pre className="detail-text">{lmsDetail.description}</pre>
                      )}
                    </div>
                  ) : (
                    <p className="detail-empty">과제 설명이 없습니다.</p>
                  )}
                </>
              )}
              {/* lmsDetail 없을 때 fallback */}
              {!lmsLoading && !lmsError && !lmsDetail && (
                <pre className="detail-text">{description}</pre>
              )}
            </>
          )}

        {/* user 과제일 때만 편집 버튼 표시 */}
        {isUser && !isEditing && (
          <div className="edit-header">
            <span className="detail-section-title">상세 설명</span>
            <button className="edit-btn" onClick={handleEditStart}>편집하기</button>
          </div>
        )}

        {isUser && (
          isEditing ? (
          <div className="edit-area">
            <textarea
              className="detail-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="과제 상세 설명을 입력하세요..."
              autoFocus
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
            <div className="edit-actions">
              <button className="save-btn" onClick={handleSave}>저장</button>
              <button className="cancel-btn" onClick={handleCancel}>취소</button>
            </div>
          </div>
        ) : (

        <pre className="detail-text">
            {assignment.description?.trim()
                    ? assignment.description
                : "상세 설명 데이터가 없습니다. 아래 링크를 참조하거나 LMS를 확인하세요."}
        </pre>
        )
      )}
    </div>


        {/* url이 있을 때만 링크 렌더링 */}
        {(assignment.url || lmsDetail?.url) && (
          <div className="detail-footer">
            <a href={assignment.url || lmsDetail?.url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="lms-link"
          >
              LMS 페이지로 이동
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentDetail;