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
    """
    사용자 정보를 DB에 저장합니다. 학번은 평문으로, 비밀번호는 AES-256으로 암호화하여 저장합니다.
    UPSERT logic을 사용하여 기존 유저가 있으면 비밀번호를 업데이트합니다.
    """
    # 평문 password를 암호화하여 encrypted_pw에 할당
    encrypted_pw = encrypt(password)
    
    conn = get_connection()
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
        print(f"Error saving user data to Supabase: {e}")
        conn.rollback()
    finally:
        conn.close()

def load_user(student_id):
    """
    저장된 사용자 정보를 DB에서 불러옵니다. 비밀번호는 복호화하여 반환합니다.
    """
    conn = get_connection()
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
        print(f"Error loading user data from Supabase: {e}")
        return None, None
    finally:
        conn.close()

def save_refresh_token(student_id, token_value, expires_at):
    """
    리프레시 토큰을 DB에 저장하거나 업데이트합니다. (RTR 및 화이트리스트 전략)
    """
    conn = get_connection()
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
        print(f"Error saving refresh token to Supabase: {e}")
        conn.rollback()
    finally:
        conn.close()

def get_refresh_token(student_id):
    """
    DB에서 해당 사용자의 리프레시 토큰 정보를 가져옵니다.
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            sql = "SELECT token_value, expires_at FROM refresh_tokens WHERE student_id = %s;"
            cur.execute(sql, (student_id,))
            return cur.fetchone()
    except Exception as e:
        print(f"Error getting refresh token from Supabase: {e}")
        return None
    finally:
        conn.close()