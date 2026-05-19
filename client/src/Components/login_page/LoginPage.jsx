import React from "react";
import "./LoginPage.css";

function LoginPage() {
    return (
    <main className="login-page">
        <section className="login-card">
            <div className="login-title-area">
                <p className="login-label">충북대 LMS 학습 대시보드</p>
                <h1>로그인</h1>
                <p>과제와 공지사항을 확인하려면 로그인해주세요.</p>
            </div>
            
            <form className="login-form">
                <div className="login-field">
                    <label htmlFor="student_id">아이디</label>
                    <input
                        id="student_id"
                        name="student_id"
                        type="text"
                        placeholder="아이디를 입력하세요"
                    />
                </div>
                
                <div className="login-field">
                    <label htmlFor="password">비밀번호</label>
                    <input
                        id="password"
                        name="password"
                        type="password"
                        placeholder="비밀번호를 입력하세요"
                    />
                </div>

                <button type="submit" className="login-button">
                    로그인
                </button>
            </form>
        </section>
    </main>
    );
}

export default LoginPage;