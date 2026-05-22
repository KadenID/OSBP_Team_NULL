import React, {useState, useMemo, useEffect} from 'react';
import { createPortal } from 'react-dom';
import './AssignmentTab.css';
import useAssignmentStore from '../../store/useAssignmentStore';
import AssignmentDetail from './AssignmentDetail';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const date = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${date}`;
};


// 커스텀 과제 마감일 입력 범위 제한
const MIN_DEADLINE_DATE = "2000-01-01";
const MAX_DEADLINE_DATE = "2099-12-31";

// 과목 및 과제 입력 범위 제한
const SUBJECT_MAX_LENGTH = 30;
const TASK_MAX_LENGTH = 50;

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

  if (!deadlineDate || Number.isNaN(deadlineDate.getTime())) {
    return <span className="dday-text">날짜 오류</span>;
  }

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


function AssignmentTab({ accessToken }) {

  // Zustand 스토어에서 상태와 함수 가져오기
  const { 
    assignment, 
    isLoading, 
    fetchAssignments,
    addAssignment,
    deleteAssignment, 
    toggleSubmit,
    updateDescription
  } = useAssignmentStore();

  // 최초 렌더링 시 스토어의 API 호출 함수 실행 (store 내부에서 중복 호출 방지 처리)
  useEffect(() => {
    fetchAssignments(accessToken);
  }, [fetchAssignments, accessToken]);

  
  const [newSubject, setNewSubject] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newDeadlineDate, setNewDeadlineDate] = useState(getTodayDateString);
  const [newDeadlineTime, setNewDeadlineTime] = useState("23:59");
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [formError, setFormError] = useState("");

  const [activeTags, setActiveTags] = useState([
    STATUS.UNSUBMITTED,
    STATUS.ONGOING
  ]);

  const [showModal, setShowModal] = useState(false);
  const [targetId, setTargetId] = useState(null);

  const [selectedId, setSelectedId] = useState(null); // ID만 저장

  
  // 모달 열림 상태 - hover 효과 제거 
  useEffect(() => {
    if (showModal || selectedId) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');

    return () => {
     document.body.classList.remove('modal-open');
    };
  }, [showModal, selectedId]);


  // 과제 추가 로직
  const formatTimeInput = (value) => {
    const onlyNumbers = value.replace(/\D/g, "").slice(0, 4);

    if (onlyNumbers.length <= 2) return onlyNumbers;

    return `${onlyNumbers.slice(0, 2)}:${onlyNumbers.slice(2)}`;
  };

  const handleTimeChange = (e) => {
    setNewDeadlineTime(formatTimeInput(e.target.value));
    if (formError) setFormError("");
  };

  const normalizeTimeInput = (value) => {
    const [hour = "", minute = ""] = value.split(":");
    const hourNumber = Number(hour);
    const minuteNumber = Number(minute);

    if (
      hour.length !== 2 ||
      minute.length !== 2 ||
      Number.isNaN(hourNumber) ||
      Number.isNaN(minuteNumber) ||
      hourNumber < 0 ||
      minuteNumber < 0 ||
      hourNumber > 23 ||
      minuteNumber > 59
    ) {
      return "23:59";
    }

    return `${String(hourNumber).padStart(2, "0")}:${String(minuteNumber).padStart(2, "0")}`;
  };

  const handleTimeBlur = () => {
    setNewDeadlineTime((prev) => normalizeTimeInput(prev));
  };

  const handleAddAssignment = (e) => {
    e.preventDefault();

    const trimmedSubject = newSubject.trim();
    const trimmedTask = newTask.trim();

    if (!trimmedSubject) {
      setFormError("과목명을 입력해주세요.");
      return;
    }

    if (!trimmedTask) {
      setFormError("할 일을 입력해주세요.");
      return;
    }

    if (trimmedSubject.length > SUBJECT_MAX_LENGTH) {
      setFormError(`과목명은 ${SUBJECT_MAX_LENGTH}자 이하로 입력해주세요.`);
      return;
    }

    if (trimmedTask.length > TASK_MAX_LENGTH) {
      setFormError(`할 일은 ${TASK_MAX_LENGTH}자 이하로 입력해주세요.`);
      return;
    }

    const normalizedDeadlineTime = normalizeTimeInput(newDeadlineTime);
    const deadlineValue = `${newDeadlineDate}T${normalizedDeadlineTime}:59`;
    const deadlineDate = new Date(deadlineValue);
    const minDate = new Date(`${MIN_DEADLINE_DATE}T00:00:00`);
    const maxDate = new Date(`${MAX_DEADLINE_DATE}T23:59:59`);

    if (Number.isNaN(deadlineDate.getTime())) {
      setFormError("올바른 마감 날짜를 입력해주세요.");
      return;
    }

    if (deadlineDate < minDate || deadlineDate > maxDate) {
      setFormError("마감 날짜는 2000년 1월 1일부터 2099년 12월 31일까지만 입력할 수 있습니다.");
      return;
    }

    const newItem = {
      subject: trimmedSubject,
      task: trimmedTask,
      deadline: deadlineValue,
      isSubmitted: false,
      source: 'user'
    };

    setFormError("");
    addAssignment(newItem, accessToken); // store의 추가 액션 호출
    setNewSubject("");
    setNewTask("");
    setNewDeadlineDate(getTodayDateString());
    setNewDeadlineTime("23:59");
    setShowTimePicker(false);
  };

  // 과제 필터링 함수 : processed + filteredList
  const processed = useMemo(() => {
    const now = new Date();
    return assignment.map(item => {
      
      const deadlineDate = new Date(item.deadline);
      const isValidDeadline = !Number.isNaN(deadlineDate.getTime());

      return {
        ...item,
        deadlineDate,
        isValidDeadline,
        isExpired: isValidDeadline ? deadlineDate - now <= 0 : false
      };
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
    return [...filteredList].sort((a, b) => {
      if (!a.isValidDeadline && !b.isValidDeadline) return 0;
      if (!a.isValidDeadline) return 1;
      if (!b.isValidDeadline) return -1;
      return a.deadlineDate - b.deadlineDate;
    });
  }, [filteredList]);
  
  const confirmDelete = () => {
    deleteAssignment(targetId, accessToken); // 스토어의 삭제 액션 실행
    setShowModal(false);        // 모달 닫기
    setTargetId(null);          // 타겟 ID 초기화
  };

  // 선택된 과제 데이터를 최신으로 참조
  const selectedAssignment = useMemo(() =>
    assignment.find(item => String(item.id) === String(selectedId)) ?? null,
  [assignment, selectedId]);
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
    <>

      <form className="add-form" onSubmit={handleAddAssignment}> {/* 과제 생성 영역 */}
        <div className="input-group">
          <div className="input-field">
            <input
              type="text"
              placeholder="과목"
              value={newSubject}
              maxLength={SUBJECT_MAX_LENGTH}
              onChange={e => {
                setNewSubject(e.target.value);
                if (formError) setFormError("");
              }}
            />          
          </div>

          <div className="input-field">
            <input
              type="text"
              placeholder="할 일"
              value={newTask}
              maxLength={TASK_MAX_LENGTH}
              onChange={e => {
                setNewTask(e.target.value);
                if (formError) setFormError("");
              }}
            />          
          </div>

          <div className="input-field deadline-field">
            <div className="deadline-control">
              <input
                type="date"
                value={newDeadlineDate}
                min={MIN_DEADLINE_DATE}
                max={MAX_DEADLINE_DATE}
                title="마감 날짜를 선택하거나 YYYY-MM-DD 형식으로 입력하세요."
                aria-label="마감 날짜"
                onMouseDown={() => setShowTimePicker(false)}
                onFocus={() => setShowTimePicker(false)}
                onChange={e => {
                  setNewDeadlineDate(e.target.value);
                  if (formError) setFormError("");
                }}
                required
              />

              <div className="time-picker-wrap">
                <input
                  type="text"
                  className="time-input"
                  value={newDeadlineTime}
                  onChange={handleTimeChange}
                  onBlur={handleTimeBlur}
                  onFocus={() => setShowTimePicker(true)}
                  placeholder="23:59"
                  inputMode="numeric"
                  maxLength="5"
                  required
                />

                <button
                  type="button"
                  className="time-picker-toggle"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowTimePicker(prev => !prev)}
                  aria-label="시간 선택"
                />

                {showTimePicker && (
                  <div
                    className="time-picker-panel"
                    onMouseDown={e => e.preventDefault()}
                  >
                    <div className="time-column">
                      {Array.from({ length: 24 }, (_, hour) => {
                        const value = String(hour).padStart(2, "0");
                        const isSelected = newDeadlineTime.slice(0, 2) === value;

                        return (
                          <button
                            type="button"
                            key={value}
                            className={isSelected ? "selected" : ""}
                            onClick={() => {
                              const minute = newDeadlineTime.slice(3, 5) || "00";
                              setNewDeadlineTime(`${value}:${minute}`);
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>

                    <div className="time-column">
                      {Array.from({ length: 60 }, (_, minute) => {
                        const value = String(minute).padStart(2, "0");
                        const isSelected = newDeadlineTime.slice(3, 5) === value;

                        return (
                          <button
                            type="button"
                            key={value}
                            className={isSelected ? "selected" : ""}
                            onClick={() => {
                              const hour = newDeadlineTime.slice(0, 2) || "23";
                              setNewDeadlineTime(`${hour}:${value}`);
                              setShowTimePicker(false);
                            }}
                          >
                            {value}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      <button type="submit" className="add-submit-btn">새 과제 추가</button>
      {formError && (
        <p className="add-form-error" role="alert">
          {formError}
        </p>
      )}
    </form>

        <div className="tag-container"><p>필터</p> {/* 필터링 태그 */}
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
      {/* 로딩 중일 때와 아닐 때를 구분해서 렌더링 */}
      {isLoading && assignment.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>데이터를 불러오는 중입니다...</div>
      ) : (
      <ul className="mainbox"> {/* 과제 없는 경우 */}
        {sortedList.length === 0 ? <p>과제가 없습니다.</p> :
            sortedList.map(item => (
             <li
                className={`assignment-item ${getItemClass(item.isExpired, item.isSubmitted)}`}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                style={{ cursor: 'pointer' }} 
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

                <span className="deadline-text">
                  기한: {item.isValidDeadline ? item.deadline.replace('T', ' ').slice(0, 16) : '날짜 오류'}
                </span>
                <CountdownText deadlineDate={item.deadlineDate} />

                <div className="item-actions"> {/* 생성과제 - 삭제, 완료 처리 버튼 영역 */}
                    {item.source === 'user' ? (
                      <>
                        <button onClick={(e) => { e.stopPropagation(); toggleSubmit(item.id, accessToken); }} className="action-btn toggle">
                          {item.isSubmitted ? '진행으로 변경' : '완료 처리'}
                        </button>
                        <button onClick={(e) => {e.stopPropagation(); setTargetId(item.id); setShowModal(true); }} className="action-btn delete">삭제</button>
                      </>
                    ) : (
                      <span className="lock-msg">시스템 관리항목</span>
                    )}
                  </div>

                </div>
              </li>
            ))}
      </ul>
    )}
      {showModal && createPortal(
        <div className="modal-overlay">
          <div className="modal">
            <p>과제를 삭제하시겠습니까?</p>
            <div className="modal-buttons">
              <button onClick={confirmDelete}>삭제</button>
              <button onClick={() => setShowModal(false)}>취소</button>
            </div>
          </div>
        </div>,
        document.body
      )}
        
        {selectedAssignment && createPortal(
          <AssignmentDetail
            assignment={selectedAssignment}
            onClose={() => setSelectedId(null)} 
            updateDescription={updateDescription}
            accessToken={accessToken}
          />,
          document.body
        )}
      </div>
    </>
  );
}
export default AssignmentTab;