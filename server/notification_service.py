import os
import json
import logging
import smtplib
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.mime.text import MIMEText
from email.header import Header
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

# 로깅 설정
logger = logging.getLogger(__name__)

# 환경 변수 로드
load_dotenv()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY")
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY")
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "admin@example.com")

# 설정 검증 로그
if not VAPID_PRIVATE_KEY:
    logger.error("❌ VAPID_PRIVATE_KEY가 설정되지 않았습니다.")
else:
    logger.info(f"✅ VAPID_PRIVATE_KEY 로드 완료 (길이: {len(VAPID_PRIVATE_KEY)})")

if not VAPID_PUBLIC_KEY:
    logger.error("❌ VAPID_PUBLIC_KEY가 설정되지 않았습니다.")
else:
    logger.info(f"✅ VAPID_PUBLIC_KEY 로드 완료 (길이: {len(VAPID_PUBLIC_KEY)})")

# VAPID_SUB 형식 강제 교정 (반드시 mailto: 포함)
if VAPID_CLAIMS_EMAIL and not VAPID_CLAIMS_EMAIL.startswith("mailto:"):
    VAPID_SUB = f"mailto:{VAPID_CLAIMS_EMAIL}"
else:
    VAPID_SUB = VAPID_CLAIMS_EMAIL or "mailto:admin@example.com"

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

def send_email_notification(to_email, subject, message_body):
    if not all([SMTP_USER, SMTP_PASSWORD, to_email]):
        logger.warning("SMTP 설정 누락")
        return False
    try:
        msg = MIMEText(message_body, 'plain', 'utf-8')
        msg['Subject'] = Header(subject, 'utf-8')
        msg['From'] = SMTP_FROM_EMAIL
        msg['To'] = to_email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_FROM_EMAIL, [to_email], msg.as_string())
        logger.info(f"이메일 발송 성공: {to_email}")
        return True
    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")
        return False

def send_push_notification(subscription_info, title, body, url=None):
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.error("VAPID 키 설정 누락")
        return False
    try:
        payload = {
            "title": title,
            "body": body,
            "url": url or "/"
        }
        
        # subscription_info가 문자열이면 dict로 변환, 이미 dict면 그대로 사용
        if isinstance(subscription_info, str):
            subscription_dict = json.loads(subscription_info)
        else:
            subscription_dict = subscription_info

        # 필수 필드 확인
        if not subscription_dict.get("endpoint"):
            logger.error("구독 정보에 endpoint가 없습니다.")
            return False

        webpush(
            subscription_info=subscription_dict,
            data=json.dumps(payload),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_SUB},
            ttl=43200
        )

        logger.info(f"푸시 발송 성공: {title}")
        return True
    except WebPushException as ex:
        if ex.response is not None:
            if ex.response.status_code in [404, 410]:
                return "EXPIRED"
            logger.error(f"푸시 서비스 응답 에러 ({ex.response.status_code}): {ex.response.text}")
        else:
            logger.error(f"푸시 네트워크 에러: {ex}")
        return False
    except Exception as e:
        logger.error(f"푸시 내부 오류: {e}")
        return False

def send_all_notifications(student_id, title, body, url=None, ignore_settings=False):
    import storage # 순환 참조 방지를 위해 함수 내 임포트
    
    user_email = storage.get_user_email(student_id)
    settings = storage.get_user_settings(student_id)
    results = {"email": None, "push": []}
    
    # 이메일 처리
    email_enabled = settings.get("emailAlerts", True) if not ignore_settings else True
    if email_enabled:
        results["email"] = send_email_notification(user_email, title, body) if user_email else "MISSING_EMAIL"
    
    # 푸시 처리 (병렬)
    push_enabled = settings.get("browserAlerts", True) if not ignore_settings else True
    if push_enabled:
        subscriptions = storage.get_push_subscriptions(student_id)
        if not subscriptions:
            logger.warning(f"사용자 {student_id}의 구독 정보가 없습니다.")
            results["push"].append("MISSING_SUBSCRIPTION")
        else:
            # 중복 제거
            unique_subs = {}
            for sub in subscriptions:
                try:
                    s_dict = json.loads(sub) if isinstance(sub, str) else sub
                    endpoint = s_dict.get("endpoint")
                    if endpoint:
                        unique_subs[endpoint] = s_dict
                except:
                    continue
            
            final_subs = list(unique_subs.values())
            logger.info(f"사용자 {student_id}에게 푸시 발송 시도 (구독 수: {len(final_subs)})")
            
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {executor.submit(send_push_notification, sub, title, body, url): sub for sub in final_subs}
                for future in as_completed(futures):
                    res = future.result()
                    if res == "EXPIRED":
                        storage.delete_push_subscription(student_id, futures[future])
                    results["push"].append(res)
    return results
