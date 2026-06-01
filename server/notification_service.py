import os
import json
import logging
import resend
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pywebpush import webpush, WebPushException
from dotenv import load_dotenv

# 로깅 설정
logger = logging.getLogger(__name__)

env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "").strip().strip("'").strip('"')
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "").strip().strip("'").strip('"')
VAPID_CLAIMS_EMAIL = os.getenv("VAPID_CLAIMS_EMAIL", "admin@example.com")

# Resend 설정
RESEND_API_KEY = os.getenv("RESEND_API_KEY")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "onboarding@resend.dev")

# 설정 검증
if not VAPID_PRIVATE_KEY:
    logger.error("VAPID_PRIVATE_KEY가 설정되지 않았습니다.")

if not RESEND_API_KEY:
    logger.error("RESEND_API_KEY가 설정되지 않았습니다. 이메일 발송이 불가능합니다.")
else:
    resend.api_key = RESEND_API_KEY

if not SMTP_FROM_EMAIL or SMTP_FROM_EMAIL == "onboarding@resend.dev":
    logger.warning("⚠️ SMTP_FROM_EMAIL이 기본값입니다. 도메인 인증 전이라면 테스트 수신자에게만 발송됩니다.")

# VAPID_SUB 형식 강제 교정 (반드시 mailto: 포함)
def get_vapid_sub():
    email = os.getenv("VAPID_CLAIMS_EMAIL", "admin@example.com")
    if email and not email.startswith("mailto:"):
        return f"mailto:{email}"
    return email or "mailto:admin@example.com"

def send_email_notification(to_email, subject, message_body):
    # 실행 시점에 API 키 및 발신 이메일 재확인
    api_key = os.getenv("RESEND_API_KEY")
    from_email = os.getenv("SMTP_FROM_EMAIL", "onboarding@resend.dev")
    
    if not api_key:
        logger.error("RESEND_API_KEY가 설정되지 않았습니다.")
        return False
    
    # 전역 객체 설정 (발송 직전)
    resend.api_key = api_key

    if not to_email:
        return False
        
    try:
        params = {
            "from": f"OSBP Notification <{from_email}>",
            "to": [to_email],
            "subject": subject,
            "text": message_body,
        }
        r = resend.Emails.send(params)
        
        if (isinstance(r, dict) and r.get("id")) or (hasattr(r, "id") and r.id):
            return True
        else:
            logger.error("이메일 발송 실패 (응답 이상)")
            return False
    except Exception as e:
        logger.error(f"이메일 발송 예외 발생")
        return False

def send_push_notification(subscription_info, title, body, url=None):
    # 실행 시점에 VAPID 키 재확인 (모듈 로드 시점 문제 방지)
    priv_key = os.getenv("VAPID_PRIVATE_KEY", "").strip().strip("'").strip('"')
    pub_key = os.getenv("VAPID_PUBLIC_KEY", "").strip().strip("'").strip('"')
    sub = get_vapid_sub()

    if not priv_key or not pub_key:
        logger.error("VAPID 키가 설정되지 않아 푸시를 보낼 수 없습니다.")
        return False
        
    try:
        payload = {
            "title": title,
            "body": body,
            "url": url or "/"
        }
        
        if isinstance(subscription_info, str):
            subscription_dict = json.loads(subscription_info)
        else:
            subscription_dict = subscription_info

        if not subscription_dict.get("endpoint"):
            return False

        # 엔드포인트에서 오리진(aud) 추출
        parsed_endpoint = urllib.parse.urlparse(subscription_dict.get("endpoint"))
        aud = f"{parsed_endpoint.scheme}://{parsed_endpoint.netloc}"

        webpush(
            subscription_info=subscription_dict,
            data=json.dumps(payload),
            vapid_private_key=priv_key,
            vapid_claims={
                "sub": sub,
                "aud": aud
            },
            ttl=43200
        )

        return True
    except WebPushException as ex:
        if ex.response is not None:
            if ex.response.status_code == 403:
                logger.error("VAPID 인증 실패 (403)")
            elif ex.response.status_code in [404, 410]:
                return "EXPIRED"
        return False
    except Exception as e:
        return False

def send_all_notifications(student_id, title, body, url=None, ignore_settings=False, assignment_id=None):
    import storage # 순환 참조 방지를 위해 함수 내 임포트
    
    user_email = storage.get_user_email(student_id)
    settings = storage.get_user_settings(student_id)
    results = {"email": None, "push": []}
    
    # 병렬 처리를 위한 Executor
    with ThreadPoolExecutor(max_workers=10) as executor:
        # future 객체를 키로, (작업유형, 관련데이터)를 값으로 갖는 맵 생성
        future_to_task = {}

        # 이메일 처리 예약
        email_enabled = settings.get("emailAlerts", True) if not ignore_settings else True
        if email_enabled and user_email:
            f = executor.submit(send_email_notification, user_email, title, body)
            future_to_task[f] = ("email", user_email)
        elif email_enabled and not user_email:
            results["email"] = "MISSING_EMAIL"
        
        # 푸시 처리 예약
        push_enabled = settings.get("browserAlerts", True) if not ignore_settings else True
        if push_enabled:
            subscriptions = storage.get_push_subscriptions(student_id)
            if subscriptions:
                # 중복 제거 (endpoint 기준)
                unique_subs = {}
                for sub in subscriptions:
                    try:
                        s_dict = json.loads(sub) if isinstance(sub, str) else sub
                        if not isinstance(s_dict, dict):
                            continue
                            
                        endpoint = s_dict.get("endpoint")
                        if endpoint:
                            unique_subs[endpoint] = s_dict
                    except:
                        continue
                
                for sub_dict in unique_subs.values():
                    f = executor.submit(send_push_notification, sub_dict, title, body, url)
                    future_to_task[f] = ("push", sub_dict)

        # 결과 수집
        email_sent_count = 0
        push_sent_count = 0
        
        for future in as_completed(future_to_task):
            task_type, task_data = future_to_task[future]
            try:
                res = future.result()
                if task_type == "email":
                    results["email"] = res
                    if res is True: email_sent_count += 1
                else:
                    # 만료된 구독 정보 처리
                    if res == "EXPIRED":
                        storage.delete_push_subscription(student_id, task_data)
                        results["push"].append("EXPIRED_REMOVED")
                    else:
                        results["push"].append(res)
                        if res is True: push_sent_count += 1
            except:
                if task_type == "email": results["email"] = False
                else: results["push"].append(False)

        # 통합 이력 저장 (하나라도 성공했다면 기록)
        if email_sent_count > 0 or push_sent_count > 0:
            channels = []
            if email_sent_count > 0: channels.append("이메일")
            if push_sent_count > 0: channels.append("브라우저 푸시")
            storage.add_notification_history(student_id, title, body, ", ".join(channels), assignment_id, url)

    return results
