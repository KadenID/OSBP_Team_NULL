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
    connection_pool = pool.ThreadedConnectionPool(1, 50, DATABASE_URL) 
    logger.info("데이터베이스 커넥션 풀이 생성되었습니다. (Max: 50)")
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
                # 사용자 테이블 - email 컬럼 추가
                cur.execute("""
                    ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
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
                # 사용자 설정(알림 등) 테이블
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS user_settings (
                        student_id VARCHAR(20) PRIMARY KEY REFERENCES users(student_id) ON DELETE CASCADE,
                        settings JSONB DEFAULT '{}'::jsonb,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
                # 브라우저 푸시 구독 정보 테이블
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS push_subscriptions (
                        id SERIAL PRIMARY KEY,
                        student_id VARCHAR(20) REFERENCES users(student_id) ON DELETE CASCADE,
                        subscription_json JSONB NOT NULL,
                        browser_info TEXT,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(student_id, subscription_json)
                    );
                """)
                # 알림 발송 기록 테이블 (중복 방지용)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS sent_notifications (
                        id SERIAL PRIMARY KEY,
                        student_id VARCHAR(20) REFERENCES users(student_id) ON DELETE CASCADE,
                        assignment_identifier TEXT NOT NULL,
                        alert_type TEXT NOT NULL,
                        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(student_id, assignment_identifier, alert_type)
                    );
                """)
                # 사용자용 알림 내역 테이블 (조회용)
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS notification_history (
                        id SERIAL PRIMARY KEY,
                        student_id VARCHAR(20) REFERENCES users(student_id) ON DELETE CASCADE,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL,
                        channel TEXT NOT NULL,
                        sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                """)
            conn.commit()
            logger.info("데이터베이스 테이블 초기화 완료")
        except Exception as e:
            conn.rollback()
            logger.error(f"데이터베이스 초기화 중 오류 발생: {e}")
            raise

# 중복 알림 방지 로직

def is_notification_sent(student_id, assignment_identifier, alert_type):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT 1 FROM sent_notifications WHERE student_id = %s AND assignment_identifier = %s AND alert_type = %s;"
                cur.execute(sql, (student_id, assignment_identifier, alert_type))
                return cur.fetchone() is not None
        except Exception as e:
            logger.error(f"알림 기록 조회 중 오류 발생: {e}")
            return False

def record_notification_sent(student_id, assignment_identifier, alert_type):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO sent_notifications (student_id, assignment_identifier, alert_type)
                VALUES (%s, %s, %s)
                ON CONFLICT (student_id, assignment_identifier, alert_type) DO NOTHING;
                """
                cur.execute(sql, (student_id, assignment_identifier, alert_type))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"알림 기록 저장 중 오류 발생: {e}")
            raise

# 데이터 정리 로직
def cleanup_old_notifications(days=30):
    """지정한 일수(days)보다 오래된 알림 발송 기록을 삭제"""
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                # INTERVAL 문법 수정: 정수형 인자와 곱셈 연산 사용
                sql = "DELETE FROM sent_notifications WHERE sent_at < CURRENT_TIMESTAMP - (INTERVAL '1 day' * %s);"
                cur.execute(sql, (days,))
                deleted_count = cur.rowcount
            conn.commit()
            logger.info(f"오래된 알림 기록 정리 완료: {deleted_count}개 삭제됨 (기준: {days}일)")
            return deleted_count
        except Exception as e:
            conn.rollback()
            logger.error(f"알림 기록 정리 중 오류 발생: {e}")
            return 0

# 모든 사용자 목록 조회 (스케줄러용)

def get_all_student_ids():
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT student_id FROM users;")
                return [row[0] for row in cur.fetchall()]
        except Exception as e:
            logger.error(f"전체 사용자 조회 중 오류 발생: {e}")
            return []

# 사용자 정보 추가 업데이트

def update_user_email(student_id, email):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "UPDATE users SET email = %s WHERE student_id = %s;"
                cur.execute(sql, (email, student_id))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"이메일 업데이트 중 오류 발생: {e}")
            raise

def get_user_email(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT email FROM users WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                result = cur.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error(f"이메일 조회 중 오류 발생: {e}")
            raise

# 푸시 구독 정보 관리

def save_push_subscription(student_id, subscription_json, browser_info=None):
    import json
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO push_subscriptions (student_id, subscription_json, browser_info)
                VALUES (%s, %s, %s)
                ON CONFLICT (student_id, subscription_json) DO NOTHING;
                """
                cur.execute(sql, (student_id, json.dumps(subscription_json), browser_info))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"푸시 구독 정보 저장 중 오류 발생: {e}")
            raise

def get_push_subscriptions(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT subscription_json FROM push_subscriptions WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                rows = cur.fetchall()
                return [row[0] for row in rows]
        except Exception as e:
            logger.error(f"푸시 구독 정보 조회 중 오류 발생: {e}")
            raise

def delete_push_subscription(student_id, subscription_json):
    import json
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM push_subscriptions WHERE student_id = %s AND subscription_json = %s;"
                cur.execute(sql, (student_id, json.dumps(subscription_json)))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"푸시 구독 정보 삭제 중 오류 발생: {e}")
            raise

# 사용자 설정 CRUD

def save_user_settings(student_id, settings):
    import json
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO user_settings (student_id, settings, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT (student_id)
                DO UPDATE SET settings = EXCLUDED.settings, updated_at = CURRENT_TIMESTAMP;
                """
                cur.execute(sql, (student_id, json.dumps(settings)))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"사용자 설정 저장 중 오류 발생 (student_id: {student_id}): {e}")
            raise

def get_user_settings(student_id):
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "SELECT settings FROM user_settings WHERE student_id = %s;"
                cur.execute(sql, (student_id,))
                result = cur.fetchone()
                return result[0] if result else {
                    "emailAlerts": False,
                    "browserAlerts": False,
                    "courseReminders": []
                }
        except Exception as e:
            logger.error(f"사용자 설정 조회 중 오류 발생 (student_id: {student_id}): {e}")
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

# 커스텀 과제 CRUD

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
                        int(assignment_data['id']),
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
                cur.execute(sql, (int(assignment_id), student_id))
            conn.commit()
            return True
        except Exception as e:
            conn.rollback()
            logger.error(f"커스텀 과제 삭제 중 오류 발생 (id: {assignment_id}): {e}")
            raise

# --- 알림 내역 관리 ---

def add_notification_history(student_id, title, message, channel):
    """사용자에게 보여줄 알림 내역을 저장"""
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                INSERT INTO notification_history (student_id, title, message, channel)
                VALUES (%s, %s, %s, %s);
                """
                cur.execute(sql, (student_id, title, message, channel))
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"알림 내역 저장 중 오류 발생: {e}")

def get_notification_history(student_id, limit=50):
    """사용자의 최근 알림 내역을 조회"""
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = """
                SELECT id, title, message, channel, sent_at 
                FROM notification_history 
                WHERE student_id = %s 
                ORDER BY sent_at DESC 
                LIMIT %s;
                """
                cur.execute(sql, (student_id, limit))
                rows = cur.fetchall()
                return [
                    {
                        "id": row[0],
                        "title": row[1],
                        "message": row[2],
                        "channel": row[3],
                        "sent_at": row[4].isoformat()
                    } for row in rows
                ]
        except Exception as e:
            logger.error(f"알림 내역 조회 중 오류 발생: {e}")
            return []

def delete_old_notification_history(days=30):
    """오래된 알림 내역 삭제"""
    with get_db_connection() as conn:
        try:
            with conn.cursor() as cur:
                sql = "DELETE FROM notification_history WHERE sent_at < CURRENT_TIMESTAMP - (INTERVAL '1 day' * %s);"
                cur.execute(sql, (days,))
                count = cur.rowcount
            conn.commit()
            return count
        except Exception as e:
            conn.rollback()
            logger.error(f"오래된 알림 내역 삭제 중 오류 발생: {e}")
            return 0
