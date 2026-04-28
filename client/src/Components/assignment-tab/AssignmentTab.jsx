import React, {useState} from 'react';
import './AssignmentTab.css';

const STATUS = {
  INCOMPLETE: 'Incomplete',
  COMPLETE: 'Complete'
};

function AssignmentTab() {
  //임시 데이터(목 데이터)
  const [assignment, setAssignment] = useState([
    { id: 1, subject: "오픈소스기초 프로젝트", task: "9주차 카페 글 작성", dday: 9, status: STATUS.INCOMPLETE },
    { id: 2, subject: "컴퓨터 구조", task: "4장 연습 문제 제출", dday: 3, status: STATUS.COMPLETE }
  ]);

  //과제 상세 설명 기능 (아직)

  const [currentTab, setCurrentTab] = useState(STATUS.INCOMPLETE);
  
  //과제 정렬 함수  
  const filteredList = (assignment || [])
    .filter(item => item?.status === currentTab)
    .sort((a,b) => (a?.dday || 0) - (b?.dday || 0));
  
  //상태 변경 함수
  const handleStatusChange = (id) => {
    setAssignment(assignment.map(item =>
      item?.id === id ? { ...item, status: STATUS.COMPLETE } : item
    ));
    setCurrentTab(STATUS.COMPLETE);
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