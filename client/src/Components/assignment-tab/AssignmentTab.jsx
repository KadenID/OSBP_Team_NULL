import React, {useState, useMemo, useEffect} from 'react';
import './AssignmentTab.css';

const TABS = { ALL: 'ALL', INCOMPLETED: 'INCOMPLETED', COMPLETED: 'COMPLETED' };

const STATUS = {
  UNSUBMITTED: 'UNSUBMITTED',
  SUBMITTED: 'SUBMITTED',
  ONGOING: 'ONGOING',
  OVERDUE: 'OVERDUE'
};

function AssignmentTab() {
  //임시 데이터(목 데이터)
  const [assignment, setAssignment] = useState([
    { id: 1, subject: "오픈소스기초 프로젝트", task: "9주차 카페 글 작성", deadline: "2026-05-10T23:59:59", isSubmitted: true },
    { id: 2, subject: "컴퓨터 구조", task: "4장 연습 문제 제출", deadline: "2026-05-25T23:59:59", isSubmitted: false }
  ]);

  //과제 상세 설명 기능 (아직)

  const [currentTab, setCurrentTab] = useState(TABS.ALL);
  const [activeTags, setActiveTags] = useState([]);
  
  //과제 정렬 함수  
  const filteredList = useMemo(() => {
    return assignment
     .filter(item => item.status === currentTab)
     .sort((a,b) => a.dday - b.dday || 0);
  }, [assignment, currentTab]);

  //상태 변경
  const toggleTag = (tag) => { // 토글
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);

      let nextTags = [...prev];

      if (tag === Status.SUBMITTED) { // 제출/미제출 중 하나만 선택 가능
        nextTags = nextTags.filter((t) => t !== Status.UNSUBMITTED);
      } else if (tag === Status.UNSUBMITTED) {
        nextTags = nextTags.filter((t) => t !== Status.SUBMITTED);
      }

      if (tag === Status.ONGOING) { // 기한 지남/기한 남음 중 하나만 선택 가능
        nextTags = nextTags.filter((t) => t !== Status.OVERDUE);
      } else if (tag === Status.OVERDUE) {
        nextTags = nextTags.filter((t) => t !== Status.ONGOING);
      }

      return [...nextTags, tag];
    });
  };

  return (
    <>
    {/*탭 버튼 구현*/}
    <div className="tab-buttons">
        <button 
          className={`tab-button ${currentTab === STATUS.INCOMPLETE ? 'active' : ''}`}
          onClick={() => setCurrentTab(STATUS.INCOMPLETE)}
        > 미제출
        </button>
        <button 
          className={`tab-button ${currentTab === STATUS.COMPLETE ? 'active' : ''}`}
          onClick={() => setCurrentTab(STATUS.COMPLETE)}
        > 제출 완료
        </button>
      </div>

    <div className="assignment-container">
      <header> <p className="tab-title">과제</p></header>

      <main className="mainbox">
        {filteredList.length === 0 ? (
            <p>과제가 없습니다.</p>
        ) : (
          filteredList.map((item) => (
            <div className="assignment-item" key={item?.id}>
            
              <div className="info">
                <span className="subject">{item?.subject}</span>
                <p className="task-name">{item?.task}</p>
              </div>

              {/*미제출 누르면 제출 완료로 넘어감, 단방향*/}
              <div className="status-box">
                <button 
                  className={`status ${item?.status}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(item?.id);
                  }}
                >
                  {item.status === STATUS.INCOMPLETE ? '미제출' : '제출 완료'}
                </button>
                <span className="d-day">D-{item?.dday}</span>
              </div>

            </div>
          ))
        )}

      </main>
    </div>
    </>
  );
}

export default AssignmentTab;