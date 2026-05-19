import React, { useState } from "react";
import "./LoginPage.css";

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

function LoginPage() {
    const [loginForm, setLoginForm] = useState({
        student_id: "",
        password: "",
    });

    const [errorMessage, setErrorMessage] = useState("");

    const handleChange = (e) => {
        const { name, value } = e.target;

        setLoginForm((prevForm) => ({
            ...prevForm,
            [name]: value,
        }));
    };

    const handleLogin = (e) => {
        e.preventDefault();

        if (!loginForm.student_id.trim() || !loginForm.password.trim()) {
        setErrorMessage("아이디와 비밀번호를 입력해주세요.");
        return;
        }

        setErrorMessage("");
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
                    />
                </div>
                ))}
            
                {errorMessage && <p className="login-error">{errorMessage}</p>}
            
                <button type="submit" className="login-button">
                    로그인
                </button>
            </form>
        </section>
    </main>
    );
}

export default LoginPage;