import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";
import { API_BASE_URL } from "../../apiConfig";
import { useTheme } from '../../context/ThemeContext.jsx';
const REMEMBERED_STUDENT_ID_KEY = "rememberedStudentId";
const MAX_LOGIN_INPUT_LENGTH = 20;

// 로그인 폼에서 렌더링할 입력 필드 목록
const loginFields = [
    {
        id: "student_id",
        name: "student_id",
        label: "아이디",
        type: "text",
        placeholder: "아이디를 입력하세요",
        autoComplete: "username",
        maxLength: MAX_LOGIN_INPUT_LENGTH,
    },
    {
        id: "password",
        name: "password",
        label: "비밀번호",
        type: "password",
        placeholder: "비밀번호를 입력하세요",
        autoComplete: "current-password",
        maxLength: MAX_LOGIN_INPUT_LENGTH,
    },
];

function LoginPage({ onLogin }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useTheme();

    // 저장된 아이디가 있으면 로그인 폼 초기값으로 사용
    const [loginForm, setLoginForm] = useState(() => ({
        student_id: localStorage.getItem(REMEMBERED_STUDENT_ID_KEY) || "",
        password: "",
    }));

    const [rememberId, setRememberId] = useState(() =>
        Boolean(localStorage.getItem(REMEMBERED_STUDENT_ID_KEY))
    );
    
    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    // 입력값 변경 시 로그인 폼 상태를 갱신
    const handleChange = (e) => {
        const { name, value } = e.target;

        setLoginForm((prevForm) => ({
            ...prevForm,
            [name]: value,
        }));

        if (errorMessage) {
            setErrorMessage("");
        }
    };

    // 로그인 실패 시 비밀번호 입력값만 초기화
    const clearPassword = () => {
        setLoginForm((prevForm) => ({
            ...prevForm,
            password: "",
        }));
    };

    // 서버 응답이 JSON이 아닐 경우를 대비해 안전하게 파싱
    const parseLoginResponse = async (response) => {
        try {
            return await response.json();
        } catch {
            return null;
        }
    };

    // 백엔드 로그인 API 호출 후 성공 시 메인 페이지로 이동
    const handleLogin = async (e) => {
        e.preventDefault();

        if (isLoading) return;

        const student_id = loginForm.student_id.trim();
        const password = loginForm.password;

        if (!student_id || !password) {
            setErrorMessage("아이디와 비밀번호를 입력해주세요.");
            return;
        }

        if (
            student_id.length > MAX_LOGIN_INPUT_LENGTH ||
            password.length > MAX_LOGIN_INPUT_LENGTH
        ) {
            setErrorMessage("아이디와 비밀번호는 20자 이하로 입력해주세요.");
            clearPassword();
            return;
        }

        try {
            setIsLoading(true);
            setErrorMessage("");

            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify({
                    student_id,
                    password,
                }),
            });

            const data = await parseLoginResponse(response);

            if (!response.ok) {
                clearPassword();
                setErrorMessage(data?.detail || "로그인에 실패했습니다.");
                return;
            }

            if (!data?.access_token) {
                clearPassword();
                setErrorMessage("로그인 응답을 확인할 수 없습니다. 다시 시도해주세요.");
                return;
            }

            if (rememberId) {
                localStorage.setItem(REMEMBERED_STUDENT_ID_KEY, student_id);
            } else {
                localStorage.removeItem(REMEMBERED_STUDENT_ID_KEY);
            }

            onLogin?.(data.access_token);
            navigate("/main");
        } catch (error) {
            clearPassword();
            setErrorMessage("서버에 연결할 수 없습니다.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="login-page">
            {/* 좌측: 서비스 정체성 및 상세 기능 소개 */}
            <section className="login-intro-side">
                <div className="brand-info">
                    <div className="brand-logo">CBNU TaskHub</div>
                </div>

                <div className="intro-content">
                    <h1>충북대생을 위한 <br />스마트 학업 관리</h1>
                    <p>
                        매일 확인해야 하는 과제와 공지사항, <br />
                        이제 한곳에서 더 빠르고 효율적으로 관리하세요.
                    </p>

                    <div className="feature-list">
                        <div className="feature-item">
                            <span className="icon">📊</span>
                            <span>통합 대시보드</span>
                            <p>모든 과목의 과제를 마감순으로 정렬하여<br />한눈에 확인합니다.</p>
                        </div>
                        <div className="feature-item">
                            <span className="icon">🔔</span>
                            <span>맞춤형 스마트 리마인더</span>
                            <p>원하는 시간에, 원하는 과목만 선택하여 나만의 마감 알림을 설정하세요.</p>
                        </div>
                        <div className="feature-item">
                            <span className="icon">📢</span>
                            <span>공지사항 통합 피드</span>
                            <p>여러 과목 게시판을 돌아다닐 필요 없이,<br />모든 새 소식을 한곳에서 모아보세요.</p>
                        </div>
                        <div className="feature-item">
                            <span className="icon">📅</span>
                            <span>개인 일정 관리</span>
                            <p>LMS 과제 외에도 나만의 할 일을 추가하고 관리할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* 우측: 로그인 폼 영역 */}
            <section className="login-form-side">
                <div className="login-form-container">
                    <div className="login-header">
                        <p>별도의 회원가입 없이<br/>개신누리 계정으로 로그인하세요.</p>
                    </div>

                    <form className="login-form" onSubmit={handleLogin}>
                        {loginFields.map((field) => (
                            <div className="input-field" key={field.id}>
                                <label htmlFor={field.id}>{field.label}</label>
                                <input
                                    id={field.id}
                                    name={field.name}
                                    type={field.type}
                                    placeholder={field.placeholder}
                                    value={loginForm[field.name]}
                                    onChange={handleChange}
                                    autoComplete={field.autoComplete}
                                    maxLength={field.maxLength}
                                    disabled={isLoading}
                                />
                            </div>
                        ))}

                        <div className="login-options">
                            <label className="remember-me">
                                <input
                                    type="checkbox"
                                    checked={rememberId}
                                    onChange={(e) => setRememberId(e.target.checked)}
                                />
                                <span>아이디 기억하기</span>
                            </label>
                        </div>

                        {errorMessage && <p className="login-error-msg">{errorMessage}</p>}

                        <button type="submit" className="login-submit-btn" disabled={isLoading}>
                            {isLoading ? "인증 중..." : "계속하기"}
                        </button>
                    </form>
                </div>
            </section>
        </main>
    );
}

export default LoginPage;