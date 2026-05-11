from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
import uvicorn

from lms_login import login_to_lms

app = FastAPI(
    title="LMS Assignment API", 
    description="충북대 LMS 과제 데이터를 프론트엔드에 제공하는 API"
)

# ---------------------------------------------------------
# Pydantic 모델: 프론트엔드 전달용 JSON 스키마 정의
# ---------------------------------------------------------
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
        raise HTTPException(status_code=401, detail=f"인증 실패: {message}")
    
    return APIResponse(success=True, message="API 연결 테스트", total_count=0, data=[])

if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)