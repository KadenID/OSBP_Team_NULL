import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";
import { API_BASE_URL } from "../../apiConfig";

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

function LoginPage({ onLogin, accessToken }) {
    const navigate = useNavigate();

    // 이미 로그인이 되어 있다면 메인으로 이동 (자동 로그인 처리)
    useEffect(() => {
        if (accessToken) {
            navigate("/main");
        }
    }, [accessToken, navigate]);

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
            <section className="login-card">
                <div className="login-title-area">
                    <p className="login-label">충북대 LMS 학습 대시보드</p>
                    <h1>로그인</h1>
                    <p>학습 대시보드를 이용하려면 로그인해주세요.</p>
                </div>

                <form className="login-form" onSubmit={handleLogin}>
                    {loginFields.map((field) => (
                        <div className="login-field" key={field.id}>
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

                    <label className="remember-row">
                        <input
                            type="checkbox"
                            checked={rememberId}
                            onChange={(e) => setRememberId(e.target.checked)}
                        />
                        <span>아이디 기억하기</span>
                    </label>

                    {errorMessage && <p className="login-error">{errorMessage}</p>}

                    <button type="submit" className="login-button" disabled={isLoading}>
                        {isLoading ? "로그인 중..." : "로그인"}
                    </button>
                </form>
            </section>
        </main>
    );
}

export default LoginPage;