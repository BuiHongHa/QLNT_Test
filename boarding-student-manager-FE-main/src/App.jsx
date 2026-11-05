import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login/Login';
import ResetPassword from './components/Login/ResetPassword';
import Dashboard from './components/Dashboard/Dashboard'
import Layout from './components/Layout/Layout'
import StudentCard from './components/StudentCard/StudentCard'
import StudentManager from './components/StudentManager/StudentManager'
import TeacherManager from './components/TeacherManager/TeacherManager'
import DormManager from './components/DormManager/DormManager'
import AccessManager from './components/AccessManager/AccessManager';
import LeaveManager from './components/LeaveManager/LeaveManager';
import MealManager from './components/MealManager/MealManager';
import InspectionManager from './components/InspectionManager/InspectionManager';
import DormAttendance from './components/DormAttendance/DormAttendance';
import TrashManager from './components/TrashManager/TrashManager';
import PromoteManager from './components/PromoteManager/PromoteManager';
import StudentViolations from './components/StudentViolations/StudentViolations';
import { getStoredUser, refreshAuthSession } from './config/auth';

const ProtectedRoute = ({ children }) => {
  const [checking, setChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkLogin = async () => {
      if (getStoredUser()) {
        if (mounted) {
          setIsLoggedIn(true);
          setChecking(false);
        }
        return;
      }

      try {
        const user = await refreshAuthSession();
        if (mounted) setIsLoggedIn(Boolean(user));
      } catch {
        if (mounted) setIsLoggedIn(false);
      } finally {
        if (mounted) setChecking(false);
      }
    };

    checkLogin();
    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return <div style={{ padding: 24 }}>Đang kiểm tra đăng nhập...</div>;
  }

  return isLoggedIn ? children : <Navigate to="/login" replace />;
};

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/student-card" element={<ProtectedRoute><Layout><StudentCard /></Layout></ProtectedRoute>} />
        <Route path="/violations" element={<ProtectedRoute><Layout><StudentViolations /></Layout></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute><Layout><StudentManager /></Layout></ProtectedRoute>} />
        <Route path="/teachers" element={<ProtectedRoute><Layout><TeacherManager /></Layout></ProtectedRoute>} />
        <Route path="/dormrooms" element={<ProtectedRoute><Layout><DormManager /></Layout></ProtectedRoute>} />
        <Route path="/dorm-attendance" element={<ProtectedRoute><Layout><DormAttendance /></Layout></ProtectedRoute>} />
        <Route path="/leaves" element={<ProtectedRoute><Layout><LeaveManager /></Layout></ProtectedRoute>} />
        <Route path="/meals" element={<ProtectedRoute><Layout><MealManager /></Layout></ProtectedRoute>} />
        <Route path="/access" element={<ProtectedRoute><Layout><AccessManager /></Layout></ProtectedRoute>} />
        <Route path="/inspection" element={<ProtectedRoute><Layout><InspectionManager /></Layout></ProtectedRoute>} />
        <Route path="/trash/students" element={<ProtectedRoute><Layout><TrashManager type="students" /></Layout></ProtectedRoute>} />
        <Route path="/trash/teachers" element={<ProtectedRoute><Layout><TrashManager type="teachers" /></Layout></ProtectedRoute>} />
        <Route path="/trash/rooms" element={<ProtectedRoute><Layout><TrashManager type="rooms" /></Layout></ProtectedRoute>} />
        <Route path="/promote" element={<ProtectedRoute><Layout><PromoteManager /></Layout></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
