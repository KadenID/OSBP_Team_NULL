import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

import LoginPage from "./Components/login_page/LoginPage";
import MainPage from "./Components/main_page/MainPage";
import MyPage from "./Components/my_page/MyPage";

function App() {
  const [accessToken, setAccessToken] = useState(null);
  
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LoginPage onLogin={setAccessToken} />} />
        <Route path="/main" element={<MainPage accessToken={accessToken} />} />
        <Route path="/mypage" element={<MyPage accessToken={accessToken} />} />
      </Routes>
    </Router>
  );
}

export default App;
