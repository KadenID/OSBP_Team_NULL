from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware  # CORS 미들웨어 추가
from pydantic import BaseModel
from typing import List, Optional
import uvicorn

from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments

app = FastAPI(
    title="LMS Assignment API", 
    description="충북대 LMS 과제 데이터를 프론트엔드에 제공하는 API"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # 실제 서비스 시에는 ["http://localhost:5173"] 처럼 프론트 주소만 허용
    allow_credentials=True,
    allow_methods=["*"],    # GET, POST 등 모든 메서드 허용
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Pydantic 모델: 프론트엔드 전달용 JSON 스키마 정의
# ---------------------------------------------------------
class LoginRequest(BaseModel):
    student_id: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    access_token: Optional[str] = None
    
class AssignmentItem(BaseModel):
    course_id: str
    course_name: str
    assignment_id: str
    assignment_name: str
    due_date: str
    status: str
    url: str

class APIResponse(BaseModel):
    success: bool
    message: str
    total_count: int
    data: List[AssignmentItem] = []

@app.get("/api/assignments", response_model=APIResponse)
def get_lms_assignments():
    """
    내부 로그인 모듈과 크롤링 모듈을 연동하여 
    과제 데이터를 JSON 형태로 반환하는 엔드포인트
    """
    session, message = login_to_lms()
    if not session:
        # 로그인 실패 (또는 .env 미설정, 네트워크 오류 등) 시 401 에러 반환
        raise HTTPException(status_code=401, detail=f"인증 실패: {message}")
    
    try:
        # 크롤링 모듈 연동 (마감일 기준 오름차순 정렬된 데이터 반환)
        assignments = crawl_all_assignments(session)
    
        # 프론트엔드 전달용 최종 JSON Response 생성
        return APIResponse(
            success=True,
            message="과제 데이터 로딩 성공.",
            total_count=len(assignments),
            data=assignments
        )
    
    except Exception as e:
        # 크롤링 중 예기치 못한 에러 발생 시 500 에러 반환
        raise HTTPException(status_code=500, detail=f"서버 내부 오류 발생: {str(e)}")

# ---------------------------------------------------------
# 로컬 테스트 코드
# ---------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)