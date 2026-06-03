import pytest
import os
import json
import importlib
from unittest.mock import patch, MagicMock
from pywebpush import WebPushException

import notification_service

# ─── 1. 유틸리티 및 환경 변수 테스트 ──────────────────────────────────────

def test_get_vapid_sub(monkeypatch):
    # 이메일이 설정되어 있고 mailto:가 없는 경우
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "test@test.com")
    assert notification_service.get_vapid_sub() == "mailto:test@test.com"
    
    # 이메일에 이미 mailto:가 있는 경우
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "mailto:already@test.com")
    assert notification_service.get_vapid_sub() == "mailto:already@test.com"
    
    # 이메일이 비어있는 경우 기본값
    monkeypatch.setenv("VAPID_CLAIMS_EMAIL", "")
    assert notification_service.get_vapid_sub() == "mailto:admin@example.com"

# ─── 2. 이메일 발송 테스트 ─────────────────────────────────────────────

@patch("notification_service.resend.Emails.send")
def test_send_email_success(mock_send, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "test@test.com")
    
    # dict 형태의 성공 응답 모킹
    mock_send.return_value = {"id": "email_123"}
    
    result = notification_service.send_email_notification("to@test.com", "Title", "Body")
    
    assert result is True
    mock_send.assert_called_once()
    args = mock_send.call_args[0][0]
    assert args["to"] == ["to@test.com"]
    assert "OSBP Notification" in args["from"]

@patch("notification_service.resend.Emails.send")
def test_send_email_failure_and_exceptions(mock_send, monkeypatch):
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    
    # 1. API 키 없음
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    assert notification_service.send_email_notification("to@test.com", "T", "B") is False
    monkeypatch.setenv("RESEND_API_KEY", "test_key")
    
    # 2. 수신자 이메일 없음
    assert notification_service.send_email_notification(None, "T", "B") is False
    assert notification_service.send_email_notification("", "T", "B") is False
    
    # 3. 응답에 id가 없는 경우 (실패 처리)
    mock_send.return_value = {"error": "bad request"}
    assert notification_service.send_email_notification("to@test.com", "T", "B") is False
    
    # 4. 예외 발생
    mock_send.side_effect = Exception("API Timeout")
    assert notification_service.send_email_notification("to@test.com", "T", "B") is False

# ─── 3. 푸시 알림 발송 테스트 ───────────────────────────────────────────

@patch("notification_service.webpush")
def test_send_push_success(mock_webpush, monkeypatch):
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    
    sub_info = {"endpoint": "https://push.example.com/sub/123", "keys": {}}
    result = notification_service.send_push_notification(sub_info, "Title", "Body", "/url")
    
    assert result is True
    mock_webpush.assert_called_once()
    kwargs = mock_webpush.call_args[1]
    assert kwargs["vapid_claims"]["aud"] == "https://push.example.com"
    
    # 문자열로 된 subscription_info 지원 확인
    assert notification_service.send_push_notification(json.dumps(sub_info), "T", "B") is True

@patch("notification_service.webpush")
def test_send_push_failures(mock_webpush, monkeypatch):
    # 1. VAPID 키 없음
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "")
    sub_info = {"endpoint": "https://push.com"}
    assert notification_service.send_push_notification(sub_info, "T", "B") is False
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "priv")
    monkeypatch.setenv("VAPID_PUBLIC_KEY", "pub")
    
    # 2. endpoint가 없는 구독 정보
    assert notification_service.send_push_notification({"keys": {}}, "T", "B") is False
    
    # 3. WebPushException: 403 (인증 실패)
    mock_resp = MagicMock(status_code=403)
    mock_webpush.side_effect = WebPushException("Forbidden", response=mock_resp)
    assert notification_service.send_push_notification(sub_info, "T", "B") is False
    
    # 4. WebPushException: 404/410 (구독 만료)
    mock_resp.status_code = 410
    mock_webpush.side_effect = WebPushException("Gone", response=mock_resp)
    assert notification_service.send_push_notification(sub_info, "T", "B") == "EXPIRED"
    
    # 5. 일반 예외
    mock_webpush.side_effect = Exception("Unknown")
    assert notification_service.send_push_notification(sub_info, "T", "B") is False

# ─── 4. 통합 발송(send_all_notifications) 테스트 ────────────────────────

@patch("notification_service.send_email_notification")
@patch("notification_service.send_push_notification")
@patch("storage.get_user_email")
@patch("storage.get_user_settings")
@patch("storage.get_push_subscriptions")
@patch("storage.add_notification_history")
@patch("storage.delete_push_subscription")
def test_send_all_notifications_success(mock_del_sub, mock_add_hist, mock_get_subs, mock_get_set, mock_get_email, mock_push, mock_email):
    # 목 세팅
    mock_get_email.return_value = "user@test.com"
    mock_get_set.return_value = {"emailAlerts": True, "browserAlerts": True}
    
    valid_sub = {"endpoint": "url1"}
    # 문자열로 저장된 구독 정보와 딕셔너리 정보가 섞여있을 때를 테스트
    mock_get_subs.return_value = [json.dumps(valid_sub), {"endpoint": "url2"}]
    
    mock_email.return_value = True
    mock_push.return_value = True # 둘 다 성공
    
    results = notification_service.send_all_notifications("20240001", "Title", "Body")
    
    # 검증
    assert results["email"] is True
    assert len(results["push"]) == 2
    assert all(r is True for r in results["push"])
    
    # 히스토리에 두 채널 모두 기록되었는지 확인
    mock_add_hist.assert_called_once()
    args = mock_add_hist.call_args[0]
    assert "이메일" in args[3] and "브라우저 푸시" in args[3]

@patch("notification_service.send_email_notification")
@patch("notification_service.send_push_notification")
@patch("storage.get_user_email")
@patch("storage.get_user_settings")
@patch("storage.get_push_subscriptions")
@patch("storage.add_notification_history")
@patch("storage.delete_push_subscription")
def test_send_all_notifications_expired_and_missing(mock_del_sub, mock_add_hist, mock_get_subs, mock_get_set, mock_get_email, mock_push, mock_email):
    # 이메일 주소 없음 상황
    mock_get_email.return_value = None
    mock_get_set.return_value = {"emailAlerts": True, "browserAlerts": True}
    
    # 푸시 구독이 1개 있고, 만료(410) 상태 반환
    expired_sub = {"endpoint": "url_expired"}
    mock_get_subs.return_value = [expired_sub]
    mock_push.return_value = "EXPIRED"
    
    results = notification_service.send_all_notifications("20240001", "Title", "Body")
    
    # 이메일 검증
    assert results["email"] == "MISSING_EMAIL"
    mock_email.assert_not_called()
    
    # 푸시 검증 (만료 시 삭제 로직 호출)
    assert "EXPIRED_REMOVED" in results["push"]
    mock_del_sub.assert_called_once_with("20240001", expired_sub)
    
    # 모두 실패했으므로 히스토리에 기록되지 않아야 함
    mock_add_hist.assert_not_called()

@patch("storage.get_user_settings")
def test_send_all_notifications_ignore_settings(mock_get_set):
    """설정을 무시하고 강제 발송(테스트 발송)하는 기능을 테스트."""
    # 사용자가 알림을 모두 꺼둔 상태
    mock_get_set.return_value = {"emailAlerts": False, "browserAlerts": False}
    
    with patch("notification_service.send_email_notification") as mock_email:
        with patch("notification_service.send_push_notification") as mock_push:
            with patch("storage.get_user_email", return_value="a@a.com"):
                with patch("storage.get_push_subscriptions", return_value=[{"endpoint":"u"}]):
                    with patch("storage.add_notification_history"):
                        
                        mock_email.return_value = True
                        mock_push.return_value = True
                        
                        # ignore_settings=True 설정 시
                        res = notification_service.send_all_notifications("1", "T", "B", ignore_settings=True)
                        
                        assert res["email"] is True
                        assert res["push"] == [True]
                        mock_email.assert_called_once()
                        mock_push.assert_called_once()

# ─── 5. 모듈 로드/예외 분기 ─────────────────────────────────────────────

def test_module_reload_missing_envs(monkeypatch):
    """필수 환경변수가 없을 때 로깅 에러가 나면서 모듈이 잘 동작하는지(크래시 방지) 확인."""
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    
    # 모듈을 리로드해도 코드가 죽지 않아야 함
    importlib.reload(notification_service)
    
    # 기본 발신자 주소 경고문 커버리지
    monkeypatch.setenv("SMTP_FROM_EMAIL", "onboarding@resend.dev")
    monkeypatch.setenv("RESEND_API_KEY", "test")
    importlib.reload(notification_service)

# 마지막에 모듈 정상 복구
@pytest.fixture(scope="module", autouse=True)
def restore_module():
    yield
    importlib.reload(notification_service)
