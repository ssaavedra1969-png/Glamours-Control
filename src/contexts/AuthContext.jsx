import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import firestoreDB from '../services/firestoreDB';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          nombre: firebaseUser.displayName || firebaseUser.email.split('@')[0],
          rol: 'admin',
        };
        try {
          const users = await firestoreDB.getUsers();
          const found = users.find((u) => u.email === firebaseUser.email);
          if (found) {
            userData.rol = found.rol || 'user';
            userData.nombre = found.nombre || userData.nombre;
          }
        } catch (e) {
          console.warn('No se pudo leer perfil de usuario:', e);
        }
        setUser(userData);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = {
      uid: cred.user.uid,
      email: cred.user.email,
      nombre: cred.user.displayName || email.split('@')[0],
      rol: 'admin',
    };
    try {
      const users = await firestoreDB.getUsers();
      const found = users.find((u) => u.email === email);
      if (found) {
        userData.rol = found.rol || 'user';
        userData.nombre = found.nombre || userData.nombre;
      }
    } catch (e) { /* first user */ }
    await firestoreDB.addAuditLog(email, 'Inicio de sesión', 'Auth', 'Login exitoso');
    return userData;
  };

  const logout = async () => {
    if (user) {
      firestoreDB.addAuditLog(user.email, 'Cierre de sesión', 'Auth', 'Logout').catch(() => {});
    }
    await signOut(auth);
    setUser(null);
  };

  const register = async (email, password, nombre) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: nombre });
    await firestoreDB.addUser({ uid: cred.user.uid, email, nombre, rol: 'user' });
    await firestoreDB.addAuditLog(email, 'Registro de nuevo usuario', 'Auth', `Usuario registrado: ${nombre}`);
  };

  const isAdmin = user?.rol === 'admin';

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    const email = cred.user.email;
    let userData = {
      uid: cred.user.uid,
      email,
      nombre: cred.user.displayName || email.split('@')[0],
      rol: 'admin',
    };
    try {
      const users = await firestoreDB.getUsers();
      const found = users.find((u) => u.email === email);
      if (found) {
        userData.rol = found.rol || 'user';
        userData.nombre = found.nombre || userData.nombre;
      } else {
        await firestoreDB.addUser({ uid: cred.user.uid, email, nombre: userData.nombre, rol: 'admin' });
      }
    } catch (e) {
      await firestoreDB.addUser({ uid: cred.user.uid, email, nombre: userData.nombre, rol: 'admin' });
    }
    await firestoreDB.addAuditLog(email, 'Inicio de sesión (Google)', 'Auth', 'Login exitoso');
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loginWithGoogle, loading, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
