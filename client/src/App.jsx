import { Routes, Route } from 'react-router-dom';
import Kiosk from './pages/Kiosk.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Employees from './pages/Employees.jsx';
import Records from './pages/Records.jsx';
import Reports from './pages/Reports.jsx';
import Branches from './pages/Branches.jsx';
import ChangePassword from './pages/ChangePassword.jsx';
import Track from './pages/Track.jsx';
import AdminLayout from './components/AdminLayout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Kiosk />} />
      <Route path="/track" element={<Track />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="records" element={<Records />} />
        <Route path="reports" element={<Reports />} />
        <Route path="branches" element={<Branches />} />
        <Route path="password" element={<ChangePassword />} />
      </Route>
    </Routes>
  );
}
