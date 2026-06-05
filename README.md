# OSBP_Team_NULL - LMS 통합 과제 대시보드 및 알림 서비스

충북대학교 등 Coursemos를 사용하는 학생들을 위한 **과제 통합 대시보드** 및 **개인 맞춤형 알림 서비스**입니다. 여러 과목에 흩어져 있는 과제와 공지사항을 한눈에 확인하고, 설정한 시간에 맞춰 이메일 및 브라우저 푸시 알림을 받을 수 있습니다.

## 주요 기능 (Features)

*   **과제 통합 대시보드:** 수강 중인 모든 과목의 과제를 마감일 순으로 정렬하여 한눈에 파악.
*   **공지사항 & 쪽지 모아보기:** 각 과목 게시판의 공지사항과 LMS 쪽지를 하나의 피드에서 확인.
*   **사용자 맞춤형 과제:** LMS 외 개인 일정이나 과제를 직접 추가하여 통합 관리.
*   **스마트 알림 서비스:** 
    *   **이메일 알림:** Resend API를 통한 고신뢰성 마감 리마인더 발송.
    *   **브라우저 푸시:** PWA 기반 실시간 브라우저 알림 (VAPID).
    *   **알림 이력:** 전송된 알림 기록을 대시보드에서 확인 가능.
*   **보안 및 편의 기능:**
    *   **세션 자동 복구:** LMS 세션 만료 시 백엔드에서 자동으로 재로그인 및 세션 갱신.

---

## 1. 의존성 (Dependencies)

### 필수 환경 (System Requirements)
*   **OS:** Windows 10/11, macOS, Linux
*   **Node.js:** v18.0.0 이상
*   **Python:** v3.9 이상
*   **Redis:** 캐싱, 세션 관리 및 속도 제한(Rate Limit) 적용

### 주요 라이브러리
*   **Frontend (`client/package.json`)**
    *   React (^19.x), Vite (^6.x)
    *   Zustand (상태 관리), Axios (API 통신)
    *   React Icons, React Router DOM
*   **Backend (`server/requirements.txt`)**
    *   FastAPI, Uvicorn
    *   BeautifulSoup4 (크롤링), Requests
    *   Resend (이메일 발송), pywebpush (푸시 알림)
    *   APScheduler (예약 작업), PyJWT (인증)
    *   Upstash-Redis (캐싱 및 데이터 저장)

---

## 2. 설치 및 실행 (Installation & Usage)

### 저장소 클론
```bash
git clone https://github.com/KadenID/OSBP_Team_NULL.git
cd OSBP_Team_NULL
```

### Backend 설정
```bash
cd Project/server
python -m venv .venv
# Windows
.venv\Scripts\activate
# Mac/Linux
# source .venv/bin/activate
pip install -r requirements.txt
uvicorn assignment_api:app --reload --port 8000
```

### Frontend 설정
```bash
cd Project/client
npm install
npm run dev
```

### 환경 변수 설정 (.env)
`server` 디렉토리에 `.env` 파일을 생성하고 다음 항목을 설정해야 합니다.

```env
# Redis 설정
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token

# 알림 설정
RESEND_API_KEY=re_your_api_key
SMTP_FROM_EMAIL=your_verified_domain_or_onboarding_email
VAPID_PUBLIC_KEY=your_public_key
VAPID_PRIVATE_KEY=your_private_key
VAPID_CLAIMS_EMAIL=mailto:your_email@example.com

# 보안 설정
JWT_SECRET_KEY=your_random_secret_key
```

---

## 3. 테스트 및 품질 관리 (Testing)

### 유닛 테스트 및 커버리지 측정

#### 백엔드 (Python / Pytest)
```bash
cd Project_test
# 커버리지 대상 소스를 명시하여 실행
coverage run --source=../Project/server -m pytest
coverage report -m
```

#### 프론트엔드 (React / Vitest)
```bash
cd Project/client
npm run coverage
```

---

## 4. 라이선스 (License)

이 프로젝트는 MIT 라이선스에 따라 배포됩니다.