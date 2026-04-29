충북대학교 LMS에서 과제 데이터를 자동으로 수집하기 위한 백엔드 모듈입니다. </br>

-Python 3.10 이상의 버전이 설치되어 있어야 합니다. </br>
-충북대학교 LMS 계정(학번/비밀번호)이 필요합니다. </br>

아래 순서대로 명령어를 입력하여 개발 환경을 세팅하세요. 가상 환경 사용을 권장합니다.

Windows
```
bash
python -m venv .venv
.venv\Scripts\activate
```
Mac/Linux
```
python3 -m venv .venv
source .venv/bin/activate
```

</br>

필수 패키지 설치
```
pip install -r requirements.txt
```

</br>

환경 변수 설정 (.env)
```
server 폴더 내의 .env.example 파일을 복사하여 .env 파일을 생성한 뒤 .env 파일을 열어 본인의 정보를 입력하세요.
```
