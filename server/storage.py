import os
import psycopg2
from dotenv import load_dotenv
from crypto import encrypt, decrypt

# .env 파일 로드
load_dotenv()

# 환경 변수에서 DB 연결 정보 로드
DATABASE_URL = os.getenv("DATABASE_URL")

def get_connection():
    """
    Supabase (PostgreSQL) 연결을 생성하여 반환합니다.
    """
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL이 설정되지 않았습니다.")
    return psycopg2.connect(DATABASE_URL)

def save_user(student_id, password):
    pass

def load_user(student_id):
    pass