from fastapi import FastAPI
from pydantic import BaseModel
import uvicorn

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

if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)