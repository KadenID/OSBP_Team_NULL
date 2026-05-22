import React, { useEffect, useState } from 'react';
import './AssignmentDetail.css';

function AssignmentDetail({ assignment, onClose, updateDescription, accessToken }) {

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");

  // 객체 직접 참조
  const description = assignment.source === 'lms'
    ? "현재 상세 설명을 불러올 수 없습니다.\nLMS 페이지에서 직접 확인해주세요."
    : (assignment.description ?? "");

  if (!assignment) return null;

  // 생성 과제 편집
  const handleEditStart = () => {
    setEditText(assignment.description || "");
    setIsEditing(true);
  };

  // 생성 과제 저장
  const handleSave = () => {
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
        <div className="detail-info" style={{ marginBottom: '15px', fontSize: '0.9em', color: '#a3a3a3' }}>
          <p><strong>강의:</strong> {assignment.subject}</p>
          <p><strong>과제:</strong> {assignment.task}</p>
        </div>

        <hr />

        {/* user 과제일 때만 편집 버튼 표시 */}
        {isUser && !isEditing && (
          <div className="edit-header">
            <span className="detail-section-title">상세 설명</span>
            <button className="edit-btn" onClick={handleEditStart}>편집하기</button>
          </div>
        )}

        {isEditing ? (
          <div className="edit-area">
            <textarea
              className="detail-textarea"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="과제 상세 설명을 입력하세요..."
              autoFocus
            />
            <div className="edit-actions">
              <button className="save-btn" onClick={handleSave}>저장</button>
              <button className="cancel-btn" onClick={handleCancel}>취소</button>
            </div>
          </div>
        ) : (

        <pre className="detail-text">
            {description.trim() !== ""
                ? description
                : "상세 설명 데이터가 없습니다. 아래 링크를 참조하거나 LMS를 확인하세요."}
        </pre>
      )}


        {/* url이 있을 때만 링크 렌더링 */}
        {assignment.url && (
          <div className="detail-footer">
            <a href={assignment.url} target="_blank" rel="noopener noreferrer" className="lms-link">
              LMS 페이지로 이동
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssignmentDetail;