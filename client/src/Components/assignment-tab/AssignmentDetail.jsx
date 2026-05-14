import React, { useEffect, useState } from 'react';
import './AssignmentDetail.css';

function AssignmentDetail({ assignment, onClose }) {
    
  const [description, setDescription] = useState("");

  useEffect(() => {
  setDescription(""); // 

  if (assignment?.source === 'lms') {
    const mockDescriptions = {
      default: "현재 상세 설명을 불러올 수 없습니다.\nLMS 페이지에서 직접 확인해주세요."
    };
    setDescription(mockDescriptions[assignment.id] ?? mockDescriptions.default);
  }
}, [assignment]);


  if (!assignment) return null;

  return (
    <div className="detail-overlay" onClick={onClose}>
      <div
        className="detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={onClose}>✕</button>

        <h3>과제 상세 정보</h3>

        {/* 과제 기본 정보 요약 */}
        <div className="detail-info" style={{ marginBottom: '15px', fontSize: '0.9em', color: '#666' }}>
          <p><strong>강의:</strong> {assignment.subject}</p>
          <p><strong>과제:</strong> {assignment.task}</p>
        </div>

        <hr />

        <pre className="detail-text">
            {description.trim() !== ""
                ? description
                : "상세 설명 데이터가 없습니다. 아래 링크를 참조하거나 LMS를 확인하세요."}
        </pre>


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