import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      toast.success('Bienvenido a GLAMOUR\'S');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      toast.success('Bienvenido a GLAMOUR\'S');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      {/* Ambient background matching main app */}
      <div className="ambient-bg" />
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="noise-overlay" />

      <div style={{
        position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center',
        alignItems: 'center', height: '100vh', padding: '1rem',
      }}>
        <div style={{
          background: 'rgba(12, 16, 26, 0.65)',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '24px', padding: '2.5rem', width: '100%', maxWidth: '400px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px', margin: '0 auto 1rem',
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: '800', color: 'white', fontSize: '1.4rem',
              boxShadow: '0 8px 24px rgba(59,130,246,0.3)',
            }}>G</div>
            <h1 style={{
              fontSize: '1.6rem', fontWeight: '800', letterSpacing: '2px',
              background: 'linear-gradient(to right, #fff, #8b9bb4)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>GLAMOUR'S</h1>
            <p style={{
              color: '#4a5568', fontSize: '0.7rem', textTransform: 'uppercase',
              letterSpacing: '0.2em', fontFamily: "'JetBrains Mono', monospace",
              marginTop: '4px',
            }}>Sistema de Gestion v2.0</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: '600', fontSize: '0.8rem', color: '#8b9bb4' }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@glamours.com" required
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(12,16,26,0.5)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px', fontSize: '0.9rem', color: '#fff', outline: 'none',
                  fontFamily: 'inherit', transition: 'border-color 0.3s',
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
              />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: '600', fontSize: '0.8rem', color: '#8b9bb4' }}>Contrasena</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{
                  width: '100%', padding: '10px 14px',
                  background: 'rgba(12,16,26,0.5)', border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '8px', fontSize: '0.9rem', color: '#fff', outline: 'none',
                  fontFamily: 'inherit', transition: 'border-color 0.3s',
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(59,130,246,0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.06)'}
              />
            </div>

            {error && (
              <div style={{
                color: '#fca5a5', fontSize: '0.82rem', marginBottom: '1rem',
                padding: '8px 12px', background: 'rgba(239,68,68,0.1)',
                borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)',
              }}>{error}</div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '11px',
                background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontWeight: '700', fontSize: '0.9rem', fontFamily: 'inherit',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                boxShadow: '0 4px 16px rgba(59,130,246,0.3)',
                transition: 'all 0.3s',
                letterSpacing: '0.02em',
              }}
            >
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0', color: '#4a5568', fontSize: '0.75rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
              <span>O</span>
              <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.06)' }} />
            </div>

            <button
              type="button" disabled={loading} onClick={handleGoogle}
              style={{
                width: '100%', padding: '11px',
                background: 'rgba(255,255,255,0.05)',
                color: '#fff', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                fontWeight: '600', fontSize: '0.9rem', fontFamily: 'inherit',
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
                transition: 'all 0.3s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Ingresar con Google
            </button>
          </form>

          <div style={{
            marginTop: '1.5rem', padding: '0.75rem',
            background: 'rgba(255,255,255,0.03)', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.06)',
            fontSize: '0.72rem', color: '#4a5568', lineHeight: '1.6',
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            <strong style={{ color: '#8b9bb4' }}>Accesos demo:</strong><br />
            Admin: admin@glamours.com / admin123<br />
            User: vendedor@glamours.com / user123
          </div>
        </div>
      </div>
    </div>
  );
}
