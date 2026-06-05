export const mainPageMockData = {
  // 로그인 사용자 기본 정보
  user: {
    name: "사용자A",
    department: "학과A",
    studentId: "202600001",
    accessToken: "mock-access-token-string-123"
  },

  // 과제 탭 및 대시보드 위젯용 통합 데이터
  assignments: [
    {
      id: "lms-1",
      subject: "과목A",
      task: "과제 1 제출 안내",
      deadline: "2026-06-10T23:59:59",
      isSubmitted: false,
      source: "lms"
    },
    {
      id: "lms-2",
      subject: "과목B",
      task: "실습 과제 2 풀이 및 제출",
      deadline: "2026-06-05T18:00:00",
      isSubmitted: true,
      source: "lms"
    },
    {
      id: "custom-101",
      subject: "개인 일정",
      task: "프로젝트 기능 명세서 작성 및 수정",
      deadline: "2026-06-03T20:00:00",
      isSubmitted: false,
      source: "user",
      description: "팀원들과 코드 컨벤션 맞추고 커밋하기"
    },
    {
      id: "custom-102",
      subject: "스터디 준비",
      task: "스터디 발표 자료 초안 작성",
      deadline: "2026-06-15T12:00:00",
      isSubmitted: false,
      source: "user",
      description: "핵심 개념 정의 및 예제 코드 정리 필수"
    }
  ],

  // 공지사항 및 알림 위젯용 데이터
  notices: [
    {
      board_id: "board-1",
      notice_id: "notice-101",
      course_id: "course-101",
      course_name: "과목A",
      title: "[공지] 중간고사 성적 확인 및 이의신청 기간 안내",
      date: "2026-06-01",
      writer: "담당교수A",
      description_html: "<p>성적 이의 신청은 지정된 기한까지 이메일로만 접수 가능합니다.</p>",
      url: "https://lms.example.ac.kr/mod/ubboard/article.php?id=101"
    },
    {
      board_id: "board-2",
      notice_id: "notice-102",
      course_id: "course-102",
      course_name: "과목B",
      title: "보강 수업 관련 강의실 변경 안내 (종합강의동 101호)",
      date: "2026-05-30",
      writer: "담당강사B",
      description_html: "",
      url: "https://lms.example.ac.kr/mod/ubboard/article.php?id=102"
    }
  ],

  // 받은 쪽지함 위젯용 데이터
  messages: [
    {
      message_id: "msg-201",
      sender: "담당교수A",
      content: "제출하신 포스터 수정본 확인했으니 LMS 피드백 확인 후 반영 바랍니다.",
      date: "2026-06-02 14:25",
      url: "https://lms.example.ac.kr/message/index.php?id=201"
    },
    {
      message_id: "msg-202",
      sender: "조교",
      content: "[안내] 학기 말 만족도 설문조사 미참여자는 오늘 중으로 완료 부탁드립니다.",
      date: "2026-05-29 09:00",
      url: null
    }
  ]
};