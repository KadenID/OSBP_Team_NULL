import os
import logging
import psycopg2
from psycopg2 import pool
from dotenv import load_dotenv
from crypto import encrypt, decrypt
from contextlib import contextmanager

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# .env 파일 로드
load_dotenv()

# 환경 변수에서 DB 연결 정보 로드
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    logger.error("DATABASE_URL이 설정되지 않았습니다.")
    raise ValueError("DATABASE_URL이 설정되지 않았습니다.")

# 전역 커넥션 풀 초기화 (최소 1개, 최대 10개 커넥션 유지)
try:
    connection_pool = pool.ThreadedConnectionPool(1, 10, DATABASE_URL)
    logger.info("데이터베이스 커넥션 풀이 생성되었습니다.")
except Exception as e:
    logger.error(f"커넥션 풀 생성 실패: {e}")
    raise

@contextmanager
def get_db_connection():
    """
    풀에서 커넥션을 하나 가져오고 사용 후 반납하는 컨텍스트 매니저입니다.
    """
    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)

def save_user(student_id, password):
    """
    사용자 정보를 DB에 저장합니다. 학번은 평문으로, 비밀번호는 AES-256으로 암호화하여 저장합니다.
    """
    encrypted_pw = encrypt(password)
    
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO users (student_id, lms_password)
                VALUES (%s, %s)
                ON CONFLICT (student_id)
                DO UPDATE SET lms_password = EXCLUDED.lms_password;
                """
                cur.execute(sql, (student_id, encrypted_pw))
            conn.commit()
        except Exception as e:
            logger.error(f"사용자 정보 저장 중 오류 발생 (student_id: {student_id}): {e}")
            conn.rollback()

def load_user(student_id):
    """
    저장된 사용자 정보를 DB에서 불러옵니다. 비밀번호는 복호화하여 반환합니다.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT lms_password FROM users WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                result = cur.fetchone()
                
                if result:
                    encrypted_pw = result[0]
                    password = decrypt(encrypted_pw)
                    return student_id, password
                else:
                    return None, None
        except Exception as e:
            logger.error(f"사용자 정보 로드 중 오류 발생 (student_id: {student_id}): {e}")
            return None, None

def save_refresh_token(student_id, token_value, expires_at):
    """
    리프레시 토큰을 DB에 저장하거나 업데이트합니다.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO refresh_tokens (student_id, token_value, expires_at)
                VALUES (%s, %s, %s)
                ON CONFLICT (student_id)
                DO UPDATE SET token_value = EXCLUDED.token_value, expires_at = EXCLUDED.expires_at;
                """
                cur.execute(sql, (student_id, token_value, expires_at))
            conn.commit()
        except Exception as e:
            logger.error(f"리프레시 토큰 저장 중 오류 발생 (student_id: {student_id}): {e}")
            conn.rollback()

def get_refresh_token(student_id):
    """
    DB에서 해당 사용자의 리프레시 토큰 정보를 가져옵니다.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT token_value, expires_at FROM refresh_tokens WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                return cur.fetchone()
        except Exception as e:
            logger.error(f"리프레시 토큰 조회 중 오류 발생 (student_id: {student_id}): {e}")
            return None

def delete_refresh_token(student_id):
    """
    로그아웃 시 DB에서 리프레시 토큰을 삭제합니다.
    """
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM refresh_tokens WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
            conn.commit()
        except Exception as e:
            logger.error(f"리프레시 토큰 삭제 중 오류 발생 (student_id: {student_id}): {e}")
            conn.rollback()