import React, {useState} from 'react';
import './AssignmentTab.css';

const STATUS = {
  INCOMPLETE: 'Incomplete',
  COMPLETE: 'Complete'
};


function j() {
const [assignment, setAssignment] = useState([
    { id: 1, subject: "오픈소스기초 프로젝트", task: "9주차 카페 글 작성", dday: 9, status: STATUS.INCOMPLETE },
    { id: 2, subject: "컴퓨터 구조", task: "4장 연습 문제 제출", dday: 3, status: STATUS.COMPLETE }
  ]);

  //미제출 버튼 누르면 재출 완료로 바뀌면서 재출 완료 탭으로 넘어가기
  //과제 남은 기간 순으로 정렬하기
  //과제누르면 관련 정보 나오게

  const [currentTab, setCurrentTab] = useState(STATUS.INCOMPLETE);

  const filteredList = assignment.filter(item => item.status === currentTab);

  return (
    <>
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
            <div className="assignment-item" key={item.id}>
            
              <div className="info">
                <span className="subject">{item.subject}</span>

                <p className="task-name">{item.task}</p>
              </div>
             
              <div className="status-box">
                <span className={`status ${item.status}`}>
                  {item.status === STATUS.INCOMPLETE ? '미제출' : '제출 완료'}
                </span>
                <span className="d-day">D-{item.dday}</span>
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
