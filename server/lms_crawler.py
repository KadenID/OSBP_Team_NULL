import requests
from bs4 import BeautifulSoup
from lms_login import login_to_lms

if __name__ == "__main__":
    session, message = login_to_lms()
    
    if session:
        print("LMS 로그인 성공")
    else:
        print(f"로그인 실패: {message}")