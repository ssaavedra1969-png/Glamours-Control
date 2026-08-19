import { useState, useEffect } from 'react';
import { Save, Trash2, Users, Percent, DollarSign, Download } from 'lucide-react';
import mockDB from '../services/firestoreDB';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

export default function Configuracion() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState({ iva: 21, limites_caja: { minimo: 10000, maximo: 200000 } });
  const [users, setUsers] = useState([]);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, u] = await Promise.all([mockDB.getConfiguracion(), mockDB.getUsers()]);
      setConfig(cfg);
      setUsers(u);
    } catch {}
    finally { setLoading(false); }
  };

  const saveConfig = async () => {
    await mockDB.updateConfiguracion(config);
    mockDB.addAuditLog(user.email, 'Modificacion de configuracion', 'Configuracion', JSON.stringify(config));
    toast.success('Configuracion guardada');
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;

  return (
    <div>
      {/* IVA */}
      <div className="card">
        <div className="card-header"><h2><Percent size={18} /> Impuestos</h2></div>
        <div className="form-row">
          <div className="form-group">
            <label>IVA (%)</label>
            <input type="number" value={config.iva} onChange={(e) => setConfig({ ...config, iva: parseFloat(e.target.value) || 0 })} min="0" max="100" step="0.5" />
            <div className="form-hint">Porcentaje de IVA aplicable</div>
          </div>
        </div>
      </div>

      {/* Limites Caja */}
      <div className="card">
        <div className="card-header"><h2><DollarSign size={18} /> Límites de Caja</h2></div>
        <div className="form-row">
          <div className="form-group">
            <label>Saldo Mínimo ($)</label>
            <input type="number" value={config.limites_caja.minimo} onChange={(e) => setConfig({ ...config, limites_caja: { ...config.limites_caja, minimo: parseFloat(e.target.value) || 0 } })} min="0" />
            <div className="form-hint">Alerta cuando el saldo baje de este monto</div>
          </div>
          <div className="form-group">
            <label>Saldo Máximo ($)</label>
            <input type="number" value={config.limites_caja.maximo} onChange={(e) => setConfig({ ...config, limites_caja: { ...config.limites_caja, maximo: parseFloat(e.target.value) || 0 } })} min="0" />
            <div className="form-hint">Alerta cuando el saldo supere este monto</div>
          </div>
        </div>
      </div>

      {/* Usuarios */}
      <div className="card">
        <div className="card-header"><h2><Users size={18} /> Usuarios del Sistema</h2></div>
        <div className="table-container">
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
            </tbody>
          </table>
        </div>
      </div>

      {/* Limpiar Datos */}
      <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
        <div className="card-header"><h2 style={{ color: 'var(--danger)' }}><Trash2 size={18} /> Zona de Peligro</h2></div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Descarga backup y elimina todos los datos de la aplicacion.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-danger"
            onClick={() => {
              const ok = window.confirm('Va a ELIMINAR TODOS LOS DATOS y descargar un backup.\n\nContinuar?');
              if (!ok) return;

              // Recopilar datos
              const backup = {};
              const keys = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('glamours_')) {
                  keys.push(k);
                  try { backup[k] = JSON.parse(localStorage.getItem(k)); }
                  catch { backup[k] = localStorage.getItem(k); }
                }
              }
              backup._meta = { fecha: new Date().toISOString(), claves: keys };

              // Borrar PRIMERO
              keys.forEach((k) => localStorage.removeItem(k));
              localStorage.setItem('glamours_empty', '1');

              // Descargar backup DESPUES
              const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'GLAMOURS_BACKUP_' + new Date().toISOString().slice(0,10) + '.json';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);

              toast.success('Datos eliminados y backup descargado');
              window.location.reload();
            }}
          >
            <Trash2 size={16} /> Eliminar Todo y Descargar Backup
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              const backup = {};
              const keys = [];
              for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('glamours_')) {
                  keys.push(k);
                  try { backup[k] = JSON.parse(localStorage.getItem(k)); }
                  catch { backup[k] = localStorage.getItem(k); }
                }
              }
              backup._meta = { fecha: new Date().toISOString(), claves: keys };
              const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = 'GLAMOURS_BACKUP_' + new Date().toISOString().slice(0,10) + '.json';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(url);
              toast.success('Backup descargado (sin borrar)');
            }}
          >
            <Download size={16} /> Solo Descargar Backup
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
        <button className="btn btn-primary" onClick={saveConfig}><Save size={16} /> Guardar Configuracion</button>
      </div>
    </div>
  );
}
