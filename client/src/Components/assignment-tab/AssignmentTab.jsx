import React, {useState, useMemo, useEffect} from 'react';
import './AssignmentTab.css';

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
  if (diff <= 0) return <span className="dday-text">기한 종료</span>; // 기한이 지났을 경우 처리

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

  // 임시 데이터를 지우고 빈 배열로 초기 상태 설정
  const [assignment, setAssignment] = useState([]);
  // 로딩 상태를 관리할 state 추가
  const [isLoading, setIsLoading] = useState(true);

  // useEffect를 사용하여 최초 렌더링 시 API 자동 호출
  useEffect(() => {
    // 백엔드 API 주소로 GET 요청
    fetch('http://localhost:8000/api/assignments')
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          // 백엔드 데이터 형식을 프론트엔드 형식으로 매핑
          const fetchedData = result.data.map(item => ({
            id: item.assignment_id,           // 고유 ID
            subject: item.course_name,        // 과목명
            task: item.assignment_name,       // 과제명
            deadline: item.due_date,          // 마감일
            isSubmitted: item.status.includes('제출 완료'), // 상태를 boolean으로 변환
            source: 'lms'                     // 출처 표시
          }));
        
          setAssignment(fetchedData); // 변환된 데이터로 상태 업데이트
        } else {
          console.error("데이터를 불러오지 못했습니다:", result.message);
        }
      })
      .catch(error => {
        console.error("API 호출 중 오류 발생:", error);
      })
      .finally(() => {
        setIsLoading(false); // 성공 여부와 관계없이 로딩 종료
      });
  }, []); // 빈 배열 []을 넣어야 최초 1회만 실행

  // 과제 상세 설명 기능 (다른 브랜치를 통해 구현할 예정)

  const [newSubject, setNewSubject] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newDeadline, setNewDeadline] = useState("");

  const [activeTags, setActiveTags] = useState([
    STATUS.UNSUBMITTED,
    STATUS.ONGOING
  ]);

  const [showModal, setShowModal] = useState(false);
  const [targetId, setTargetId] = useState(null);

  
  // 모달 열림 상태 - hover 효과 제거 
  useEffect(() => {
    if (showModal) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');

    return () => {
     document.body.classList.remove('modal-open');
    };
  }, [showModal]);


  // 과제 추가 로직 source : user 로 과제 생성
  const addAssignment = (e) => {
    e.preventDefault();

    const newItem = {
      id: Date.now(),
      subject: newSubject,
      task: newTask,
      deadline: `${newDeadline}:59`,
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
      return { ...item, deadlineDate, isExpired: deadlineDate - now <= 0 };
    });
  }, [assignment]);


  const filteredList = useMemo(() => {
    return processed.filter(item => {

      const isExpired = item.isExpired;
      
      // 태그 선택 안하면 전체 표시
      if (activeTags.length === 0) return true;

          return activeTags.every(tag => {
            if (tag === STATUS.SUBMITTED) return item.isSubmitted;
            if (tag === STATUS.UNSUBMITTED) return !item.isSubmitted;
            if (tag === STATUS.ONGOING) return !isExpired;
            if (tag === STATUS.OVERDUE) return isExpired;
            return true;
          });
        });
      }, [processed, activeTags]);


  const sortedList = useMemo(() => { // 남은 기한이 적은 순으로 과제 정렬
    return [...filteredList].sort((a, b) => a.deadlineDate - b.deadlineDate);
  }, [filteredList]);
  

  // 상태 변경
  const toggleTag = (tag) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);

      let nextTags = [...prev];

      if (tag === STATUS.SUBMITTED) nextTags = nextTags.filter((t) => t !== STATUS.UNSUBMITTED); // 제출 - 미제출 하나만 선택 가능
      else if (tag === STATUS.UNSUBMITTED) nextTags = nextTags.filter((t) => t !== STATUS.SUBMITTED);
      
      if (tag === STATUS.ONGOING) nextTags = nextTags.filter((t) => t !== STATUS.OVERDUE); // 기한남음 - 기한지남 하나만 선택 가능
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

      <form className="add-form" onSubmit={addAssignment}> {/* 과제 생성 영역 */}
        <div className="input-group">
          <div className="input-field">
            <input type="text" placeholder="과목" value={newSubject} onChange={e => setNewSubject(e.target.value)} />
          </div>

          <div className="input-field">
            <input type="text" placeholder="할 일" value={newTask} onChange={e => setNewTask(e.target.value)} />
          </div>

          <div className="input-field">
            <input type="datetime-local" value={newDeadline} onChange={e => setNewDeadline(e.target.value)} required/>
          </div>
        </div>
          
          <button type="submit" className="add-submit-btn">새 과제 추가</button>
      </form>

        <div className="tag-container"><p>상세 필터:</p> {/* 필터링 태그 */}
          {[
            { id: STATUS.UNSUBMITTED, label: '미제출' },
            { id: STATUS.SUBMITTED,   label: '제출' },
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


    <div className="assignment-container">
      <header> <p className="tab-title">과제 목록({filteredList.length})</p></header>

      <ul className="mainbox"> {/* 과제 없는 경우 */}
        {sortedList.length === 0 ? <p>과제가 없습니다.</p> :
            sortedList.map(item => (
             <li
                className={`assignment-item ${getItemClass(item.isExpired, item.isSubmitted)}`}
                key={item.id}
                >

              <div className="info"> {/* lms 과제인지 생성 과제인지 라벨링 */}
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

                <div className="item-actions"> {/* 생성과제 - 삭제, 완료 처리 버튼 영역 */}
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
          </div >
        </div>)}
      </div>
    </div>
  );
}
export default AssignmentTab;