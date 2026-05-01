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


  // 1초마다 now 갱신
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer); // 언마운트 시 정리
  }, []);


  // 디데이 계산 함수
  const calcDday = (deadline) => {
    const diff = new Date(deadline) - now;
    if (diff <= 0) return null;

    const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // days > 0이어도 총 시간 전부 표시
    const totalHours = days * 24 + hours;

    if (days > 0) return `D-${days} (${totalHours}시간 ${minutes}분 ${seconds}초)`;
    if (hours > 0) return `${totalHours}시간 ${minutes}분 ${seconds}초`;
    return `${minutes}분 ${seconds}초`;
  };
  

  const filteredList = useMemo(() => {

    return assignment
      
      .map(item => ({
        ...item,
        isExpired: new Date(item.deadline) < now,
        deadlineLabel: item.deadline.replace('T', ' ').substring(0, 16),
        dday: calcDday(item.deadline) // 디데이 추가
      }))
    
      .filter(item => {
        const { isExpired } = item;

        if (currentTab === TABS.COMPLETED) return isExpired && item.isSubmitted; // 완료탭 : 제출완료 + 기한 지남

        if (currentTab === TABS.INCOMPLETED) {
          if (activeTags.length > 0) {
            return activeTags.every(tag => {
              if (tag === Status.SUBMITTED)   return item.isSubmitted;
              if (tag === Status.UNSUBMITTED) return !item.isSubmitted;
              if (tag === Status.ONGOING)     return !isExpired;
              if (tag === Status.OVERDUE)     return isExpired;
              return true;
            });
          }
          return !item.isSubmitted && !isExpired; // 진행탭 : 태그 선택 안하는 경우, 미제출 + 기한 남음
        }

        return true; // 전체 탭
      })
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline)); // 마감 기한이 빠른 순으로 배열

  }, [assignment, currentTab, activeTags, now]);
  

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
    <div className="assignment-wrapper">

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
        <div className="tag-container">
          <p>상세 필터:</p>
          {[
            { id: Status.SUBMITTED,   label: '제출' },
            { id: Status.UNSUBMITTED, label: '미제출' },
            { id: Status.ONGOING,     label: '기한 남음' },
            { id: Status.OVERDUE,     label: '기한 지남' }
          ].map(tag => (
            <button
              key={tag.id}
              className={activeTags.includes(tag.id) ? 'on' : ''}
              onClick={() => toggleTag(tag.id)}
            >
              {tag.label}
            </button>
          ))}
        </div>
      )}


    <div className="assignment-container">
      <header> <p className="tab-title">과제 목록({filteredList.length})</p></header>

      <ui className="mainbox">
        {filteredList.length === 0 ? <p>과제가 없습니다.</p> :
          filteredList.map(({ isExpired, deadlineLabel, dday, ...item }) => (

            <div className={`assignment-item ${getItemClass(isExpired, item.isSubmitted)}`} key={item?.id}>
            
              <div className="info">
                <span className="subject">{item?.subject}</span>
                <p className="task-name">{item?.task}</p>
              </div>

              {/**/}
              <div className="status-box">

                <div className={`status-label ${item.isSubmitted ? 'done' : 'yet'}`}>
                  {item.isSubmitted ? '제출 완료' : '미제출'}
                </div>

                <span className={`deadline-text ${isExpired ? 'expired-text' : ''}`}>
                  기한: {deadlineLabel}
                </span>

                <span className="d-day">D-{item?.dday}</span>
              </div>

            </div>

            ))
          }
        </ui>

      </div>
    </div>
  );
}

export default AssignmentTab;