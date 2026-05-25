import { createContext, useContext, useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile,
  signInWithPopup
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase.js';
import { authAPI } from '../api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      const token = localStorage.getItem('token');
      if (token) {
        authAPI.me()
          .then((res) => setUser(res.data))
          .catch(() => localStorage.removeItem('token'))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const token = await firebaseUser.getIdToken();
        localStorage.setItem('token', token);
        setUser({
          _id: firebaseUser.uid,
          name: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          email: firebaseUser.email,
        });
      } else {
        localStorage.removeItem('token');
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    if (!auth) {
      const res = await authAPI.login({ email, password });
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      return;
    }
    await signInWithEmailAndPassword(auth, email, password);
  };

  const loginWithGoogle = async () => {
    if (!auth || !googleProvider) {
      throw new Error('Firebase configuration is missing! Please configure the VITE_FIREBASE_* keys in client/.env');
    }
    await signInWithPopup(auth, googleProvider);
  };

  const register = async (name, email, password) => {
    if (!auth) {
      const res = await authAPI.register({ name, email, password });
      localStorage.setItem('token', res.data.token);
      setUser(res.data.user);
      return;
    }
    const res = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(res.user, { displayName: name });
    const token = await res.user.getIdToken();
    localStorage.setItem('token', token);
    setUser({
      _id: res.user.uid,
      name: name,
      email: email,
    });
  };

  const logout = async () => {
    if (!auth) {
      localStorage.removeItem('token');
      setUser(null);
      return;
    }
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, loginWithGoogle, hasGoogleAuth: !!googleProvider }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
