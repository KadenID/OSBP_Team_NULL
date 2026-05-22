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
if os.path.exists("/etc/secrets/.env"):
    load_dotenv("/etc/secrets/.env")
else:
    load_dotenv()

# 환경 변수 로드
DATABASE_URL = os.getenv("DATABASE_URL") # DB 연결 URL

if not DATABASE_URL:
    logger.error("DATABASE_URL이 설정되지 않았습니다.")
    raise ValueError("DATABASE_URL이 설정되지 않았습니다.")

# 전역 커넥션 풀
try:
    connection_pool = pool.ThreadedConnectionPool(1, 10, DATABASE_URL) # DB 커넥션 풀
    logger.info("데이터베이스 커넥션 풀이 생성되었습니다.")
except Exception as e:
    logger.error(f"커넥션 풀 생성 실패: {e}")
    raise

# 입력: 없음
# 기능: 커넥션 풀에서 DB 연결 객체를 획득하여 제공
# 반환: DB 커넥션 객체 (ContextManager)
@contextmanager
def get_db_connection():
    conn = connection_pool.getconn()
    try:
        yield conn
    finally:
        connection_pool.putconn(conn)

# 초기 테이블 생성 로직
def init_db():
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # 사용자 테이블
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        student_id VARCHAR(20) PRIMARY KEY,
                        lms_password TEXT NOT NULL,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                # 리프레시 토큰 테이블
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS refresh_tokens (
                        student_id VARCHAR(20) PRIMARY KEY REFERENCES users(student_id) ON DELETE CASCADE,
                        token_value TEXT NOT NULL,
                        expires_at TIMESTAMP WITH TIME ZONE NOT NULL
                    );
                """)
                # 커스텀 과제 테이블
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS custom_assignments (
                        id SERIAL PRIMARY KEY,
                        student_id VARCHAR(20) REFERENCES users(student_id) ON DELETE CASCADE,
                        course_name VARCHAR(100),
                        assignment_name VARCHAR(200),
                        due_date VARCHAR(50),
                        is_submitted BOOLEAN DEFAULT FALSE,
                        description TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
            conn.commit()
            logger.info("데이터베이스 테이블 초기화 완료")
        except Exception as e:
            conn.rollback()
            logger.error(f"데이터베이스 초기화 중 오류 발생: {e}")
            raise

# 모듈 로드 시 DB 초기화 실행
init_db()

# 입력: student_id (학번), password (비밀번호)
# 기능: 사용자 학번과 암호화된 비밀번호를 데이터베이스에 저장
# 반환: 없음
def save_user(student_id, password):
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
            conn.rollback()
            logger.error(f"사용자 정보 저장 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번)
# 기능: 데이터베이스에서 학번으로 사용자 정보를 조회하고 비밀번호를 복호화하여 반환
# 반환: (학번, 복호화된 비밀번호) 튜플
def load_user(student_id):
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
            raise

# 입력: student_id (학번), token_value (토큰), expires_at (만료 시간)
# 기능: 리프레시 토큰 정보를 데이터베이스에 저장하거나 업데이트
# 반환: 없음
def save_refresh_token(student_id, token_value, expires_at):
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
            conn.rollback()
            logger.error(f"리프레시 토큰 저장 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번)
# 기능: 데이터베이스에서 학번으로 저장된 리프레시 토큰 정보를 조회
# 반환: (토큰, 만료시간) 튜플
def get_refresh_token(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT token_value, expires_at FROM refresh_tokens WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                return cur.fetchone()
        except Exception as e:
            logger.error(f"리프레시 토큰 조회 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번)
# 기능: 데이터베이스에서 해당 학번의 리프레시 토큰 정보를 영구 삭제
# 반환: 없음
def delete_refresh_token(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM refresh_tokens WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"리프레시 토큰 삭제 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# --- 커스텀 과제 CRUD ---

# 입력: student_id (학번), assignment_data (딕셔너리)
# 기능: 커스텀 과제를 DB에 저장하거나 수정
# 반환: 저장된 과제의 ID
def save_custom_assignment(student_id, assignment_data):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                if assignment_data.get('id') and str(assignment_data['id']).isdigit():
                    # 수정
                    sql = """
                    UPDATE custom_assignments 
                    SET course_name = %s, assignment_name = %s, due_date = %s, is_submitted = %s, description = %s
                    WHERE id = %s AND student_id = %s
                    RETURNING id;
                    """
                    cur.execute(sql, (
                        assignment_data['subject'],
                        assignment_data['task'],
                        assignment_data['deadline'],
                        assignment_data.get('isSubmitted', False),
                        assignment_data.get('description', ''),
                        assignment_data['id'],
                        student_id
                    ))
                else:
                    # 신규 추가
                    sql = """
                    INSERT INTO custom_assignments (student_id, course_name, assignment_name, due_date, is_submitted, description)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id;
                    """
                    cur.execute(sql, (
                        student_id,
                        assignment_data['subject'],
                        assignment_data['task'],
                        assignment_data['deadline'],
                        assignment_data.get('isSubmitted', False),
                        assignment_data.get('description', '')
                    ))
                
                result = cur.fetchone()
                conn.commit()
                return result[0] if result else None
        except Exception as e:
            conn.rollback()
            logger.error(f"커스텀 과제 저장 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번)
# 기능: 해당 사용자의 모든 커스텀 과제 조회
# 반환: 과제 리스트
def get_custom_assignments(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT id, course_name, assignment_name, due_date, is_submitted, description FROM custom_assignments WHERE student_id = %s ORDER BY created_at DESC;"
                cur.execute(sql, (student_id,))
                rows = cur.fetchall()
                
                assignments = []
                for row in rows:
                    assignments.append({
                        "id": str(row[0]),
                        "subject": row[1],
                        "task": row[2],
                        "deadline": row[3],
                        "isSubmitted": row[4],
                        "description": row[5],
                        "source": "user"
                    })
                return assignments
        except Exception as e:
            logger.error(f"커스텀 과제 조회 중 오류 발생 (student_id: {student_id}): {e}")
            raise

# 입력: student_id (학번), assignment_id (과제 ID)
# 기능: 특정 커스텀 과제 삭제
# 반환: 성공 여부
def delete_custom_assignment(student_id, assignment_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM custom_assignments WHERE id = %s AND student_id = %s;"
                cur.execute(sql, (assignment_id, student_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"커스텀 과제 삭제 중 오류 발생 (id: {assignment_id}): {e}")
            raise
