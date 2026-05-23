import os
import json
import logging
import smtplib
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
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@example.com")

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", SMTP_USER)

# 이메일 발송 기능

def send_email_notification(to_email, subject, message_body):
    if not all([SMTP_USER, SMTP_PASSWORD, to_email]):
        logger.warning("SMTP 설정이 누락되어 이메일을 보낼 수 없습니다.")
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

# 브라우저 푸시 발송 기능

def send_push_notification(subscription_info, title, body, url=None):
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        logger.warning("VAPID 키가 설정되지 않아 푸시 알림을 보낼 수 없습니다.")
        return False

    try:
        data = {
            "title": title,
            "body": body,
            "url": url or "/"
        }

        webpush(
            subscription_info=json.loads(subscription_info) if isinstance(subscription_info, str) else subscription_info,
            data=json.dumps(data),
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
        )
        logger.info("브라우저 푸시 발송 성공")
        return True
    except WebPushException as ex:
        # 410 Gone 또는 404 Not Found 에러는 구독이 만료되었거나 삭제되었음을 의미
        if ex.response is not None and ex.response.status_code in [404, 410]:
            logger.info("만료된 푸시 구독 발견")
            return "EXPIRED"
        logger.error(f"푸시 발송 실패: {ex}")
        return False
    except Exception as e:
        logger.error(f"푸시 발송 중 알 수 없는 오류: {e}")
        return False

# 통합 알림 발송

def send_all_notifications(student_id, title, body, url=None):
    import storage
    
    # 이메일 발송
    user_email = storage.get_user_email(student_id)
    settings = storage.get_user_settings(student_id)
    
    # 설정에서 이메일 알림이 켜져 있는지 확인 (기본값 True)
    if user_email and settings.get("isAlarmEnabled", True):
        send_email_notification(user_email, title, body)
    
    # 브라우저 푸시 발송
    if settings.get("isAlarmEnabled", True):
        subscriptions = storage.get_push_subscriptions(student_id)
        for sub_json in subscriptions:
            result = send_push_notification(sub_json, title, body, url)
            if result == "EXPIRED":
                # 만료된 구독 정보 삭제
                try:
                    sub_dict = json.loads(sub_json) if isinstance(sub_json, str) else sub_json
                    storage.delete_push_subscription(student_id, sub_dict)
                    logger.info(f"사용자 {student_id}의 만료된 구독 정보를 삭제했습니다.")
                except Exception as e:
                    logger.error(f"만료 구독 정보 삭제 중 오류: {e}")
