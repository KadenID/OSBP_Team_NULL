import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const loginFields = [
    {
        id: "student_id",
        name: "student_id",
        label: "아이디",
        type: "text",
        placeholder: "아이디를 입력하세요",
    },
    {
        id: "password",
        name: "password",
        label: "비밀번호",
        type: "password",
        placeholder: "비밀번호를 입력하세요",
    },
];

function LoginPage({ onLogin }) {
    const navigate = useNavigate();

    const [loginForm, setLoginForm] = useState({
        student_id: "",
        password: "",
    });

    const [errorMessage, setErrorMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;

        setLoginForm((prevForm) => ({
            ...prevForm,
            [name]: value,
        }));
    };

    const handleLogin = async (e) => {
        e.preventDefault();

        const student_id = loginForm.student_id.trim();
        const password = loginForm.password.trim();

        if (!student_id || !password) {
            setErrorMessage("아이디와 비밀번호를 입력해주세요.");
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

            const data = await response.json();

            if (!response.ok) {
                setErrorMessage(data.detail || "로그인에 실패했습니다.");
                return;
            }

            if (!data.access_token) {
                setErrorMessage("Access Token을 받지 못했습니다.");
                return;
            }

            onLogin?.(data.access_token);
            navigate("/main");
        } catch (error) {
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
                    <p>과제와 공지사항을 확인하려면 로그인해주세요.</p>
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
                                autoComplete={
                                    field.name === "password"
                                        ? "current-password"
                                        : "username"
                                }
                            />
                        </div>
                    ))}

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