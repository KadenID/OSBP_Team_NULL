import React, {useState, useMemo, useEffect} from 'react';
import './AssignmentTab.css';

const TABS = { ALL: 'ALL', INCOMPLETED: 'INCOMPLETED', COMPLETED: 'COMPLETED' };

const STATUS = {
  UNSUBMITTED: 'UNSUBMITTED',
  SUBMITTED: 'SUBMITTED',
  ONGOING: 'ONGOING',
  OVERDUE: 'OVERDUE'
};


// 타이머 컴포넌트 분리 - 컴포넌트 내부에서만 1초마다 리렌더링
  const CountdownText = ({ deadlineDate }) => {
    const [now, setNow] = useState(new Date());

    useEffect(() => { // 이 컴포넌트가 마운트될 때만 타이머가 시작
      const timer = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(timer); // 언마운트 시 클린업
    }, []);

    const diff = deadlineDate - now;
    if (diff <= 0) return <span className="dday-text expired">기한 종료</span>; // 기한이 지났을 경우 처리

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    const totalHours = days * 24 + hours; // 며칠인지와 상관없이 전체 시간 합산

    let displayText = "";
    if (days > 0) { displayText = `D-${days} (${totalHours}시간 ${minutes}분 ${seconds}초)`;
    } else if (hours > 0) { displayText = `${totalHours}시간 ${minutes}분 ${seconds}초`;
    } else { displayText = `${minutes}분 ${seconds}초`;
    } return <span className="dday-text">{displayText}</span>;
  };


function AssignmentTab() {

  //임시 데이터(목 데이터)
  const [assignment] = useState([
    { id: 1, subject: "오픈소스기초 프로젝트", task: "9주차 카페 글 작성", deadline: "2026-05-10T23:59:59", isSubmitted: true, source: 'lms' },
    { id: 2, subject: "컴퓨터 구조", task: "4장 연습 문제 제출", deadline: "2026-05-25T23:59:59", isSubmitted: false, source: 'lms' },
    { id: 3, subject: "3333", task: "3333", deadline: "2026-04-14T23:59:59", isSubmitted: false, source: 'lms' },
    { id: 4, subject: "4444", task: "4444", deadline: "2026-04-25T23:59:59", isSubmitted: true, source: 'lms' }
  ]);

  // 과제 상세 설명 기능 (다른 브랜치를 통해 구현할 예정)

  const [newSubject, setNewSubject] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const [currentTab, setCurrentTab] = useState(TABS.ALL);
  const [activeTags, setActiveTags] = useState([]);

  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [targetId, setTargetId] = useState(null);


  // 과제 추가 로직 source : user 로 과제 생성
  const addAssignment = (e) => {
    e.preventDefault();

    if (!newSubject || !newTask || !newDeadline) { 
      setError("모든 값을 입력해주세요");
      return; }

    const deadlineObj = new Date(newDeadline);
    deadlineObj.setSeconds(59);

    const newItem = {
      id: Date.now(),
      subject: newSubject,
      task: newTask,
      deadline: deadlineObj.toISOString(),
      isSubmitted: false,
      source: 'user'
    };

    setAssignment([...assignment, newItem]);
    setNewSubject(""); setNewTask(""); setNewDeadline("");
  };


  // 삭제 로직 (source 체크)
  const confirmDelete = () => {
    setAssignment(prev => prev.filter(item => item.id !== targetId));
    setShowModal(false);
    setTargetId(null);
  };


  // 제출 상태 토글 함수
  const toggleSubmit = (id) => {
    setAssignment(prev => prev.map(item => 
      item.id === id ? { ...item, isSubmitted: !item.isSubmitted } : item
    ));
  };


   // 과제 필터링 함수 : processed + filteredList
  const processed = useMemo(() => {
    const now = new Date();

    return assignment.map(item => {
      const deadlineDate = new Date(item.deadline);

        return {
          ...item,
          deadlineDate,
          isExpired: deadlineDate - now <= 0
        };
      });

  }, [assignment]);


  const filteredList = useMemo(() => {
    return processed.filter(item => {

    const isExpired = item.isExpired;

    // 완료탭 : 제출완료 + 기한 지남
    if (currentTab === TABS.COMPLETED) return isExpired && item.isSubmitted;

    if (currentTab === TABS.INCOMPLETED) {
       if (activeTags.length > 0) {
            return activeTags.every(tag => {
              if (tag === STATUS.SUBMITTED) return item.isSubmitted;
              if (tag === STATUS.UNSUBMITTED) return !item.isSubmitted;
              if (tag === STATUS.ONGOING) return !isExpired;
              if (tag === STATUS.OVERDUE) return isExpired;
              return true;
            });
          } return !item.isSubmitted && !isExpired; // 진행탭 : 태그 선택 안하는 경우, 미제출 + 기한 남음
        } return true;
      });
  }, [processed, currentTab, activeTags]);


  const sortedList = useMemo(() => { // 남은 기한이 적은 순으로 과제 정렬
    return [...filteredList].sort(
      (a, b) => a.deadlineDate - b.deadlineDate
    );
  }, [filteredList]);
  

  //상태 변경
  const toggleTag = (tag) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);

      let nextTags = [...prev];

      if (tag === STATUS.SUBMITTED) nextTags = nextTags.filter((t) => t !== STATUS.UNSUBMITTED);
      else if (tag === STATUS.UNSUBMITTED) nextTags = nextTags.filter((t) => t !== STATUS.SUBMITTED);

      if (tag === STATUS.ONGOING) nextTags = nextTags.filter((t) => t !== STATUS.OVERDUE);
      else if (tag === STATUS.OVERDUE) nextTags = nextTags.filter((t) => t !== STATUS.ONGOING);
      return [...nextTags, tag];
    });
  };


  // 상태 조합별 카드 배경 클래스 결정 함수
  const getItemClass = (isExpired, isSubmitted) => {
    if (isExpired) return 'expired';       
    if (!isExpired && !isSubmitted) return 'yet-ongoing';
    if (!isExpired && isSubmitted) return 'done-ongoing';
    return '';
  };


  return (
    <div className="assignment-wrapper">

      <form className="add-form" onSubmit={addAssignment}> {/* 과제 생성 창 */}

        <div className="input-group">
          <div className="input-field">
            <input type="text" placeholder="과목" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
          </div>

          <div className="input-field">
            <input type="text" placeholder="할 일" value={newTask} onChange={e => setNewTask(e.target.value)} />
          </div>

          <div className="input-field">
            <input type="datetime-local" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} />
          </div>
        </div>
          
          {error && <p className="error-text">{error}</p>} {/* 에러 메시지 */}
          <button type="submit" className="add-submit-btn">새 과제 추가</button>
      </form>

      <div className="tab-buttons">  {/*전체, 진행, 완료 탭 버튼*/}
        {Object.entries(TABS).map(([key, value]) => (
          <button
            key={key}
            className={`tab-button ${currentTab === value ? 'active' : ''}`}
            onClick={() => { setCurrentTab(value); setActiveTags([]); }}
          >
            {value === 'ALL' ? '전체' : value === 'INCOMPLETED' ? '진행' : '완료'}
          </button>
        ))}
      </div>


      {currentTab === TABS.INCOMPLETED && ( // 진행 탭의 필터링 태그
        <div className="tag-container"><p>상세 필터:</p>
          {[
            { id: STATUS.SUBMITTED,   label: '제출' },
            { id: STATUS.UNSUBMITTED, label: '미제출' },
            { id: STATUS.ONGOING,     label: '기한 남음' },
            { id: STATUS.OVERDUE,     label: '기한 지남' }
          ].map(tag => (
            <button
              key={tag.id}
              className={activeTags.includes(tag.id) ? 'on' : ''}
              onClick={() => toggleTag(tag.id)}
            >{tag.label}
            </button>
          ))}
        </div>
      )}


    <div className="assignment-container">
      <header> <p className="tab-title">과제 목록({filteredList.length})</p></header>

      <ul className="mainbox">
        {sortedList.length === 0 ? <p>과제가 없습니다.</p> :
            sortedList.map(item => (
             <li
                className={`assignment-item ${getItemClass(item.isExpired, item.isSubmitted)}`}
                key={item.id}
                >

              <div className="info">
                <span className={`source-tag ${item.source}`}>{item.source === 'lms' ? 'LMS' : 'USER'}</span>
                <span className="subject">{item.subject}</span>
                <p className="task-name">{item.task}</p>
              </div>
             
              <div className="status-box">
                <div className={`status-label ${item.isSubmitted ? 'done' : 'yet'}`}>
                  {item.isSubmitted ? '제출 완료' : '미제출'}
                </div>

                <span className="deadline-text"> 기한: {item.deadline.replace('T', ' ').slice(0, 16)}</span>
                <CountdownText deadlineDate={item.deadlineDate} /> 

                <div className="item-actions">
                    {item.source === 'user' ? (
                      <>
                        <button onClick={() => toggleSubmit(item.id)} className="action-btn toggle">
                          {item.isSubmitted ? '진행으로 변경' : '완료 처리'}
                        </button>
                        <button onClick={() => {setTargetId(item.id); setShowModal(true);}} className="action-btn delete">삭제</button>
                      </>
                    ) : (
                      <span className="lock-msg">시스템 관리항목</span>
                    )}
                  </div>

                </div>
              </li>
            ))}
        </ul>
        {showModal && (<div className="modal-overlay">
            <div className="modal"><p>과제를 삭제하시겠습니까?</p>
              <div className="modal-buttons">
              <button onClick={confirmDelete}>삭제</button>
              <button onClick={() => setShowModal(false)}>취소</button>
              </div>
            </div>
          </div>)}
      </div>
    </div>
  );
}
export default AssignmentTab;