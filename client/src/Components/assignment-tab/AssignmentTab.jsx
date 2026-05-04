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
  const [assignment] = useState([
    { id: 1, subject: "오픈소스기초 프로젝트", task: "9주차 카페 글 작성", deadline: "2026-05-10T23:59:59", isSubmitted: true },
    { id: 2, subject: "컴퓨터 구조", task: "4장 연습 문제 제출", deadline: "2026-05-25T23:59:59", isSubmitted: false },
    { id: 3, subject: "3333", task: "3333", deadline: "2026-04-14T23:59:59", isSubmitted: false },
    { id: 4, subject: "4444", task: "4444", deadline: "2026-04-25T23:59:59", isSubmitted: true }
  ]);

  // 과제 상세 설명 기능 (아직)
  // 과제 생성 기능 : 사용자가 직접 과제 생성, 삭제 가능한 과제 (아직)

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
  

  const processed = useMemo(() => {
    return assignment.map(item => ({
      ...item,
      deadlineDate: new Date(item.deadline)
    }));
  }, [assignment]);


  const filteredList = useMemo(() => {

    return processed
      
      .map(item => {
        const diff = item.deadlineDate - now;
        
        return {
          ...item,
          ddayValue: diff,
          isExpired: diff <= 0, 
          ddayText: calcDday(item.deadline), // Dday 추가
          deadlineLabel: item.deadline.replace('T', ' ').substring(0, 16),
        };
      })
    
      .filter(item => {
        const { isExpired } = item;

        if (currentTab === TABS.COMPLETED) return isExpired && item.isSubmitted; // 완료탭 : 제출완료 + 기한 지남

        if (currentTab === TABS.INCOMPLETED) {
          if (activeTags.length > 0) {
            return activeTags.every(tag => {
              if (tag === STATUS.SUBMITTED)   return item.isSubmitted;
              if (tag === STATUS.UNSUBMITTED) return !item.isSubmitted;
              if (tag === STATUS.ONGOING)     return !isExpired;
              if (tag === STATUS.OVERDUE)     return isExpired;
              return true;
            });
          }
          return !item.isSubmitted && !isExpired; // 진행탭 : 태그 선택 안하는 경우, 미제출 + 기한 남음
        }

        return true; // 전체 탭
      })
      .sort((a, b) => a.ddayValue - b.ddayValue); // 마감 기한이 빠른 순으로 배열

  }, [assignment, currentTab, activeTags, now]);
  

  //상태 변경
  const toggleTag = (tag) => { // 토글
    setActiveTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);

      let nextTags = [...prev];

      if (tag === STATUS.SUBMITTED) { // 제출/미제출 중 하나만 선택 가능
        nextTags = nextTags.filter((t) => t !== STATUS.UNSUBMITTED);
      } else if (tag === STATUS.UNSUBMITTED) {
        nextTags = nextTags.filter((t) => t !== STATUS.SUBMITTED);
      }

      if (tag === STATUS.ONGOING) { // 기한 지남/기한 남음 중 하나만 선택 가능
        nextTags = nextTags.filter((t) => t !== STATUS.OVERDUE);
      } else if (tag === STATUS.OVERDUE) {
        nextTags = nextTags.filter((t) => t !== STATUS.ONGOING);
      }

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
            { id: STATUS.SUBMITTED,   label: '제출' },
            { id: STATUS.UNSUBMITTED, label: '미제출' },
            { id: STATUS.ONGOING,     label: '기한 남음' },
            { id: STATUS.OVERDUE,     label: '기한 지남' }
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

      <ul className="mainbox">
        {filteredList.length === 0 ? <p>과제가 없습니다.</p> :
          filteredList.map(({ isExpired, deadlineLabel, ddayText, ...item }) => (

            <li className={`assignment-item ${getItemClass(isExpired, item.isSubmitted)}`} key={item.id}>
            

              <div className="info">
                <span className="subject">{item?.subject}</span>
                <p className="task-name">{item?.task}</p>
              </div>

             
              <div className="status-box">

                <div className={`status-label ${item.isSubmitted ? 'done' : 'yet'}`}>
                  {item.isSubmitted ? '제출 완료' : '미제출'}
                </div>

                <span className={`deadline-text ${isExpired ? 'expired-text' : ''}`}>
                  기한: {deadlineLabel}
                </span>

                {/* 디데이: 기한 안 지났을 때만 표시, 실시간 갱신 */}
                {ddayText && (
                    <span className="dday-text"> {ddayText}</span>
                  )}

              </div>

            </li>

            ))
          }
        </ul>

      </div>
    </div>
  );
}

export default AssignmentTab;