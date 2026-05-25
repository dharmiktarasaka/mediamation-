import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import toast from 'react-hot-toast';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loginWithGoogle, hasGoogleAuth } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed');
    }
  };

  const handleGoogleLogin = async () => {
    if (!hasGoogleAuth) {
      toast.error('Firebase is not configured! Please add your VITE_FIREBASE_* keys to client/.env');
      return;
    }
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.message || 'Google Login failed');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Mediamation</h1>
        <p className="subtitle">Social Media Scheduler</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit">Log In</button>
        </form>

        <div className="auth-divider">
          <span>OR</span>
        </div>

        <button type="button" className="btn-google" onClick={handleGoogleLogin}>
          <svg className="google-icon" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.49 3.77v3.13h4.01c2.34-2.16 3.69-5.35 3.69-8.75z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-4.01-3.13c-1.12.75-2.55 1.19-3.95 1.19-3.04 0-5.61-2.05-6.53-4.82H1.31v3.23A12 12 0 0 0 12 24z"/>
            <path fill="#FBBC05" d="M5.47 14.33A7.17 7.17 0 0 1 5.07 12c0-.82.14-1.61.4-2.33V6.44H1.31A11.97 11.97 0 0 0 0 12c0 2.12.55 4.12 1.52 5.89l3.95-3.56z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.96 1.19 15.24 0 12 0A12 12 0 0 0 1.31 6.44l4.16 3.23c.92-2.77 3.49-4.82 6.53-4.82z"/>
          </svg>
          Sign In with Google
        </button>

        <p className="auth-link">Don't have an account? <Link to="/register">Register</Link></p>
      </div>
    </div>
  );
}
