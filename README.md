# OSBP_Team_NULL - LMS 통합 과제 대시보드 및 알림 서비스

충북대학교 등 묶음 LMS(Coursemos)를 사용하는 학생들을 위한 **과제 통합 대시보드** 및 **개인 맞춤형 알림 서비스**입니다. 여러 과목에 흩어져 있는 과제와 공지사항을 한눈에 확인하고, 설정한 시간에 다가오는 과제를 이메일로 알림 받을 수 있습니다.

## 주요 기능 (Features)

*   **과제 통합 대시보드:** 수강 중인 모든 과목의 과제를 마감일 순으로 정렬하여 한눈에 파악.
*   **공지사항 모아보기:** 각 과목 게시판에 흩어진 공지사항을 하나의 피드에서 확인.
*   **사용자 맞춤형 과제 추가:** LMS에 등록되지 않은 개인 과제나 일정을 직접 추가하여 관리.
*   **개인 맞춤형 알림 서비스:** 특정 과목이나 마감 기한을 지정하여 이메일 알림(리마인더) 수신.

---

## 1. 의존성 (Dependencies)

본 프로젝트는 Frontend(React)와 Backend(FastAPI)로 분리되어 있습니다.

### 필수 환경 (System Requirements)
*   **OS:** Windows 10/11, macOS, Linux
*   **Node.js:** v18.0.0 이상 (Frontend 구동)
*   **Python:** v3.9 이상 (Backend 구동)
*   **Redis:** (선택 사항) 캐싱 및 세션 관리 (Upstash Redis 등의 클라우드 서비스 활용 가능)

### 주요 라이브러리 버전
*   **Frontend (`client/package.json` 참조)**
    *   React (^18.x)
    *   Vite (^5.x)
    *   Axios
    *   Zustand (상태 관리)
*   **Backend (`server/requirements.txt` 참조)**
    *   FastAPI
    *   Uvicorn
    *   BeautifulSoup4 (크롤링)
    *   Requests
    *   Upstash-Redis (캐싱)
    *   APScheduler (알림 스케줄링)

---

## 2. 설치 방법 (Installation)

저장소를 클론한 후, 프론트엔드와 백엔드 디렉토리에서 각각 패키지를 설치해야 합니다.

```bash
# 1. 저장소 클론
git clone https://github.com/KadenID/OSBP_Team_NULL.git
cd OSBP_Team_NULL

# 2. Frontend 설치
cd client
npm install

# 3. Backend 설치
cd ../server
python -m venv .venv
# 가상환경 활성화 (Windows)
.venv\Scripts\activate
# 가상환경 활성화 (Mac/Linux)
# source venv/bin/activate
pip install -r requirements.txt
```

### 환경 변수 설정 (.env)
`client`와 `server` 디렉토리 각각에 `.env` 파일을 생성해야 합니다. 제공된 `.env.example` 파일을 참고하세요.

**`server/.env` 예시:**
```env
# Redis 설정 (Upstash)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# 이메일 알림 설정 (SMTP)
EMAIL_HOST_USER=your_email@gmail.com
EMAIL_HOST_PASSWORD=your_app_password
```

---

## 3. 사용 방법 (Usage)

### 로컬 개발 서버 실행

터미널 두 개를 열어 각각 프론트엔드와 백엔드를 실행합니다.

**Backend (터미널 1):**
```bash
cd server
venv\Scripts\activate
uvicorn assignment_api:app --reload --port 8000
```

**Frontend (터미널 2):**
```bash
cd client
npm run dev
```

서버가 실행되면 웹 브라우저에서 `http://localhost:5173` (Vite 기본 포트)로 접속하여 서비스를 이용할 수 있습니다. LMS 계정으로 로그인하면 자동으로 과제와 공지사항이 동기화됩니다.

### 테스트 (Unit Test)



---

## 4. 라이선스 (License)

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. (또는 프로젝트에 맞는 라이선스 명시)
