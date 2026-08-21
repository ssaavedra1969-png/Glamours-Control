import { useState, useEffect, useRef } from 'react';
import { Settings, Users, UserPlus, Database, Upload, Download, Trash2, Info } from 'lucide-react';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as fbSignOut, connectAuthEmulator } from 'firebase/auth';
import { firebaseConfig } from '../config/firebase';
import mockDB, { SALDO_VERSION } from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Configuracion() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState({ email: '', password: '', nombre: '', rol: 'operador' });
  const fileInputRef = useRef(null);
  const esEmulador = import.meta.env.VITE_USE_EMULATOR === 'true';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([mockDB.getUsers(), mockDB.getCollectionCounts()]);
      setUsers(u);
      setCounts(c);
    } catch {}
    finally { setLoading(false); }
  };

  const crearUsuario = async () => {
    if (!nuevoUsuario.email || !nuevoUsuario.password || !nuevoUsuario.nombre) return toast.error('Complete email, contrasena y nombre');
    if (nuevoUsuario.password.length < 6) return toast.error('La contrasena debe tener al menos 6 caracteres');
    let secApp;
    try {
      toast.loading('Creando usuario...');
      secApp = initializeApp(firebaseConfig, 'alta-usuario-' + Date.now());
      const secAuth = getAuth(secApp);
      if (esEmulador) connectAuthEmulator(secAuth, 'http://localhost:9099', { disableWarnings: true });
      const cred = await createUserWithEmailAndPassword(secAuth, nuevoUsuario.email.trim(), nuevoUsuario.password);
      // Perfil ANTES de cerrar la sesion secundaria: las reglas solo permiten
      // crear el doc users/{uid} del propio usuario autenticado
      await mockDB.addUser({ uid: cred.user.uid, email: nuevoUsuario.email.trim(), nombre: nuevoUsuario.nombre, rol: nuevoUsuario.rol, creado: new Date().toISOString() });
      await fbSignOut(secAuth).catch(() => {});
      mockDB.addAuditLog(user.email, 'Alta de usuario', 'Configuracion', `${nuevoUsuario.email} (${nuevoUsuario.rol})`);
      toast.dismiss();
      toast.success('Usuario creado: ' + nuevoUsuario.email);
      setNuevoUsuario({ email: '', password: '', nombre: '', rol: 'operador' });
      loadData();
    } catch (err) {
      toast.dismiss();
      if (err.code === 'auth/email-already-in-use') toast.error('Ese email ya esta registrado');
      else toast.error('Error: ' + err.message);
    } finally {
      if (secApp) deleteApp(secApp).catch(() => {});
    }
  };

  const descargarBackup = async () => {
    try {
      toast.loading('Generando backup...');
      const backup = await mockDB.exportAllData();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'GLAMOURS_BACKUP_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      mockDB.addAuditLog(user.email, 'Descarga de backup', 'Configuracion', 'Backup JSON completo');
      toast.dismiss();
      toast.success('Backup descargado');
    } catch (err) {
      toast.dismiss();
      toast.error('Error: ' + err.message);
    }
  };

  const handleRestaurar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      const resumen = ['caja', 'ventas', 'cierres', 'conciliaciones', 'auditoria', 'users']
        .filter((c) => Array.isArray(backup[c]))
        .map((c) => `${c}: ${backup[c].length}`)
        .join('\n');
      const ok = window.confirm(`RESTAURAR BACKUP?\n\nFecha del backup: ${backup._meta?.fecha?.slice(0, 10) || 'desconocida'}\n\n${resumen}\n\nNo se borra nada: los documentos con el mismo id se sobrescriben y el resto se agrega.\n\nContinuar?`);
      if (!ok) return;
      toast.loading('Restaurando backup...', { duration: 120000 });
      const total = await mockDB.importData(backup);
      mockDB.addAuditLog(user.email, 'Restauracion de backup', 'Configuracion', `${total} documentos`);
      toast.dismiss();
      toast.success(`Backup restaurado (${total} documentos)`);
      loadData();
    } catch (err) {
      toast.dismiss();
      toast.error('Error restaurando: ' + err.message);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <div className="spinner" />
    </div>
  );

  const panelStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: '14px',
    padding: '1.5rem',
  };
  const panelHeader = (emoji, titulo, subtitulo) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
      <span style={{ fontSize: '1.1rem' }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: '800', fontSize: '0.95rem', color: 'var(--text, #f3f4f6)' }}>{titulo}</div>
        <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>{subtitulo}</div>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>

      {/* ============================================ */}
      {/* SECCION 1: ENCABEZADO                      */}
      {/* ============================================ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #d4af37 0%, #b8960c 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Settings size={20} color="#000" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: '800', margin: 0, color: 'var(--text, #f3f4f6)' }}>Configuracion del Sistema</h2>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>Usuarios, copias de seguridad y estado general</p>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 2: GESTION DE USUARIOS             */}
      {/* ============================================ */}
      <section>
        <div style={panelStyle}>
          {panelHeader('👥', 'Gestion de Usuarios', 'Cuentas con acceso al sistema')}
          <div className="table-container" style={{ marginBottom: '1.25rem' }}>
            <table>
              <thead><tr><th>Email</th><th>Nombre</th><th>Rol</th><th>Creado</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid}>
                    <td>{u.email}</td>
                    <td>{u.nombre}</td>
                    <td><span className={`badge ${u.rol === 'admin' ? 'badge-primary' : 'badge-neutral'}`}>{u.rol}</span></td>
                    <td>{u.creado?.split('T')[0] || '-'}</td>
                  </tr>
                ))}
                {users.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#6b7280', padding: '1.5rem' }}>Sin usuarios registrados</td></tr>}
              </tbody>
            </table>
          </div>

          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap',
            borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '1rem',
          }}>
            <div className="form-group" style={{ margin: 0, minWidth: '200px', flex: '1 1 180px' }}>
              <label>Email</label>
              <input type="email" value={nuevoUsuario.email} placeholder="usuario@glamours.com"
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: '140px', flex: '1 1 130px' }}>
              <label>Contrasena</label>
              <input type="password" value={nuevoUsuario.password} placeholder="Minimo 6 caracteres"
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: '150px', flex: '1 1 140px' }}>
              <label>Nombre</label>
              <input type="text" value={nuevoUsuario.nombre} placeholder="Nombre y apellido"
                onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} />
            </div>
            <div className="form-group" style={{ margin: 0, width: '130px' }}>
              <label>Rol</label>
              <select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}>
                <option value="operador">operador</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={crearUsuario} style={{ height: '38px' }}>
              <UserPlus size={15} /> Crear
            </button>
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 3: COPIAS DE SEGURIDAD             */}
      {/* ============================================ */}
      <section>
        <div style={panelStyle}>
          {panelHeader('🛡️', 'Copias de Seguridad', 'Exportar todo el sistema a JSON y restaurarlo cuando necesites')}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={descargarBackup}><Download size={16} /> Descargar Backup</button>
            <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}><Upload size={16} /> Restaurar Backup</button>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleRestaurar} style={{ display: 'none' }} />
          </div>
          <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '1rem', marginBottom: 0 }}>
            La restauracion agrega/sobrescribe por id sin borrar el resto. Ideal para pasar datos entre la base de prueba y produccion.
          </p>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 4: INFORMACION DEL SISTEMA         */}
      {/* ============================================ */}
      <section>
        <div style={panelStyle}>
          {panelHeader('📊', 'Informacion del Sistema', 'Estado actual de la base de datos')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Entorno</div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: esEmulador ? '#facc15' : '#10b981' }}>{esEmulador ? 'Emulador local' : 'Produccion'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>Version formula saldos</div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>v{SALDO_VERSION}</div>
            </div>
            {[['caja', 'Movimientos caja'], ['ventas', 'Ventas'], ['cierres', 'Cierres'], ['auditoria', 'Registros auditoria']].map(([key, label]) => (
              <div key={key} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '0.85rem 1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.65rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>{label}</div>
                <div style={{ fontWeight: '800', fontSize: '0.95rem' }}>{counts ? (counts[key] >= 0 ? counts[key].toLocaleString() : 'N/D') : '-'}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================ */}
      {/* SECCION 5: ZONA DE PELIGRO                 */}
      {/* ============================================ */}
      <section>
        <div style={{
          background: 'rgba(239,68,68,0.04)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: '14px', padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Trash2 size={18} color="#ef4444" />
            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#ef4444' }}>Zona de Peligro</div>
          </div>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
            Descarga un backup y elimina TODOS los datos de la aplicacion. Esta accion no se puede deshacer.
          </p>
          <button
            className="btn btn-danger"
            onClick={async () => {
              const ok = window.confirm('Va a ELIMINAR TODOS LOS DATOS y descargar un backup.\n\nContinuar?');
              if (!ok) return;
              try {
                toast.loading('Descargando backup...');
                const backup = await mockDB.exportAllData();
                toast.loading('Eliminando datos...');
                await mockDB.deleteAllCollections();
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = 'GLAMOURS_BACKUP_' + new Date().toISOString().slice(0, 10) + '.json';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                mockDB.addAuditLog(user.email, 'Eliminacion total de datos', 'Configuracion', 'Con backup previo');
                toast.dismiss();
                toast.success('Datos eliminados y backup descargado');
                loadData();
              } catch (err) {
                toast.dismiss();
                toast.error('Error: ' + err.message);
              }
            }}
          >
            <Trash2 size={16} /> Eliminar Todo y Descargar Backup
          </button>
        </div>
      </section>
    </div>
  );
}
