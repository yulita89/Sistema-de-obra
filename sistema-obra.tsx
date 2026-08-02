import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard, ShoppingCart, Boxes, HardHat, ClipboardList,
  Plus, Trash2, Camera, X, ChevronRight, AlertTriangle, Loader2,
  Package, Truck, CheckCircle2, Clock, PauseCircle, Minus, FileSpreadsheet, Download,
  FileText, Upload, Eye, Building2, Home, Handshake, Receipt, Users, Landmark, Wallet,
  Lock, Calculator, ShieldCheck, BarChart3
} from "lucide-react";
import * as XLSX from "xlsx";

/* ---------------------------------------------------------------
   SISTEMA DE OBRA — almacenamiento compartido (todo el equipo)
   Claves:
     sitework:inventory            -> { items: [...] }
     sitework:purchase-orders      -> { orders: [...] }
     sitework:material-requests    -> { requests: [...] }
     sitework:workorders-index     -> { index: [...] }   (liviano, sin fotos)
     sitework:workorder:<id>       -> { ...detalle, fotos: [dataURL,...] }
     sitework:planos-index         -> { index: [...] }   (liviano, sin archivos)
     sitework:plano:<id>           -> { ...detalle, archivos: [{tipo, dataURL, nombreArchivo}] }
------------------------------------------------------------------*/

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600&display=swap";

const COLORS = {
  concrete: "#E7E4DD",
  ink: "#211F1B",
  card: "#FBFAF7",
  safety: "#F2650F",
  safetyDark: "#C8500C",
  blueprint: "#2C4B76",
  rust: "#8C3F26",
  green: "#3E6B4F",
  line: "#C9C4B8",
  lineDark: "#B2ABA0",
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}
function pad4(n) {
  return String(n).padStart(4, "0");
}
function fmtPYG(monto) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(monto) || 0);
}
function fmtUSD(monto) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(monto) || 0);
}
function fmtMoney(monto, moneda) {
  return moneda === "USD" ? fmtUSD(monto) : fmtPYG(monto);
}
const MONEDAS = ["PYG", "USD"];
function sumByCurrency(items, amountKey, { filter, sign } = {}) {
  const sums = { PYG: 0, USD: 0 };
  items.forEach((it) => {
    if (filter && !filter(it)) return;
    const m = it[`${amountKey}_moneda`] === "USD" ? "USD" : "PYG";
    const s = sign ? sign(it) : 1;
    sums[m] += s * (Number(it[amountKey]) || 0);
  });
  return sums;
}

/* ---------------- exportar a excel ---------------- */
function exportToExcel(filename, sheets) {
  const wb = XLSX.utils.book_new();
  Object.entries(sheets).forEach(([name, rows]) => {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Sin datos" }]);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  });
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function ExportButton({ onClick, label = "Exportar" }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: 6, background: "#fff",
        color: COLORS.blueprint, border: `1.5px solid ${COLORS.blueprint}`, borderRadius: 6,
        padding: "8px 12px", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer",
      }}
    >
      <FileSpreadsheet size={15} /> {label}
    </button>
  );
}

/* ---------------- storage helpers (viejo sistema, key-value) ---------------- */
async function loadShared(key, fallback) {
  try {
    const res = await window.storage.get(key, true);
    return res ? JSON.parse(res.value) : fallback;
  } catch (e) {
    return fallback;
  }
}
async function saveShared(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), true);
    return true;
  } catch (e) {
    console.error("Error guardando", key, e);
    return false;
  }
}

/* ---------------- API helpers (nuevo backend Python + SQL) ----------------
   Reemplaza gradualmente loadShared/saveShared por estas funciones,
   módulo por módulo. Ver README del backend para correr la API local.
------------------------------------------------------------------------- */
// ⚠️ ÚNICO LUGAR A CAMBIAR AL DESPLEGAR: reemplazar por la URL real del
// backend en Render (ej: "https://sistema-obra-api.onrender.com") antes
// de subir este archivo a Netlify.
const API_URL = "http://localhost:8000";

async function apiGet(path) {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`Error al obtener ${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error al crear en ${path}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Error al actualizar ${path}`);
  return res.json();
}

async function apiDelete(path) {
  const res = await fetch(`${API_URL}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Error al eliminar ${path}`);
  return res.json();
}

async function apiUpload(path, files) {
  const formData = new FormData();
  for (const f of files) formData.append("archivos", f);
  const res = await fetch(`${API_URL}${path}`, { method: "POST", body: formData });
  if (!res.ok) throw new Error(`Error al subir archivo a ${path}`);
  return res.json();
}

/* ---------------- image resize ---------------- */
function resizeImage(file, maxW = 640, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------------- lectura de archivos (planos: imagen o pdf) ---------------- */
const MAX_FILE_BYTES = 4 * 1024 * 1024; // ~4MB de margen bajo el límite de 5MB por clave

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processPlanoFile(file) {
  const isImage = file.type.startsWith("image/");
  if (isImage) {
    // comprimimos imágenes igual que las fotos de trabajo, a mayor resolución para que el plano se lea bien
    const dataURL = await resizeImage(file, 1400, 0.7);
    return { tipo: "imagen", dataURL, nombreArchivo: file.name };
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y supera el límite de este almacenamiento (~4 MB). Sube una imagen del plano (foto o escaneo) o usa un enlace externo (Google Drive, Dropbox) para el PDF.`
    );
  }
  const dataURL = await readFileAsDataURL(file);
  return { tipo: "pdf", dataURL, nombreArchivo: file.name };
}



function StampBadge({ estado, tone }) {
  const toneColor = tone || COLORS.ink;
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: toneColor,
        border: `2px solid ${toneColor}`,
        borderRadius: 3,
        padding: "3px 8px",
        transform: "rotate(-2deg)",
        background: "rgba(255,255,255,0.5)",
      }}
    >
      {estado}
    </span>
  );
}

const ESTADO_TONE = {
  Pendiente: COLORS.rust,
  Solicitado: COLORS.rust,
  Aprobada: COLORS.blueprint,
  Aprobado: COLORS.blueprint,
  Enviada: COLORS.blueprint,
  "En tránsito": COLORS.blueprint,
  "En proceso": COLORS.blueprint,
  Pausado: COLORS.rust,
  Recibida: COLORS.green,
  Entregado: COLORS.green,
  Completado: COLORS.green,
  Completada: COLORS.green,
  Cancelada: "#8a8378",
  Disponible: COLORS.green,
  Reservado: COLORS.blueprint,
  Vendido: COLORS.ink,
  Alquilado: COLORS.ink,
  Activa: COLORS.blueprint,
  Activo: COLORS.green,
  Inactivo: "#8a8378",
  Pagado: COLORS.green,
  Vencido: COLORS.rust,
  Finalizado: COLORS.green,
};

function Ticket({ numero, children, right }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 8,
        position: "relative",
        padding: "16px 18px 16px 22px",
        boxShadow: "0 1px 2px rgba(33,31,27,0.06)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 10,
          bottom: 10,
          width: 4,
          borderRadius: 4,
          background: `repeating-linear-gradient(180deg, ${COLORS.lineDark} 0 6px, transparent 6px 11px)`,
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13, color: COLORS.blueprint, letterSpacing: "0.03em" }}>
          {numero}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon size={22} color={COLORS.safety} strokeWidth={2.2} />
          <h1 style={{ fontFamily: "'Oswald', sans-serif", fontWeight: 700, fontSize: 26, letterSpacing: "0.01em", color: COLORS.ink, margin: 0, textTransform: "uppercase" }}>
            {title}
          </h1>
        </div>
        {subtitle && <p style={{ margin: "4px 0 0 32px", color: "#5b564c", fontSize: 13.5 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function PrimaryButton({ onClick, children, icon: Icon = Plus, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: COLORS.safety,
        color: "#fff",
        border: "none",
        borderRadius: 6,
        padding: "9px 14px",
        fontFamily: "'Inter', sans-serif",
        fontWeight: 600,
        fontSize: 13.5,
        cursor: "pointer",
        boxShadow: "0 2px 0 rgba(0,0,0,0.12)",
        ...style,
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "translateY(1px)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "translateY(0)")}
    >
      <Icon size={16} /> {children}
    </button>
  );
}

function EmptyState({ text }) {
  return (
    <div
      style={{
        border: `1px dashed ${COLORS.lineDark}`,
        borderRadius: 8,
        padding: "34px 20px",
        textAlign: "center",
        color: "#6b6558",
        fontSize: 13.5,
        background: "rgba(255,255,255,0.35)",
      }}
    >
      {text}
    </div>
  );
}

function Loading() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b6558", fontSize: 13.5, padding: 20 }}>
      <Loader2 size={16} className="spin" /> Cargando datos del equipo…
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5, color: "#4c473d", fontWeight: 600 }}>
      {label}
      {children}
    </label>
  );
}

const inputStyle = {
  border: `1px solid ${COLORS.line}`,
  borderRadius: 5,
  padding: "7px 9px",
  fontFamily: "'Inter', sans-serif",
  fontSize: 13.5,
  background: "#fff",
  color: COLORS.ink,
};

function Modal({ title, onClose, children, wide }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(33,31,27,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.card, borderRadius: 10, padding: 22,
          width: "100%", maxWidth: wide ? 640 : 460, maxHeight: "88vh", overflowY: "auto",
          border: `1px solid ${COLORS.line}`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", fontSize: 18, margin: 0, color: COLORS.ink }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b6558" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ================= AUTENTICACIÓN (usuario y contraseña) ================= */
/*
  IMPORTANTE — léelo antes de usarlo con datos reales de la empresa:
  Este login guarda usuarios en el almacenamiento compartido del sistema y las
  contraseñas se guardan cifradas (hash SHA-256 con salt), nunca en texto plano.
  Sirve para que cada persona tenga su propio usuario y contraseña reales.
  Aun así, sigue siendo un login que corre del lado del navegador (no hay un
  servidor propio validando accesos), así que no es seguridad de nivel
  empresarial ni reemplaza un backend real. Para eso está el siguiente paso ya
  documentado (Supabase + autenticación) en spec-sistema-obra.md.
*/

function randomSalt() {
  const arr = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const data = enc.encode(`${salt}:${password}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const ROLES = ["admin", "jefe_obra", "compras", "bodega", "trabajador"];
const ROL_LABEL = {
  admin: "Administrador",
  jefe_obra: "Jefe de obra",
  compras: "Compras",
  bodega: "Bodega",
  trabajador: "Trabajador",
};

function AuthGate({ children }) {
  const [loading, setLoading] = useState(true);
  const [usuarios, setUsuarios] = useState([]);
  const [session, setSession] = useState(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ nombre: "", usuario: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const u = await loadShared("sitework:usuarios", { items: [] });
      setUsuarios(u.items || []);
      try {
        const s = await window.storage.get("sitework:session", false);
        if (s && s.value) {
          const parsed = JSON.parse(s.value);
          const found = (u.items || []).find((x) => x.usuario === parsed.usuario && x.activo !== false);
          if (found) setSession({ usuario: found.usuario, nombre: found.nombre, rol: found.rol });
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  async function persistUsuarios(next) {
    setUsuarios(next);
    await saveShared("sitework:usuarios", { items: next });
  }

  async function handleLogin() {
    setError(""); setBusy(true);
    const found = usuarios.find((u) => u.usuario.toLowerCase() === form.usuario.trim().toLowerCase());
    if (!found) { setError("Usuario no encontrado."); setBusy(false); return; }
    if (found.activo === false) { setError("Este usuario está deshabilitado. Consulta a un administrador."); setBusy(false); return; }
    const hash = await hashPassword(form.password, found.salt);
    if (hash !== found.hash) { setError("Contraseña incorrecta."); setBusy(false); return; }
    const sess = { usuario: found.usuario, nombre: found.nombre, rol: found.rol };
    await window.storage.set("sitework:session", JSON.stringify(sess), false);
    setSession(sess);
    setBusy(false);
  }

  async function handleSignup() {
    setError(""); setBusy(true);
    if (!form.nombre.trim() || !form.usuario.trim() || !form.password) { setError("Completa nombre, usuario y contraseña."); setBusy(false); return; }
    if (form.password.length < 4) { setError("La contraseña debe tener al menos 4 caracteres."); setBusy(false); return; }
    if (usuarios.some((u) => u.usuario.toLowerCase() === form.usuario.trim().toLowerCase())) { setError("Ese usuario ya existe."); setBusy(false); return; }
    const salt = randomSalt();
    const hash = await hashPassword(form.password, salt);
    const rol = usuarios.length === 0 ? "admin" : "trabajador";
    const nuevo = { id: uid(), nombre: form.nombre.trim(), usuario: form.usuario.trim(), salt, hash, rol, activo: true };
    const next = [...usuarios, nuevo];
    await persistUsuarios(next);
    const sess = { usuario: nuevo.usuario, nombre: nuevo.nombre, rol: nuevo.rol };
    await window.storage.set("sitework:session", JSON.stringify(sess), false);
    setSession(sess);
    setBusy(false);
  }

  async function logout() {
    await window.storage.delete("sitework:session", false).catch(() => {});
    setSession(null);
    setForm({ nombre: "", usuario: "", password: "" });
    setMode("login");
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.concrete, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <style>{`@import url('${FONT_LINK}');`}</style>
        <Loading />
      </div>
    );
  }

  if (!session) {
    const isFirstUser = usuarios.length === 0;
    const showSignup = isFirstUser || mode === "signup";
    return (
      <div style={{ minHeight: "100vh", background: COLORS.concrete, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: 16 }}>
        <style>{`@import url('${FONT_LINK}'); * { box-sizing: border-box; }`}</style>
        <div style={{ maxWidth: 380, width: "100%", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 30 }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <HardHat size={30} color={COLORS.safety} />
            <h2 style={{ fontFamily: "'Oswald', sans-serif", textTransform: "uppercase", margin: "8px 0 0", color: COLORS.ink, fontSize: 20 }}>Sistema de Obra</h2>
            <p style={{ fontSize: 12.5, color: "#6b6558", margin: "4px 0 0" }}>
              {isFirstUser ? "Crea la primera cuenta — será la de administrador" : showSignup ? "Crear una cuenta nueva" : "Inicia sesión para continuar"}
            </p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {showSignup && (
              <Field label="Nombre completo">
                <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </Field>
            )}
            <Field label="Usuario">
              <input style={inputStyle} value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} autoCapitalize="none" autoCorrect="off" />
            </Field>
            <Field label="Contraseña">
              <input
                type="password" style={inputStyle} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (showSignup ? handleSignup() : handleLogin())}
              />
            </Field>
          </div>
          {error && <p style={{ color: COLORS.rust, fontSize: 12.5, marginTop: 10 }}>{error}</p>}
          <div style={{ marginTop: 16 }}>
            <PrimaryButton onClick={showSignup ? handleSignup : handleLogin} icon={ShieldCheck} style={{ width: "100%", justifyContent: "center" }}>
              {busy ? "Un momento…" : isFirstUser ? "Crear cuenta de administrador" : showSignup ? "Crear cuenta" : "Iniciar sesión"}
            </PrimaryButton>
          </div>
          {!isFirstUser && (
            <button
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}
              style={{ marginTop: 12, background: "none", border: "none", color: COLORS.blueprint, fontSize: 12.5, cursor: "pointer", width: "100%", textAlign: "center" }}
            >
              {mode === "login" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Iniciar sesión"}
            </button>
          )}
          <p style={{ fontSize: 10.5, color: "#9b958a", marginTop: 18, lineHeight: 1.5, textAlign: "center" }}>
            Las contraseñas se guardan cifradas, nunca en texto plano.
          </p>
        </div>
      </div>
    );
  }

  return children({ session, usuarios, setUsuarios: persistUsuarios, logout });
}

function UsuariosPanel({ usuarios, setUsuarios, session }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ nombre: "", usuario: "", password: "", rol: "trabajador" });
  const [error, setError] = useState("");
  const isAdmin = session.rol === "admin";

  async function addUser() {
    setError("");
    if (!form.nombre.trim() || !form.usuario.trim() || !form.password) { setError("Completa todos los campos."); return; }
    if (usuarios.some((u) => u.usuario.toLowerCase() === form.usuario.trim().toLowerCase())) { setError("Ese usuario ya existe."); return; }
    const salt = randomSalt();
    const hash = await hashPassword(form.password, salt);
    const nuevo = { id: uid(), nombre: form.nombre.trim(), usuario: form.usuario.trim(), salt, hash, rol: form.rol, activo: true };
    await setUsuarios([...usuarios, nuevo]);
    setForm({ nombre: "", usuario: "", password: "", rol: "trabajador" });
    setShowAdd(false);
  }
  async function toggleActivo(u) {
    await setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, activo: x.activo === false } : x)));
  }
  async function changeRol(u, rol) {
    await setUsuarios(usuarios.map((x) => (x.id === u.id ? { ...x, rol } : x)));
  }

  return (
    <div>
      <SectionHeader
        icon={Users}
        title="Usuarios"
        subtitle={isAdmin ? "Cuentas del sistema, roles y accesos" : "Cuentas del sistema (solo un administrador puede editarlas)"}
        action={isAdmin ? <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo usuario</PrimaryButton> : null}
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {usuarios.map((u) => (
          <Ticket key={u.id} numero={u.usuario} right={<StampBadge estado={u.activo === false ? "Inactivo" : "Activo"} tone={u.activo === false ? "#8a8378" : COLORS.green} />}>
            <div style={{ marginTop: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{u.nombre}</div>
              <div style={{ fontSize: 12, color: "#6b6558" }}>{u.usuario}</div>
            </div>
            {isAdmin ? (
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                <Field label="Rol">
                  <select style={{ ...inputStyle, minWidth: 140 }} value={u.rol} onChange={(e) => changeRol(u, e.target.value)}>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROL_LABEL[r]}</option>
                    ))}
                  </select>
                </Field>
                {u.usuario !== session.usuario && (
                  <button onClick={() => toggleActivo(u)} style={{ ...smallActionStyle, color: u.activo === false ? COLORS.green : COLORS.rust, marginLeft: "auto" }}>
                    {u.activo === false ? "Reactivar" : "Deshabilitar"}
                  </button>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 8, fontSize: 12.5, color: "#4c473d" }}>{ROL_LABEL[u.rol] || u.rol}</div>
            )}
          </Ticket>
        ))}
      </div>

      {showAdd && (
        <Modal title="Nuevo usuario" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Nombre completo">
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Usuario">
              <input style={inputStyle} value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
            </Field>
            <Field label="Contraseña provisoria">
              <input type="password" style={inputStyle} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
            <Field label="Rol">
              <select style={inputStyle} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROL_LABEL[r]}</option>
                ))}
              </select>
            </Field>
          </div>
          {error && <p style={{ color: COLORS.rust, fontSize: 12.5, marginTop: 8 }}>{error}</p>}
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addUser}>Crear usuario</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}


function Dashboard({ inventory, orders, requests, workIndex, planosIndex, goTo }) {
  const lowStock = inventory.filter((i) => Number(i.stock) <= Number(i.minimo));
  const openOrders = orders.filter((o) => !["Recibida", "Cancelada"].includes(o.estado));
  const openRequests = requests.filter((r) => r.estado !== "Entregado");
  const openWork = workIndex.filter((w) => w.estado !== "Completado");

  const feed = useMemo(() => {
    const items = [
      ...orders.map((o) => ({ tipo: "Compra", label: o.numero, sub: o.proveedor, fecha: o.fecha, estado: o.estado, go: "compras" })),
      ...requests.map((r) => ({ tipo: "Pedido", label: r.numero, sub: r.obra, fecha: r.fecha, estado: r.estado, go: "pedidos" })),
      ...workIndex.map((w) => ({ tipo: "Trabajo", label: w.numero, sub: w.titulo, fecha: w.fecha, estado: w.estado, go: "trabajos" })),
      ...planosIndex.map((p) => ({ tipo: "Plano", label: p.numero, sub: p.nombre, fecha: p.fecha, estado: p.categoria, go: "planos" })),
    ];
    return items.sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 8);
  }, [orders, requests, workIndex, planosIndex]);

  const stat = (label, value, color, Icon, go) => (
    <button
      onClick={() => goTo(go)}
      style={{
        textAlign: "left", cursor: "pointer", background: COLORS.card, border: `1px solid ${COLORS.line}`,
        borderRadius: 8, padding: "16px 18px", flex: "1 1 180px", minWidth: 160,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b6558" }}>{label}</span>
        <Icon size={16} color={color} />
      </div>
      <div style={{ fontFamily: "'Oswald', sans-serif", fontSize: 34, fontWeight: 700, color: COLORS.ink, marginTop: 4 }}>{value}</div>
    </button>
  );

  function exportAll() {
    exportToExcel("reporte-obra", {
      Inventario: inventory.map((i) => ({ Código: i.codigo, Nombre: i.nombre, Categoría: i.categoria, Stock: i.stock, Unidad: i.unidad, Mínimo: i.minimo })),
      "Órdenes de compra": orders.map((o) => ({ Número: o.numero, Proveedor: o.proveedor, Fecha: o.fecha, Estado: o.estado, Total: o.total, Materiales: o.items.map((it) => `${it.nombre} (${it.cantidad} ${it.unidad})`).join("; ") })),
      "Pedidos de materiales": requests.map((r) => ({ Número: r.numero, Obra: r.obra, Solicitante: r.solicitante, Fecha: r.fecha, Estado: r.estado, Materiales: r.items.map((it) => `${it.nombre} (${it.cantidad} ${it.unidad})`).join("; ") })),
      "Órdenes de trabajo": workIndex.map((w) => ({ Número: w.numero, Título: w.titulo, Responsable: w.responsable, Fecha: w.fecha, Estado: w.estado, Fotos: w.fotoCount || 0 })),
      Planos: planosIndex.map((p) => ({ Número: p.numero, Nombre: p.nombre, Categoría: p.categoria, Versión: p.version, Fecha: p.fecha, Archivos: p.archivoCount || 0 })),
    });
  }

  return (
    <div>
      <SectionHeader
        icon={LayoutDashboard}
        title="Tablero de obra"
        subtitle={`Estado general — ${fmtDate(todayISO())}`}
        action={<ExportButton onClick={exportAll} label="Exportar reporte completo" />}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 22 }}>
        {stat("Órdenes de compra activas", openOrders.length, COLORS.blueprint, ShoppingCart, "compras")}
        {stat("Pedidos de material pendientes", openRequests.length, COLORS.rust, ClipboardList, "pedidos")}
        {stat("Trabajos abiertos", openWork.length, COLORS.safety, HardHat, "trabajos")}
        {stat("Ítems con bajo stock", lowStock.length, COLORS.rust, AlertTriangle, "inventario")}
        {stat("Planos cargados", planosIndex.length, COLORS.blueprint, FileText, "planos")}
      </div>

      {lowStock.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, textTransform: "uppercase", color: COLORS.rust, marginBottom: 8 }}>
            Alerta de inventario
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {lowStock.map((i) => (
              <div key={i.id} style={{ border: `1px solid ${COLORS.rust}`, borderRadius: 6, padding: "6px 10px", fontSize: 12.5, background: "#fff" }}>
                <strong>{i.nombre}</strong> — quedan {i.stock} {i.unidad} (mín. {i.minimo})
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 15, textTransform: "uppercase", color: COLORS.ink, marginBottom: 10 }}>
        Actividad reciente — todos los ítems
      </h3>
      {feed.length === 0 ? (
        <EmptyState text="Todavía no hay órdenes, pedidos ni trabajos cargados. Empieza desde cualquiera de las secciones del menú." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {feed.map((it, idx) => (
            <button
              key={idx}
              onClick={() => goTo(it.go)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "9px 12px",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#6b6558", textTransform: "uppercase", width: 62, flexShrink: 0 }}>{it.tipo}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5, color: COLORS.blueprint, flexShrink: 0 }}>{it.label}</span>
                <span style={{ fontSize: 13, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span style={{ fontSize: 11.5, color: "#6b6558" }}>{fmtDate(it.fecha)}</span>
                <StampBadge estado={it.estado} tone={ESTADO_TONE[it.estado]} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= INVENTARIO ================= */

function Inventario({ items, setItems }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ codigo: "", nombre: "", unidad: "", stock: "", minimo: "", categoria: "" });

  // Antes: persist() guardaba todo el arreglo entero en window.storage.
  // Ahora: cada acción llama a un endpoint específico de la API, y el
  // backend SQL se encarga de guardar el cambio. Recargamos la lista
  // desde el servidor después de cada cambio para reflejar la verdad
  // que quedó guardada en la base de datos.
  async function recargar() {
    const data = await apiGet("/inventario");
    setItems(data);
  }

  async function addItem() {
    if (!form.nombre.trim()) return;
    await apiPost("/inventario", {
      codigo: form.codigo || null,
      nombre: form.nombre,
      unidad: form.unidad || "u",
      stock: Number(form.stock) || 0,
      minimo: Number(form.minimo) || 0,
      categoria: form.categoria,
    });
    await recargar();
    setForm({ codigo: "", nombre: "", unidad: "", stock: "", minimo: "", categoria: "" });
    setShowAdd(false);
  }

  async function adjust(id, delta) {
    await apiPatch(`/inventario/${id}/stock`, { delta });
    await recargar();
  }

  async function remove(id) {
    await apiDelete(`/inventario/${id}`);
    await recargar();
  }

  return (
    <div>
      <SectionHeader
        icon={Boxes}
        title="Inventario"
        subtitle="Materiales y stock disponible en obra"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("inventario", {
                  Inventario: items.map((i) => ({ Código: i.codigo, Nombre: i.nombre, Categoría: i.categoria, Stock: i.stock, Unidad: i.unidad, Mínimo: i.minimo })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo ítem</PrimaryButton>
          </div>
        }
      />
      {items.length === 0 ? (
        <EmptyState text="No hay materiales registrados todavía. Agrega el primer ítem del inventario." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {items.map((i) => {
            const low = Number(i.stock) <= Number(i.minimo);
            return (
              <Ticket key={i.id} numero={i.codigo} right={low ? <StampBadge estado="Bajo stock" tone={COLORS.rust} /> : null}>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: COLORS.ink }}>{i.nombre}</div>
                  {i.categoria && <div style={{ fontSize: 12, color: "#6b6558" }}>{i.categoria}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <button onClick={() => adjust(i.id, -1)} style={{ ...iconBtnStyle }}><Minus size={14} /></button>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 600, minWidth: 60, textAlign: "center" }}>
                      {i.stock} {i.unidad}
                    </span>
                    <button onClick={() => adjust(i.id, 1)} style={{ ...iconBtnStyle }}><Plus size={14} /></button>
                    <span style={{ fontSize: 11.5, color: "#8a8578", marginLeft: "auto" }}>mín. {i.minimo}</span>
                  </div>
                </div>
                <button onClick={() => remove(i.id)} style={{ ...ghostDeleteStyle }}><Trash2 size={13} /> Eliminar</button>
              </Ticket>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuevo ítem de inventario" onClose={() => setShowAdd(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Nombre del material">
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Cemento gris" />
            </Field>
            <Field label="Código (opcional)">
              <input style={inputStyle} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Auto" />
            </Field>
            <Field label="Categoría">
              <input style={inputStyle} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Estructura" />
            </Field>
            <Field label="Unidad">
              <input style={inputStyle} value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} placeholder="bolsa / m3 / u" />
            </Field>
            <Field label="Stock inicial">
              <input type="number" style={inputStyle} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
            </Field>
            <Field label="Stock mínimo">
              <input type="number" style={inputStyle} value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
            </Field>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addItem}>Guardar ítem</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

const iconBtnStyle = {
  border: `1px solid ${COLORS.line}`, background: "#fff", borderRadius: 5, width: 26, height: 26,
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.ink,
};
const ghostDeleteStyle = {
  marginTop: 10, background: "none", border: "none", color: "#9b5a44", fontSize: 12, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 4, padding: 0,
};

/* ================= ÓRDENES DE COMPRA ================= */

const COMPRA_ESTADOS = ["Pendiente", "Aprobada", "Enviada", "Recibida", "Cancelada"];

function ItemRows({ rows, setRows }) {
  function update(i, field, val) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  }
  function add() {
    setRows([...rows, { nombre: "", cantidad: "", unidad: "", precio: "" }]);
  }
  function remove(i) {
    setRows(rows.filter((_, idx) => idx !== i));
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.9fr auto", gap: 6 }}>
          <input style={inputStyle} placeholder="Material" value={r.nombre} onChange={(e) => update(i, "nombre", e.target.value)} />
          <input style={inputStyle} placeholder="Cant." type="number" value={r.cantidad} onChange={(e) => update(i, "cantidad", e.target.value)} />
          <input style={inputStyle} placeholder="Unidad" value={r.unidad} onChange={(e) => update(i, "unidad", e.target.value)} />
          <input style={inputStyle} placeholder="Precio" type="number" value={r.precio} onChange={(e) => update(i, "precio", e.target.value)} />
          <button onClick={() => remove(i)} style={{ ...iconBtnStyle, color: "#9b5a44" }}><X size={13} /></button>
        </div>
      ))}
      <button onClick={add} style={{ alignSelf: "flex-start", background: "none", border: "none", color: COLORS.blueprint, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
        <Plus size={13} /> Agregar línea
      </button>
    </div>
  );
}

function Compras({ orders, setOrders }) {
  const [showAdd, setShowAdd] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [obra, setObra] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [moneda, setMoneda] = useState("PYG");
  const [rows, setRows] = useState([{ nombre: "", cantidad: "", unidad: "", precio: "" }]);

  async function recargar() {
    const data = await apiGet("/ordenes-compra");
    setOrders(data);
  }

  async function addOrder() {
    if (!proveedor.trim()) return;
    const items = rows
      .filter((r) => r.nombre.trim())
      .map((r) => ({
        nombre: r.nombre,
        cantidad: Number(r.cantidad) || 0,
        unidad: r.unidad,
        precio: Number(r.precio) || 0,
      }));
    await apiPost("/ordenes-compra", {
      proveedor,
      obra: obra.trim(),
      fecha,
      moneda,
      items,
    });
    await recargar();
    setProveedor(""); setObra(""); setFecha(todayISO()); setMoneda("PYG"); setRows([{ nombre: "", cantidad: "", unidad: "", precio: "" }]);
    setShowAdd(false);
  }

  async function setEstado(o, estado) {
    await apiPatch(`/ordenes-compra/${o.id}/estado`, { estado });
    await recargar();
  }
  async function remove(id) {
    await apiDelete(`/ordenes-compra/${id}`);
    await recargar();
  }

  return (
    <div>
      <SectionHeader
        icon={ShoppingCart}
        title="Órdenes de compra"
        subtitle="Gestión de compras a proveedores"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("ordenes-de-compra", {
                  Compras: orders.map((o) => ({ Número: o.numero, Obra: o.obra, Proveedor: o.proveedor, Fecha: o.fecha, Estado: o.estado, Moneda: o.moneda || "PYG", Total: o.total, Materiales: o.items.map((it) => `${it.nombre} (${it.cantidad} ${it.unidad})`).join("; ") })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nueva orden</PrimaryButton>
          </div>
        }
      />
      {orders.length === 0 ? (
        <EmptyState text="No hay órdenes de compra todavía. Crea la primera para un proveedor." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...orders].reverse().map((o) => (
            <Ticket key={o.id} numero={o.numero} right={<StampBadge estado={o.estado} tone={ESTADO_TONE[o.estado]} />}>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{o.proveedor}</div>
                  <div style={{ fontSize: 12, color: "#6b6558" }}>{fmtDate(o.fecha)} · {o.items.length} materiales</div>
                  {o.obra && <div style={{ fontSize: 11.5, color: COLORS.blueprint, marginTop: 2, fontWeight: 600 }}>Obra: {o.obra}</div>}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                  {fmtMoney(o.total, o.moneda)}
                </div>
              </div>
              {o.items.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "#4c473d" }}>
                  {o.items.map((it, i) => (
                    <div key={i}>· {it.nombre} — {it.cantidad} {it.unidad}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <Field label="Cambiar estado">
                  <select style={{ ...inputStyle, minWidth: 150 }} value={o.estado} onChange={(e) => setEstado(o, e.target.value)}>
                    {COMPRA_ESTADOS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </Field>
                <button onClick={() => remove(o.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto", alignSelf: "flex-end" }}><Trash2 size={13} /> Eliminar</button>
              </div>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nueva orden de compra" onClose={() => setShowAdd(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <Field label="Proveedor">
              <input style={inputStyle} value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Ferretería Central" />
            </Field>
            <Field label="Obra / proyecto">
              <input style={inputStyle} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Torre Central" />
            </Field>
            <Field label="Fecha">
              <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Moneda">
              <select style={inputStyle} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>{m === "PYG" ? "Guaraníes (₲)" : "Dólares (US$)"}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Materiales">
            <div />
          </Field>
          <ItemRows rows={rows} setRows={setRows} />
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addOrder}>Crear orden</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

const smallActionStyle = {
  background: "none", border: "none", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
  display: "inline-flex", alignItems: "center", gap: 3, padding: 0,
};

/* ================= PEDIDOS DE MATERIALES ================= */

const PEDIDO_ESTADOS = ["Solicitado", "Aprobado", "En tránsito", "Entregado"];

function Pedidos({ requests, setRequests }) {
  const [showAdd, setShowAdd] = useState(false);
  const [obra, setObra] = useState("");
  const [solicitante, setSolicitante] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [rows, setRows] = useState([{ nombre: "", cantidad: "", unidad: "" }]);

  async function recargar() {
    const data = await apiGet("/pedidos-materiales");
    setRequests(data);
  }

  async function addRequest() {
    if (!obra.trim()) return;
    const items = rows
      .filter((r) => r.nombre.trim())
      .map((r) => ({ nombre: r.nombre, cantidad: Number(r.cantidad) || 0, unidad: r.unidad }));
    await apiPost("/pedidos-materiales", { obra, solicitante, fecha, items });
    await recargar();
    setObra(""); setSolicitante(""); setFecha(todayISO()); setRows([{ nombre: "", cantidad: "", unidad: "" }]);
    setShowAdd(false);
  }

  async function setEstado(r, estado) {
    await apiPatch(`/pedidos-materiales/${r.id}/estado`, { estado });
    await recargar();
  }
  async function remove(id) {
    await apiDelete(`/pedidos-materiales/${id}`);
    await recargar();
  }

  function updRow(i, field, val) {
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));
  }

  return (
    <div>
      <SectionHeader
        icon={ClipboardList}
        title="Pedidos de materiales"
        subtitle="Solicitudes de materiales para el sitio de obra"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("pedidos-de-materiales", {
                  Pedidos: requests.map((r) => ({ Número: r.numero, Obra: r.obra, Solicitante: r.solicitante, Fecha: r.fecha, Estado: r.estado, Materiales: r.items.map((it) => `${it.nombre} (${it.cantidad} ${it.unidad})`).join("; ") })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo pedido</PrimaryButton>
          </div>
        }
      />
      {requests.length === 0 ? (
        <EmptyState text="No hay pedidos de materiales registrados. Crea uno para solicitar insumos al sitio." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...requests].reverse().map((r) => (
            <Ticket key={r.id} numero={r.numero} right={<StampBadge estado={r.estado} tone={ESTADO_TONE[r.estado]} />}>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{r.obra}</div>
                  <div style={{ fontSize: 12, color: "#6b6558" }}>{fmtDate(r.fecha)}{r.solicitante ? ` · Solicita: ${r.solicitante}` : ""}</div>
                </div>
              </div>
              {r.items.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12.5, color: "#4c473d" }}>
                  {r.items.map((it, i) => (
                    <div key={i}>· {it.nombre} — {it.cantidad} {it.unidad}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <Field label="Cambiar estado">
                  <select style={{ ...inputStyle, minWidth: 150 }} value={r.estado} onChange={(e) => setEstado(r, e.target.value)}>
                    {PEDIDO_ESTADOS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </Field>
                <button onClick={() => remove(r.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto", alignSelf: "flex-end" }}><Trash2 size={13} /> Eliminar</button>
              </div>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuevo pedido de materiales" onClose={() => setShowAdd(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
            <Field label="Obra / área">
              <input style={inputStyle} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Torre B - Piso 4" />
            </Field>
            <Field label="Solicitante">
              <input style={inputStyle} value={solicitante} onChange={(e) => setSolicitante(e.target.value)} placeholder="Nombre" />
            </Field>
            <Field label="Fecha">
              <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6 }}>
                <input style={inputStyle} placeholder="Material" value={r.nombre} onChange={(e) => updRow(i, "nombre", e.target.value)} />
                <input style={inputStyle} placeholder="Cant." type="number" value={r.cantidad} onChange={(e) => updRow(i, "cantidad", e.target.value)} />
                <input style={inputStyle} placeholder="Unidad" value={r.unidad} onChange={(e) => updRow(i, "unidad", e.target.value)} />
                <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} style={{ ...iconBtnStyle, color: "#9b5a44" }}><X size={13} /></button>
              </div>
            ))}
            <button onClick={() => setRows([...rows, { nombre: "", cantidad: "", unidad: "" }])} style={{ alignSelf: "flex-start", background: "none", border: "none", color: COLORS.blueprint, fontSize: 12.5, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "4px 0" }}>
              <Plus size={13} /> Agregar línea
            </button>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addRequest}>Crear pedido</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ================= TRABAJOS (con fotos) ================= */

const TRABAJO_ESTADOS = ["Pendiente", "En proceso", "Pausado", "Completado"];
const ESTADO_ICON = { Pendiente: Clock, "En proceso": HardHat, Pausado: PauseCircle, Completado: CheckCircle2 };

const PRESUPUESTO_ESTADOS = ["Activo", "Finalizado", "Cancelado"];

function Presupuestos({ presupuestos, setPresupuestos }) {
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null);
  const [contratista, setContratista] = useState("");
  const [obra, setObra] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [montoTotal, setMontoTotal] = useState("");
  const [moneda, setMoneda] = useState("PYG");
  const [fecha, setFecha] = useState(todayISO());

  const [showCert, setShowCert] = useState(false);
  const [certFecha, setCertFecha] = useState(todayISO());
  const [certArquitecto, setCertArquitecto] = useState("");
  const [certPorcentaje, setCertPorcentaje] = useState("");
  const [certObs, setCertObs] = useState("");
  const [certError, setCertError] = useState("");

  async function recargar() {
    const data = await apiGet("/presupuestos");
    setPresupuestos(data);
    if (detail) setDetail(data.find((p) => p.id === detail.id) || null);
    return data;
  }

  async function addPresupuesto() {
    if (!contratista.trim() || !montoTotal) return;
    await apiPost("/presupuestos", {
      contratista, obra, descripcion, monto_total: Number(montoTotal) || 0, moneda, fecha,
    });
    await recargar();
    setContratista(""); setObra(""); setDescripcion(""); setMontoTotal(""); setMoneda("PYG"); setFecha(todayISO());
    setShowAdd(false);
  }

  async function setEstado(p, estado) {
    await apiPatch(`/presupuestos/${p.id}/estado`, { estado });
    await recargar();
  }

  async function remove(id) {
    await apiDelete(`/presupuestos/${id}`);
    await recargar();
    if (detail && detail.id === id) setDetail(null);
  }

  function openDetail(p) {
    setDetail(p);
  }

  async function addCertificacion() {
    if (!certPorcentaje || !detail) return;
    setCertError("");
    try {
      await apiPost(`/presupuestos/${detail.id}/certificaciones`, {
        fecha: certFecha, arquitecto: certArquitecto, porcentaje_avance: Number(certPorcentaje), observaciones: certObs,
      });
      await recargar();
      setCertFecha(todayISO()); setCertArquitecto(""); setCertPorcentaje(""); setCertObs("");
      setShowCert(false);
    } catch (e) {
      setCertError("No se pudo certificar. Verificá que el % sea mayor al de la última certificación.");
    }
  }

  async function setEstadoPagoCert(certId, estado_pago) {
    await apiPatch(`/certificaciones/${certId}/estado-pago`, { estado_pago });
    await recargar();
  }

  async function removeCert(certId) {
    await apiDelete(`/certificaciones/${certId}`);
    await recargar();
  }

  function saldoPendiente(p) {
    const ultima = p.certificaciones[p.certificaciones.length - 1];
    const certificado = ultima ? Number(ultima.monto_acumulado) : 0;
    return Number(p.monto_total) - certificado;
  }
  function porcentajeActual(p) {
    const ultima = p.certificaciones[p.certificaciones.length - 1];
    return ultima ? Number(ultima.porcentaje_avance) : 0;
  }

  return (
    <div>
      <SectionHeader
        icon={Handshake}
        title="Presupuestos y certificaciones"
        subtitle="Contratos con contratistas y avance de obra certificado"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("presupuestos", {
                  Presupuestos: presupuestos.map((p) => ({
                    Número: p.numero, Contratista: p.contratista, Obra: p.obra,
                    "Monto total": p.monto_total, Moneda: p.moneda,
                    "% Avance certificado": porcentajeActual(p),
                    "Saldo pendiente": saldoPendiente(p), Estado: p.estado,
                  })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo presupuesto</PrimaryButton>
          </div>
        }
      />

      {presupuestos.length === 0 ? (
        <EmptyState text="No hay presupuestos todavía. Creá el primero para un contratista." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[...presupuestos].reverse().map((p) => (
            <Ticket key={p.id} numero={p.numero} right={<StampBadge estado={p.estado} tone={ESTADO_TONE[p.estado]} />}>
              <div onClick={() => openDetail(p)} style={{ cursor: "pointer", marginTop: 8, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.contratista}</div>
                  <div style={{ fontSize: 12, color: "#6b6558" }}>{fmtDate(p.fecha)} {p.obra && `· Obra: ${p.obra}`}</div>
                  <div style={{ fontSize: 12, color: COLORS.blueprint, marginTop: 3, fontWeight: 600 }}>
                    Avance certificado: {porcentajeActual(p)}%
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 16, fontWeight: 700 }}>
                    {fmtMoney(p.monto_total, p.moneda)}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.rust, marginTop: 2 }}>
                    Saldo: {fmtMoney(saldoPendiente(p), p.moneda)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                <Field label="Estado">
                  <select style={{ ...inputStyle, minWidth: 130 }} value={p.estado} onChange={(e) => setEstado(p, e.target.value)}>
                    {PRESUPUESTO_ESTADOS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </Field>
                <button onClick={() => openDetail(p)} style={{ ...inputStyle, width: "auto", cursor: "pointer", marginTop: 0 }}>Ver certificaciones</button>
                <button onClick={() => remove(p.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto", alignSelf: "flex-end" }}><Trash2 size={13} /> Eliminar</button>
              </div>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuevo presupuesto" onClose={() => setShowAdd(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Contratista">
              <input style={inputStyle} value={contratista} onChange={(e) => setContratista(e.target.value)} placeholder="Constructora ABC" />
            </Field>
            <Field label="Obra / proyecto">
              <input style={inputStyle} value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Torre Central" />
            </Field>
            <Field label="Monto total">
              <input type="number" style={inputStyle} value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Moneda">
              <select style={inputStyle} value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {MONEDAS.map((m) => (
                  <option key={m} value={m}>{m === "PYG" ? "Guaraníes (₲)" : "Dólares (US$)"}</option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
          </div>
          <Field label="Descripción del trabajo contratado">
            <textarea style={{ ...inputStyle, minHeight: 60 }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Estructura, mampostería, instalaciones..." />
          </Field>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addPresupuesto}>Crear presupuesto</PrimaryButton>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`${detail.numero} · ${detail.contratista}`} onClose={() => { setDetail(null); setShowCert(false); setCertError(""); }} wide>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, color: "#6b6558" }}>{detail.obra}</div>
              {detail.descripcion && <div style={{ fontSize: 13, marginTop: 4 }}>{detail.descripcion}</div>}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#6b6558" }}>Monto total</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700 }}>{fmtMoney(detail.monto_total, detail.moneda)}</div>
              <div style={{ fontSize: 12, color: COLORS.rust, marginTop: 2 }}>Saldo pendiente: {fmtMoney(saldoPendiente(detail), detail.moneda)}</div>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Certificaciones de avance</div>
            <PrimaryButton onClick={() => setShowCert(true)}>Certificar avance</PrimaryButton>
          </div>

          {detail.certificaciones.length === 0 ? (
            <EmptyState text="Todavía no hay certificaciones. El arquitecto registra acá cada avance de obra verificado." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...detail.certificaciones].reverse().map((c) => (
                <div key={c.id} style={{ border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 10, background: "#fff" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.numero} · {fmtDate(c.fecha)}</div>
                      {c.arquitecto && <div style={{ fontSize: 12, color: "#6b6558" }}>Certificado por: {c.arquitecto}</div>}
                    </div>
                    <StampBadge estado={c.estado_pago} tone={ESTADO_TONE[c.estado_pago]} />
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b6558" }}>Avance acumulado</div>
                      <div style={{ fontWeight: 700 }}>{c.porcentaje_avance}%</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#6b6558" }}>A pagar en esta etapa</div>
                      <div style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtMoney(c.monto_periodo, detail.moneda)}</div>
                    </div>
                  </div>
                  {c.observaciones && <div style={{ fontSize: 12.5, marginTop: 6, color: "#4c473d" }}>{c.observaciones}</div>}
                  <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                    <select style={{ ...inputStyle, minWidth: 130, marginTop: 0 }} value={c.estado_pago} onChange={(e) => setEstadoPagoCert(c.id, e.target.value)}>
                      <option value="Pendiente">Pendiente</option>
                      <option value="Pagado">Pagado</option>
                    </select>
                    <button onClick={() => removeCert(c.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto" }}><Trash2 size={13} /> Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showCert && (
            <Modal title="Certificar avance de obra" onClose={() => { setShowCert(false); setCertError(""); }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Fecha">
                  <input type="date" style={inputStyle} value={certFecha} onChange={(e) => setCertFecha(e.target.value)} />
                </Field>
                <Field label="Certificado por (arquitecto)">
                  <input style={inputStyle} value={certArquitecto} onChange={(e) => setCertArquitecto(e.target.value)} placeholder="Arq. Nombre" />
                </Field>
              </div>
              <Field label={`% de avance ACUMULADO a la fecha (último certificado: ${porcentajeActual(detail)}%)`}>
                <input type="number" min="0" max="100" style={inputStyle} value={certPorcentaje} onChange={(e) => setCertPorcentaje(e.target.value)} placeholder="Ej: 45" />
              </Field>
              <Field label="Observaciones">
                <textarea style={{ ...inputStyle, minHeight: 50 }} value={certObs} onChange={(e) => setCertObs(e.target.value)} placeholder="Detalle de lo verificado en obra..." />
              </Field>
              {certError && <div style={{ color: COLORS.rust, fontSize: 12.5, marginTop: 6 }}>{certError}</div>}
              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <PrimaryButton onClick={addCertificacion}>Guardar certificación</PrimaryButton>
              </div>
            </Modal>
          )}
        </Modal>
      )}
    </div>
  );
}

function Trabajos({ workIndex, setWorkIndex }) {
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null); // registro completo que se está viendo
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [responsable, setResponsable] = useState("");
  const [fecha, setFecha] = useState(todayISO());
  const [uploading, setUploading] = useState(false);

  // La API ya devuelve cada trabajo con sus fotos incluidas, así que no
  // hace falta un "índice liviano" separado del "detalle completo": todo
  // vive en una sola tabla SQL con relación 1-a-muchos (trabajo -> fotos).
  async function recargar() {
    const data = await apiGet("/trabajos");
    setWorkIndex(data);
    if (detail) {
      const actualizado = data.find((w) => w.id === detail.id);
      setDetail(actualizado || null);
    }
    return data;
  }

  async function addWork() {
    if (!titulo.trim()) return;
    await apiPost("/trabajos", { titulo, descripcion, responsable, fecha });
    await recargar();
    setTitulo(""); setDescripcion(""); setResponsable(""); setFecha(todayISO());
    setShowAdd(false);
  }

  function openDetail(w) {
    setDetail(w);
  }

  async function setEstado(w, estado) {
    await apiPatch(`/trabajos/${w.id}/estado`, { estado });
    await recargar();
  }

  async function handlePhotos(files) {
    if (!files || !files.length || !detail) return;
    setUploading(true);
    try {
      await apiUpload(`/trabajos/${detail.id}/fotos`, Array.from(files));
      await recargar();
    } catch (e) {
      console.error(e);
    }
    setUploading(false);
  }

  async function removePhoto(fotoId) {
    await apiDelete(`/trabajos/${detail.id}/fotos/${fotoId}`);
    await recargar();
  }

  async function removeWork(id) {
    await apiDelete(`/trabajos/${id}`);
    await recargar();
    if (detail && detail.id === id) setDetail(null);
  }

  return (
    <div>
      <SectionHeader
        icon={HardHat}
        title="Órdenes de trabajo"
        subtitle="Tareas en obra con registro fotográfico"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("ordenes-de-trabajo", {
                  Trabajos: workIndex.map((w) => ({ Número: w.numero, Título: w.titulo, Responsable: w.responsable, Fecha: w.fecha, Estado: w.estado, Fotos: (w.fotos || []).length })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo trabajo</PrimaryButton>
          </div>
        }
      />
      {workIndex.length === 0 ? (
        <EmptyState text="No hay órdenes de trabajo todavía. Crea una y podrás adjuntar fotos del avance." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {[...workIndex].reverse().map((w) => {
            const Icon = ESTADO_ICON[w.estado] || Clock;
            return (
              <Ticket key={w.id} numero={w.numero} right={<StampBadge estado={w.estado} tone={ESTADO_TONE[w.estado] || COLORS.ink} />}>
                <button onClick={() => openDetail(w)} style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", width: "100%", padding: 0, marginTop: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{w.titulo}</div>
                  <div style={{ fontSize: 12, color: "#6b6558", marginTop: 2 }}>{fmtDate(w.fecha)}{w.responsable ? ` · ${w.responsable}` : ""}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: COLORS.blueprint }}>
                    <Camera size={13} /> {(w.fotos || []).length} foto{(w.fotos || []).length === 1 ? "" : "s"}
                  </div>
                </button>
              </Ticket>
            );
          })}
        </div>
      )}

      {showAdd && (
        <Modal title="Nueva orden de trabajo" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Título del trabajo">
              <input style={inputStyle} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Encofrado de columnas - Piso 3" />
            </Field>
            <Field label="Descripción">
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Responsable">
                <input style={inputStyle} value={responsable} onChange={(e) => setResponsable(e.target.value)} />
              </Field>
              <Field label="Fecha">
                <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addWork}>Crear orden de trabajo</PrimaryButton>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.numero} onClose={() => setDetail(null)} wide>
          {!detail ? (
            <Loading />
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{detail.titulo}</div>
                  <div style={{ fontSize: 12.5, color: "#6b6558", marginTop: 2 }}>{fmtDate(detail.fecha)}{detail.responsable ? ` · ${detail.responsable}` : ""}</div>
                </div>
                <StampBadge estado={detail.estado} tone={ESTADO_TONE[detail.estado] || COLORS.ink} />
              </div>
              {detail.descripcion && <p style={{ fontSize: 13.5, color: "#4c473d", marginTop: 10 }}>{detail.descripcion}</p>}

              <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "flex-end" }}>
                <Field label="Cambiar estado">
                  <select style={{ ...inputStyle, minWidth: 150 }} value={detail.estado} onChange={(e) => setEstado(detail, e.target.value)}>
                    {TRABAJO_ESTADOS.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </Field>
                <button onClick={() => removeWork(detail.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto" }}><Trash2 size={13} /> Eliminar trabajo</button>
              </div>

              <div style={{ marginTop: 18, borderTop: `1px solid ${COLORS.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>Fotos del trabajo</h4>
                  <label style={{ ...smallActionStyle, color: COLORS.safety, cursor: "pointer" }}>
                    <Camera size={14} /> {uploading ? "Subiendo…" : "Escanear / subir fotos"}
                    <input type="file" accept="image/*" capture="environment" multiple style={{ display: "none" }} disabled={uploading} onChange={(e) => handlePhotos(e.target.files)} />
                  </label>
                </div>
                {detail.fotos.length === 0 ? (
                  <EmptyState text="Todavía no hay fotos. Usa la cámara para registrar el avance del trabajo." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8 }}>
                    {detail.fotos.map((f) => (
                      <div key={f.id} style={{ position: "relative" }}>
                        <img src={`${API_URL}${f.url_archivo}`} alt="Foto del trabajo" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.line}` }} />
                        <button onClick={() => removePhoto(f.id)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(33,31,27,0.7)", border: "none", borderRadius: 4, color: "#fff", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ================= PLANOS (memoria de obra) ================= */

const PLANO_CATEGORIAS = ["Arquitectónico", "Estructural", "Eléctrico", "Sanitario", "Instalaciones", "Otro"];

function Planos({ planosIndex, setPlanosIndex }) {
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(PLANO_CATEGORIAS[0]);
  const [version, setVersion] = useState("Rev. A");
  const [fecha, setFecha] = useState(todayISO());
  const [notas, setNotas] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function recargar() {
    const data = await apiGet("/planos");
    setPlanosIndex(data);
    if (detail) {
      const actualizado = data.find((p) => p.id === detail.id);
      setDetail(actualizado || null);
    }
    return data;
  }

  async function addPlano() {
    if (!nombre.trim()) return;
    await apiPost("/planos", { nombre, categoria, version, fecha, notas });
    await recargar();
    setNombre(""); setCategoria(PLANO_CATEGORIAS[0]); setVersion("Rev. A"); setFecha(todayISO()); setNotas("");
    setShowAdd(false);
  }

  function openDetail(p) {
    setDetail(p);
  }

  async function handleFiles(files) {
    if (!files || !files.length || !detail) return;
    setUploading(true);
    setUploadError("");
    try {
      await apiUpload(`/planos/${detail.id}/archivos`, Array.from(files));
      await recargar();
    } catch (e) {
      setUploadError(e.message || "No se pudo subir el archivo.");
    }
    setUploading(false);
  }

  async function removeArchivo(archivoId) {
    await apiDelete(`/planos/${detail.id}/archivos/${archivoId}`);
    await recargar();
  }

  async function removePlano(id) {
    await apiDelete(`/planos/${id}`);
    await recargar();
    if (detail && detail.id === id) setDetail(null);
  }

  return (
    <div>
      <SectionHeader
        icon={FileText}
        title="Planos y memoria de obra"
        subtitle="Documentación técnica del proyecto: planos, revisiones y versiones"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("planos-memoria-de-obra", {
                  Planos: planosIndex.map((p) => ({ Número: p.numero, Nombre: p.nombre, Categoría: p.categoria, Versión: p.version, Fecha: p.fecha, Archivos: (p.archivos || []).length })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo plano</PrimaryButton>
          </div>
        }
      />

      <div style={{ marginBottom: 16, fontSize: 12.5, color: "#6b6558", display: "flex", gap: 6, alignItems: "flex-start" }}>
        <AlertTriangle size={14} color={COLORS.rust} style={{ flexShrink: 0, marginTop: 1 }} />
        Sube imágenes de los planos (foto o escaneo) para mejor rendimiento. Los PDF se aceptan hasta ~4 MB; para archivos más pesados, mejor comparte un enlace de Drive/Dropbox en las notas.
      </div>

      {planosIndex.length === 0 ? (
        <EmptyState text="No hay planos cargados todavía. Agrega el primero para empezar la memoria de obra." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {[...planosIndex].reverse().map((p) => (
            <Ticket key={p.id} numero={p.numero} right={<StampBadge estado={p.categoria} tone={COLORS.blueprint} />}>
              <button onClick={() => openDetail(p)} style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", width: "100%", padding: 0, marginTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nombre}</div>
                <div style={{ fontSize: 12, color: "#6b6558", marginTop: 2 }}>{p.version} · {fmtDate(p.fecha)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: COLORS.blueprint }}>
                  <FileText size={13} /> {(p.archivos || []).length} archivo{(p.archivos || []).length === 1 ? "" : "s"}
                </div>
              </button>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuevo plano" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Nombre del plano">
              <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Planta baja - Estructura" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Categoría">
                <select style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {PLANO_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Versión / revisión">
                <input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Rev. A" />
              </Field>
            </div>
            <Field label="Fecha">
              <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Field>
            <Field label="Notas">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Enlace externo, observaciones, etc." />
            </Field>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addPlano}>Crear plano</PrimaryButton>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.numero} onClose={() => { setDetail(null); setUploadError(""); }} wide>
          {!detail ? (
            <Loading />
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{detail.nombre}</div>
                  <div style={{ fontSize: 12.5, color: "#6b6558", marginTop: 2 }}>{detail.version} · {fmtDate(detail.fecha)}</div>
                </div>
                <StampBadge estado={detail.categoria} tone={COLORS.blueprint} />
              </div>
              {detail.notas && <p style={{ fontSize: 13.5, color: "#4c473d", marginTop: 10 }}>{detail.notas}</p>}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => removePlano(detail.id)} style={{ ...ghostDeleteStyle, marginTop: 0 }}><Trash2 size={13} /> Eliminar plano</button>
              </div>

              <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>Archivos</h4>
                  <label style={{ ...smallActionStyle, color: COLORS.safety, cursor: "pointer" }}>
                    <Upload size={14} /> {uploading ? "Subiendo…" : "Subir imagen o PDF"}
                    <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} disabled={uploading} onChange={(e) => handleFiles(e.target.files)} />
                  </label>
                </div>
                {uploadError && (
                  <div style={{ fontSize: 12.5, color: COLORS.rust, marginBottom: 10, display: "flex", gap: 6 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {uploadError}
                  </div>
                )}
                {detail.archivos.length === 0 ? (
                  <EmptyState text="Todavía no hay archivos. Sube una foto del plano o un PDF liviano." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                    {detail.archivos.map((a) => (
                      <div key={a.id} style={{ position: "relative" }}>
                        {a.tipo === "imagen" ? (
                          <img src={`${API_URL}${a.url_archivo}`} alt={a.nombre_archivo} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.line}` }} />
                        ) : (
                          <a href={`${API_URL}${a.url_archivo}`} download={a.nombre_archivo} target="_blank" rel="noreferrer" style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                            width: "100%", height: 120, borderRadius: 6, border: `1px solid ${COLORS.line}`, background: "#fff",
                            color: COLORS.blueprint, textDecoration: "none", fontSize: 11, textAlign: "center", padding: 6,
                          }}>
                            <FileText size={22} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{a.nombre_archivo}</span>
                          </a>
                        )}
                        <button onClick={() => removeArchivo(a.id)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(33,31,27,0.7)", border: "none", borderRadius: 4, color: "#fff", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ================= APP ================= */

/* ================= MÓDULO GENÉRICO (para Comercial y Administración) ================= */

function GenericModule({ storageKey, prefix, title, moduleLabel, subtitle, icon, primaryLabel, fields, estados, items, setItems, balanceLabel, balanceFn }) {
  const [showAdd, setShowAdd] = useState(false);
  // El nombre del sub-módulo en la API se deriva del storageKey original
  // (ej: "sitework:cobranzas" -> "cobranzas"), así cada uno de los 8
  // sub-módulos de Comercial/Administración queda filtrado por separado
  // en la misma tabla genérica del backend.
  const modulo = storageKey.replace("sitework:", "");
  const blankForm = () =>
    Object.fromEntries(
      fields.flatMap((f) => (f.currency ? [[f.key, ""], [`${f.key}_moneda`, "PYG"]] : [[f.key, ""]]))
    );
  const [form, setForm] = useState(blankForm);

  async function recargar() {
    const data = await apiGet(`/modulo/${modulo}`);
    setItems(data);
  }
  async function addItem() {
    const first = fields[0].key;
    if (!String(form[first] || "").trim()) return;
    await apiPost(`/modulo/${modulo}`, {
      ...form,
      _prefijo: prefix,
      ...(estados ? { _estado_inicial: estados[0] } : {}),
    });
    await recargar();
    setForm(blankForm());
    setShowAdd(false);
  }
  async function setEstado(it, estado) {
    await apiPatch(`/modulo/${modulo}/${it.id}/estado`, { estado });
    await recargar();
  }
  async function remove(id) {
    await apiDelete(`/modulo/${modulo}/${id}`);
    await recargar();
  }

  const rawBalance = balanceFn ? balanceFn(items) : null;
  const balance = rawBalance === null ? null : typeof rawBalance === "number" ? { PYG: rawBalance, USD: 0 } : rawBalance;

  return (
    <div>
      <SectionHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel(
                  moduleLabel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"),
                  {
                    [moduleLabel]: items.map((it) => {
                      const row = { Número: it.numero };
                      fields.forEach((f) => {
                        row[f.label] = it[f.key];
                        if (f.currency) row[`${f.label} (moneda)`] = it[`${f.key}_moneda`] || "PYG";
                      });
                      if (estados) row.Estado = it.estado;
                      return row;
                    }),
                  }
                )
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>{primaryLabel}</PrimaryButton>
          </div>
        }
      />

      {balance !== null && (
        <div style={{ marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ display: "inline-block", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 16px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6558", textTransform: "uppercase", marginRight: 8 }}>{balanceLabel}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: balance.PYG < 0 ? COLORS.rust : COLORS.ink }}>
              {fmtPYG(balance.PYG)}
            </span>
          </div>
          {balance.USD !== 0 && (
            <div style={{ display: "inline-block", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 16px" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6558", textTransform: "uppercase", marginRight: 8 }}>{balanceLabel} (US$)</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: balance.USD < 0 ? COLORS.rust : COLORS.ink }}>
                {fmtUSD(balance.USD)}
              </span>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState text={`No hay ${moduleLabel.toLowerCase()} registrados todavía. Crea el primero.`} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {[...items].reverse().map((it) => (
            <Ticket key={it.id} numero={it.numero} right={estados ? <StampBadge estado={it.estado} tone={ESTADO_TONE[it.estado] || COLORS.ink} /> : null}>
              <div style={{ marginTop: 8 }}>
                {fields.map((f, idx) => {
                  const val = it[f.key];
                  if (val === undefined || val === "") return null;
                  const display = f.currency ? fmtMoney(val, it[`${f.key}_moneda`]) : f.type === "number" ? Number(val).toLocaleString("es") : val;
                  return idx === 0 ? (
                    <div key={f.key} style={{ fontWeight: 600, fontSize: 15, color: COLORS.ink }}>{display}</div>
                  ) : (
                    <div key={f.key} style={{ fontSize: 12.5, color: "#4c473d", marginTop: 2 }}>
                      <span style={{ color: "#8a8578" }}>{f.label}: </span>{display}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "flex-end" }}>
                {estados && (
                  <Field label="Cambiar estado">
                    <select style={{ ...inputStyle, minWidth: 150 }} value={it.estado} onChange={(e) => setEstado(it, e.target.value)}>
                      {estados.map((e) => (
                        <option key={e} value={e}>{e}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <button onClick={() => remove(it.id)} style={{ ...ghostDeleteStyle, marginTop: 0, marginLeft: "auto" }}><Trash2 size={13} /> Eliminar</button>
              </div>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title={primaryLabel} onClose={() => setShowAdd(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.type === "select" ? (
                  <select style={inputStyle} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}>
                    <option value="">Seleccionar…</option>
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                ) : f.currency ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="number"
                      style={{ ...inputStyle, flex: 1 }}
                      value={form[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      placeholder={f.placeholder || ""}
                    />
                    <select
                      style={{ ...inputStyle, width: 90 }}
                      value={form[`${f.key}_moneda`] || "PYG"}
                      onChange={(e) => setForm({ ...form, [`${f.key}_moneda`]: e.target.value })}
                    >
                      {MONEDAS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <input
                    type={f.type || "text"}
                    style={inputStyle}
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={f.placeholder || ""}
                  />
                )}
              </Field>
            ))}
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addItem}>Guardar</PrimaryButton>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SubTabs({ tabs, active, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", borderBottom: `1px solid ${COLORS.line}`, paddingBottom: 10 }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 6,
              border: `1.5px solid ${isActive ? COLORS.safety : COLORS.line}`,
              background: isActive ? COLORS.safety : "#fff", color: isActive ? "#fff" : COLORS.ink,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'Inter', sans-serif",
            }}
          >
            <t.icon size={14} /> {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ================= COMERCIAL (venta y alquiler de departamentos) ================= */

function Comercial({ unidades, setUnidades, operaciones, setOperaciones, cuoteros, setCuoteros }) {
  const [sub, setSub] = useState("unidades");
  return (
    <div>
      <SectionHeader icon={Building2} title="Comercial" subtitle="Venta y alquiler de departamentos — contado y crédito" />
      <SubTabs
        tabs={[
          { id: "unidades", label: "Unidades", icon: Home },
          { id: "operaciones", label: "Ventas / Alquileres", icon: Handshake },
          { id: "cuoteros", label: "Cuoteros", icon: Lock },
        ]}
        active={sub}
        onChange={setSub}
      />
      {sub === "unidades" ? (
        <GenericModule
          storageKey="sitework:unidades"
          prefix="UN"
          title="Unidades (departamentos)"
          moduleLabel="Unidades"
          subtitle="Catálogo de departamentos disponibles para venta o alquiler"
          icon={Home}
          primaryLabel="Nueva unidad"
          items={unidades}
          setItems={setUnidades}
          fields={[
            { key: "codigo", label: "Código de unidad", placeholder: "Torre A - 101" },
            { key: "edificio", label: "Edificio / proyecto" },
            { key: "piso", label: "Piso" },
            { key: "m2", label: "m²", type: "number" },
            { key: "disponibilidad", label: "Disponible para", type: "select", options: ["Venta", "Alquiler", "Venta y Alquiler"] },
            { key: "precio_venta", label: "Precio de venta", type: "number", currency: true },
            { key: "precio_alquiler", label: "Precio de alquiler mensual", type: "number", currency: true },
          ]}
          estados={["Disponible", "Reservado", "Vendido", "Alquilado"]}
        />
      ) : sub === "operaciones" ? (
        <GenericModule
          storageKey="sitework:operaciones-comerciales"
          prefix="VTA"
          title="Ventas y alquileres"
          moduleLabel="Ventas y alquileres"
          subtitle="Operaciones comerciales — contado, crédito o alquiler"
          icon={Handshake}
          primaryLabel="Nueva operación"
          items={operaciones}
          setItems={setOperaciones}
          fields={[
            { key: "cliente", label: "Cliente" },
            { key: "unidad", label: "Unidad (código)", placeholder: "Torre A - 101" },
            { key: "tipo", label: "Tipo de operación", type: "select", options: ["Venta Contado", "Venta Crédito", "Alquiler"] },
            { key: "monto", label: "Monto", type: "number", currency: true },
            { key: "cuotas", label: "N° de cuotas (si es crédito)", type: "number" },
            { key: "fecha", label: "Fecha", type: "date" },
            { key: "notas", label: "Notas" },
          ]}
          estados={["Activa", "Completada", "Cancelada"]}
          balanceLabel="Total facturado (activas + completadas)"
          balanceFn={(items) => sumByCurrency(items, "monto", { filter: (i) => i.estado !== "Cancelada" })}
        />
      ) : (
        <GenericModule
          storageKey="sitework:cuoteros"
          prefix="CUO"
          title="Cuoteros"
          moduleLabel="Cuoteros"
          subtitle="Planilla de cuotas por compra de departamento (ventas a crédito)"
          icon={Receipt}
          primaryLabel="Nueva cuota"
          items={cuoteros}
          setItems={setCuoteros}
          fields={[
            { key: "cliente", label: "Cliente" },
            { key: "unidad", label: "Unidad (código)", placeholder: "Torre A - 101" },
            { key: "numero_cuota", label: "Cuota N°", type: "number" },
            { key: "total_cuotas", label: "Total de cuotas", type: "number" },
            { key: "monto_cuota", label: "Monto de la cuota", type: "number", currency: true },
            { key: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date" },
          ]}
          estados={["Pendiente", "Pagado", "Vencido"]}
          balanceLabel="Total pendiente de cobro"
          balanceFn={(items) => sumByCurrency(items, "monto_cuota", { filter: (i) => i.estado !== "Pagado" })}
        />
      )}
    </div>
  );
}

/* ================= ADMINISTRACIÓN (proveedores, cobranzas, RH, banco, fondos fijos) ================= */

function Administracion({ proveedores, setProveedores, cobranzas, setCobranzas, rh, setRh, banco, setBanco, fondos, setFondos, contableIndex, setContableIndex }) {
  const [sub, setSub] = useState("proveedores");
  return (
    <div>
      <SectionHeader icon={Landmark} title="Administración" subtitle="Proveedores, cobranzas, RH, banco, fondos fijos y documentación contable" />
      <SubTabs
        tabs={[
          { id: "proveedores", label: "Proveedores", icon: Truck },
          { id: "cobranzas", label: "Cobranzas", icon: Receipt },
          { id: "rh", label: "RH", icon: Users },
          { id: "banco", label: "Banco", icon: Landmark },
          { id: "fondos", label: "Fondos fijos", icon: Wallet },
          { id: "contable", label: "Documentación contable", icon: FileText },
        ]}
        active={sub}
        onChange={setSub}
      />

      {sub === "contable" && <DocumentacionContable index={contableIndex} setIndex={setContableIndex} />}

      {sub === "proveedores" && (
        <GenericModule
          storageKey="sitework:proveedores"
          prefix="PROV"
          title="Proveedores"
          moduleLabel="Proveedores"
          subtitle="Directorio de proveedores"
          icon={Truck}
          primaryLabel="Nuevo proveedor"
          items={proveedores}
          setItems={setProveedores}
          fields={[
            { key: "nombre", label: "Nombre / razón social" },
            { key: "rubro", label: "Rubro" },
            { key: "contacto", label: "Contacto" },
            { key: "telefono", label: "Teléfono" },
            { key: "email", label: "Email" },
          ]}
          estados={["Activo", "Inactivo"]}
        />
      )}

      {sub === "cobranzas" && (
        <GenericModule
          storageKey="sitework:cobranzas"
          prefix="COB"
          title="Cobranzas"
          moduleLabel="Cobranzas"
          subtitle="Cuentas por cobrar a clientes (ventas a crédito y alquileres)"
          icon={Receipt}
          primaryLabel="Nueva cobranza"
          items={cobranzas}
          setItems={setCobranzas}
          fields={[
            { key: "cliente", label: "Cliente" },
            { key: "concepto", label: "Concepto", placeholder: "Cuota 3/12 - Torre A 101" },
            { key: "monto", label: "Monto", type: "number", currency: true },
            { key: "fecha_vencimiento", label: "Fecha de vencimiento", type: "date" },
          ]}
          estados={["Pendiente", "Pagado", "Vencido"]}
          balanceLabel="Pendiente de cobro"
          balanceFn={(items) => sumByCurrency(items, "monto", { filter: (i) => i.estado !== "Pagado" })}
        />
      )}

      {sub === "rh" && (
        <GenericModule
          storageKey="sitework:rh"
          prefix="RH"
          title="Recursos Humanos"
          moduleLabel="Empleados"
          subtitle="Personal administrativo y de obra"
          icon={Users}
          primaryLabel="Nuevo empleado"
          items={rh}
          setItems={setRh}
          fields={[
            { key: "nombre", label: "Nombre" },
            { key: "cargo", label: "Cargo" },
            { key: "fecha_ingreso", label: "Fecha de ingreso", type: "date" },
            { key: "salario", label: "Salario", type: "number", currency: true },
          ]}
          estados={["Activo", "Inactivo"]}
          balanceLabel="Nómina mensual (activos)"
          balanceFn={(items) => sumByCurrency(items, "salario", { filter: (i) => i.estado === "Activo" })}
        />
      )}

      {sub === "banco" && (
        <GenericModule
          storageKey="sitework:banco"
          prefix="BC"
          title="Banco"
          moduleLabel="Movimientos bancarios"
          subtitle="Ingresos y egresos de la cuenta bancaria"
          icon={Landmark}
          primaryLabel="Nuevo movimiento"
          items={banco}
          setItems={setBanco}
          fields={[
            { key: "cuenta", label: "Cuenta" },
            { key: "concepto", label: "Concepto" },
            { key: "tipo", label: "Tipo", type: "select", options: ["Ingreso", "Egreso"] },
            { key: "monto", label: "Monto", type: "number", currency: true },
            { key: "fecha", label: "Fecha", type: "date" },
          ]}
          balanceLabel="Saldo"
          balanceFn={(items) => sumByCurrency(items, "monto", { sign: (i) => (i.tipo === "Egreso" ? -1 : 1) })}
        />
      )}

      {sub === "fondos" && (
        <GenericModule
          storageKey="sitework:fondos-fijos"
          prefix="FF"
          title="Fondos fijos"
          moduleLabel="Fondos fijos"
          subtitle="Caja chica — asignaciones y gastos"
          icon={Wallet}
          primaryLabel="Nuevo movimiento"
          items={fondos}
          setItems={setFondos}
          fields={[
            { key: "responsable", label: "Responsable" },
            { key: "concepto", label: "Concepto" },
            { key: "tipo", label: "Tipo", type: "select", options: ["Asignación", "Gasto"] },
            { key: "monto", label: "Monto", type: "number", currency: true },
            { key: "fecha", label: "Fecha", type: "date" },
          ]}
          balanceLabel="Saldo de caja chica"
          balanceFn={(items) => sumByCurrency(items, "monto", { sign: (i) => (i.tipo === "Gasto" ? -1 : 1) })}
        />
      )}
    </div>
  );
}

/* ================= COSTEO DE OBRAS ================= */

function CosteoObras({ orders }) {
  const grouped = useMemo(() => {
    const map = {};
    orders.forEach((o) => {
      const key = (o.obra && o.obra.trim()) || "Sin asignar";
      if (!map[key]) map[key] = [];
      map[key].push(o);
    });
    return map;
  }, [orders]);

  function sumByMoneda(list) {
    const sums = { PYG: 0, USD: 0 };
    list.forEach((o) => {
      const m = o.moneda === "USD" ? "USD" : "PYG";
      sums[m] += Number(o.total) || 0;
    });
    return sums;
  }

  const granTotal = sumByMoneda(orders);

  function exportAll() {
    const rows = [];
    Object.entries(grouped).forEach(([obra, ords]) => {
      ords.forEach((o) =>
        rows.push({ Obra: obra, Número: o.numero, Proveedor: o.proveedor, Fecha: o.fecha, Estado: o.estado, Moneda: o.moneda || "PYG", Total: o.total })
      );
    });
    exportToExcel("costeo-de-obras", { Costeo: rows });
  }

  return (
    <div>
      <SectionHeader
        icon={Calculator}
        title="Costeo de obras"
        subtitle="Compras realizadas, agrupadas por obra/proyecto"
        action={<ExportButton onClick={exportAll} label="Exportar costeo" />}
      />

      <div style={{ marginBottom: 18, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "inline-block", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 16px" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6558", textTransform: "uppercase", marginRight: 8 }}>Total comprado en ₲</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: COLORS.ink }}>{fmtPYG(granTotal.PYG)}</span>
        </div>
        {granTotal.USD > 0 && (
          <div style={{ display: "inline-block", background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 16px" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#6b6558", textTransform: "uppercase", marginRight: 8 }}>Total comprado en US$</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: COLORS.ink }}>{fmtUSD(granTotal.USD)}</span>
          </div>
        )}
      </div>

      {orders.length === 0 ? (
        <EmptyState text="Todavía no hay órdenes de compra cargadas. El costeo se arma automáticamente a partir de las compras (sección Compras), usando el campo Obra de cada orden." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {Object.entries(grouped)
            .sort((a, b) => {
              const ta = sumByMoneda(a[1]); const tb = sumByMoneda(b[1]);
              return (tb.PYG + tb.USD * 7300) - (ta.PYG + ta.USD * 7300);
            })
            .map(([obra, ords]) => {
              const total = sumByMoneda(ords);
              return (
                <div key={obra} style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>{obra}</h3>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 700, display: "flex", gap: 10 }}>
                      {total.PYG > 0 && <span>{fmtPYG(total.PYG)}</span>}
                      {total.USD > 0 && <span>{fmtUSD(total.USD)}</span>}
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ords.map((o) => (
                      <div key={o.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, fontSize: 12.5, borderTop: `1px solid ${COLORS.line}`, paddingTop: 6 }}>
                        <span style={{ color: "#4c473d" }}>
                          <span style={{ fontFamily: "'JetBrains Mono', monospace", color: COLORS.blueprint }}>{o.numero}</span> · {o.proveedor} · {fmtDate(o.fecha)}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{fmtMoney(o.total, o.moneda)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* ================= DOCUMENTACIÓN CONTABLE (acceso restringido) ================= */

const CONTABLE_CATEGORIAS = ["Factura", "Recibo", "Comprobante bancario", "Balance", "Impuestos", "Contrato", "Otro"];

function DocumentacionContable({ index, setIndex }) {
  const [showAdd, setShowAdd] = useState(false);
  const [detail, setDetail] = useState(null);
  const [nombre, setNombre] = useState("");
  const [categoria, setCategoria] = useState(CONTABLE_CATEGORIAS[0]);
  const [fecha, setFecha] = useState(todayISO());
  const [notas, setNotas] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function recargar() {
    const data = await apiGet("/documentos-contables");
    setIndex(data);
    if (detail) {
      const actualizado = data.find((d) => d.id === detail.id);
      setDetail(actualizado || null);
    }
    return data;
  }

  async function addDoc() {
    if (!nombre.trim()) return;
    await apiPost("/documentos-contables", { nombre, categoria, fecha, notas });
    await recargar();
    setNombre(""); setCategoria(CONTABLE_CATEGORIAS[0]); setFecha(todayISO()); setNotas("");
    setShowAdd(false);
  }

  function openDetail(d) {
    setDetail(d);
  }

  async function handleFiles(files) {
    if (!files || !files.length || !detail) return;
    setUploading(true);
    setUploadError("");
    try {
      await apiUpload(`/documentos-contables/${detail.id}/archivos`, Array.from(files));
      await recargar();
    } catch (e) {
      setUploadError(e.message || "No se pudo subir el archivo.");
    }
    setUploading(false);
  }

  async function removeArchivo(archivoId) {
    await apiDelete(`/documentos-contables/${detail.id}/archivos/${archivoId}`);
    await recargar();
  }

  async function removeDoc(id) {
    await apiDelete(`/documentos-contables/${id}`);
    await recargar();
    if (detail && detail.id === id) setDetail(null);
  }

  return (
    <div>
      <SectionHeader
        icon={ShieldCheck}
        title="Documentación contable"
        subtitle="Facturas, recibos, comprobantes y documentos de la empresa"
        action={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <ExportButton
              onClick={() =>
                exportToExcel("documentacion-contable", {
                  Documentos: index.map((d) => ({ Número: d.numero, Nombre: d.nombre, Categoría: d.categoria, Fecha: d.fecha, Archivos: (d.archivos || []).length })),
                })
              }
            />
            <PrimaryButton onClick={() => setShowAdd(true)}>Nuevo documento</PrimaryButton>
          </div>
        }
      />

      <div style={{ marginBottom: 16, fontSize: 12.5, color: "#6b6558", display: "flex", gap: 6, alignItems: "flex-start" }}>
        <AlertTriangle size={14} color={COLORS.rust} style={{ flexShrink: 0, marginTop: 1 }} />
        Esta sección está protegida con PIN, pero es un candado simple pensado solo para uso interno de la demo — no reemplaza un control de acceso real por usuario.
      </div>

      {index.length === 0 ? (
        <EmptyState text="No hay documentos contables cargados todavía." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
          {[...index].reverse().map((d) => (
            <Ticket key={d.id} numero={d.numero} right={<StampBadge estado={d.categoria} tone={COLORS.blueprint} />}>
              <button onClick={() => openDetail(d)} style={{ background: "none", border: "none", textAlign: "left", cursor: "pointer", width: "100%", padding: 0, marginTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{d.nombre}</div>
                <div style={{ fontSize: 12, color: "#6b6558", marginTop: 2 }}>{fmtDate(d.fecha)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: COLORS.blueprint }}>
                  <FileText size={13} /> {(d.archivos || []).length} archivo{(d.archivos || []).length === 1 ? "" : "s"}
                </div>
              </button>
            </Ticket>
          ))}
        </div>
      )}

      {showAdd && (
        <Modal title="Nuevo documento contable" onClose={() => setShowAdd(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Nombre del documento">
              <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Factura proveedor - Julio 2026" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Categoría">
                <select style={inputStyle} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  {CONTABLE_CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha">
                <input type="date" style={inputStyle} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </Field>
            </div>
            <Field label="Notas">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={notas} onChange={(e) => setNotas(e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
            <PrimaryButton onClick={addDoc}>Crear documento</PrimaryButton>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.numero} onClose={() => { setDetail(null); setUploadError(""); }} wide>
          {!detail ? (
            <Loading />
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 17 }}>{detail.nombre}</div>
                  <div style={{ fontSize: 12.5, color: "#6b6558", marginTop: 2 }}>{fmtDate(detail.fecha)}</div>
                </div>
                <StampBadge estado={detail.categoria} tone={COLORS.blueprint} />
              </div>
              {detail.notas && <p style={{ fontSize: 13.5, color: "#4c473d", marginTop: 10 }}>{detail.notas}</p>}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => removeDoc(detail.id)} style={{ ...ghostDeleteStyle, marginTop: 0 }}><Trash2 size={13} /> Eliminar documento</button>
              </div>

              <div style={{ marginTop: 10, borderTop: `1px solid ${COLORS.line}`, paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h4 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>Archivos</h4>
                  <label style={{ ...smallActionStyle, color: COLORS.safety, cursor: "pointer" }}>
                    <Upload size={14} /> {uploading ? "Subiendo…" : "Subir imagen o PDF"}
                    <input type="file" accept="image/*,application/pdf" multiple style={{ display: "none" }} disabled={uploading} onChange={(e) => handleFiles(e.target.files)} />
                  </label>
                </div>
                {uploadError && (
                  <div style={{ fontSize: 12.5, color: COLORS.rust, marginBottom: 10, display: "flex", gap: 6 }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {uploadError}
                  </div>
                )}
                {detail.archivos.length === 0 ? (
                  <EmptyState text="Todavía no hay archivos. Sube una foto o un PDF liviano del documento." />
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                    {detail.archivos.map((a) => (
                      <div key={a.id} style={{ position: "relative" }}>
                        {a.tipo === "imagen" ? (
                          <img src={`${API_URL}${a.url_archivo}`} alt={a.nombre_archivo} style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, border: `1px solid ${COLORS.line}` }} />
                        ) : (
                          <a href={`${API_URL}${a.url_archivo}`} download={a.nombre_archivo} target="_blank" rel="noreferrer" style={{
                            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                            width: "100%", height: 120, borderRadius: 6, border: `1px solid ${COLORS.line}`, background: "#fff",
                            color: COLORS.blueprint, textDecoration: "none", fontSize: 11, textAlign: "center", padding: 6,
                          }}>
                            <FileText size={22} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{a.nombre_archivo}</span>
                          </a>
                        )}
                        <button onClick={() => removeArchivo(a.id)} style={{ position: "absolute", top: 4, right: 4, background: "rgba(33,31,27,0.7)", border: "none", borderRadius: 4, color: "#fff", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ================= REPORTES (resumen y export por cada ítem) ================= */

function breakdownBy(items, key = "estado") {
  const map = {};
  items.forEach((i) => {
    const k = i[key] || "Sin estado";
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).map(([estado, count]) => ({ estado, count }));
}

function ReportCard({ title, icon: Icon, count, countLabel, breakdown, money, onExport }) {
  const max = breakdown && breakdown.length ? Math.max(...breakdown.map((b) => b.count), 1) : 1;
  return (
    <div style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 16, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon size={17} color={COLORS.safety} />
          <h3 style={{ fontFamily: "'Oswald', sans-serif", fontSize: 14.5, textTransform: "uppercase", margin: 0, color: COLORS.ink }}>{title}</h3>
        </div>
        {onExport && (
          <button onClick={onExport} style={{ ...smallActionStyle, color: COLORS.blueprint }}>
            <FileSpreadsheet size={13} /> Exportar
          </button>
        )}
      </div>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700, color: COLORS.ink, lineHeight: 1 }}>{count}</div>
      <div style={{ fontSize: 11.5, color: "#6b6558", marginBottom: 10 }}>{countLabel}</div>

      {money && (money.PYG !== 0 || money.USD !== 0) && (
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 2 }}>
          {money.PYG !== 0 && <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.blueprint }}>{money.label}: {fmtPYG(money.PYG)}</div>}
          {money.USD !== 0 && <div style={{ fontSize: 12.5, fontWeight: 600, color: COLORS.blueprint }}>{money.label} (US$): {fmtUSD(money.USD)}</div>}
        </div>
      )}

      {breakdown && breakdown.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: "auto" }}>
          {breakdown.map((b) => (
            <div key={b.estado} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, width: 78, color: "#6b6558", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.estado}</span>
              <div style={{ flex: 1, background: "#e5e1d8", borderRadius: 3, height: 7, overflow: "hidden" }}>
                <div style={{ width: `${(b.count / max) * 100}%`, background: ESTADO_TONE[b.estado] || COLORS.blueprint, height: "100%" }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, width: 16, textAlign: "right" }}>{b.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Reportes({ inventory, orders, requests, workIndex, planosIndex, unidades, operaciones, cuoteros, proveedores, cobranzas, rh, banco, fondos }) {
  const lowStock = inventory.filter((i) => Number(i.stock) <= Number(i.minimo));

  return (
    <div>
      <SectionHeader icon={BarChart3} title="Reportes" subtitle="Resumen y exportación de cada ítem del sistema" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
        <ReportCard
          title="Inventario" icon={Boxes} count={inventory.length} countLabel="ítems registrados"
          breakdown={[{ estado: "Bajo stock", count: lowStock.length }, { estado: "OK", count: inventory.length - lowStock.length }]}
          onExport={() => exportToExcel("reporte-inventario", { Inventario: inventory.map((i) => ({ Código: i.codigo, Nombre: i.nombre, Categoría: i.categoria, Stock: i.stock, Unidad: i.unidad, Mínimo: i.minimo })) })}
        />
        <ReportCard
          title="Compras" icon={ShoppingCart} count={orders.length} countLabel="órdenes de compra"
          breakdown={breakdownBy(orders)}
          money={{ label: "Total", ...sumByCurrency(orders.map((o) => ({ total: o.total, total_moneda: o.moneda })), "total") }}
          onExport={() => exportToExcel("reporte-compras", { Compras: orders.map((o) => ({ Número: o.numero, Obra: o.obra, Proveedor: o.proveedor, Fecha: o.fecha, Estado: o.estado, Moneda: o.moneda || "PYG", Total: o.total })) })}
        />
        <ReportCard
          title="Pedidos de materiales" icon={ClipboardList} count={requests.length} countLabel="pedidos"
          breakdown={breakdownBy(requests)}
          onExport={() => exportToExcel("reporte-pedidos", { Pedidos: requests.map((r) => ({ Número: r.numero, Obra: r.obra, Solicitante: r.solicitante, Fecha: r.fecha, Estado: r.estado })) })}
        />
        <ReportCard
          title="Trabajos" icon={HardHat} count={workIndex.length} countLabel="órdenes de trabajo"
          breakdown={breakdownBy(workIndex)}
          onExport={() => exportToExcel("reporte-trabajos", { Trabajos: workIndex.map((w) => ({ Número: w.numero, Título: w.titulo, Responsable: w.responsable, Fecha: w.fecha, Estado: w.estado, Fotos: w.fotoCount || 0 })) })}
        />
        <ReportCard
          title="Planos" icon={FileText} count={planosIndex.length} countLabel="planos cargados"
          breakdown={breakdownBy(planosIndex, "categoria")}
          onExport={() => exportToExcel("reporte-planos", { Planos: planosIndex.map((p) => ({ Número: p.numero, Nombre: p.nombre, Categoría: p.categoria, Versión: p.version, Fecha: p.fecha })) })}
        />
        <ReportCard
          title="Unidades" icon={Home} count={unidades.length} countLabel="departamentos"
          breakdown={breakdownBy(unidades)}
          onExport={() => exportToExcel("reporte-unidades", { Unidades: unidades.map((u) => ({ Código: u.codigo, Edificio: u.edificio, Piso: u.piso, Disponibilidad: u.disponibilidad, Estado: u.estado })) })}
        />
        <ReportCard
          title="Ventas / alquileres" icon={Handshake} count={operaciones.length} countLabel="operaciones comerciales"
          breakdown={breakdownBy(operaciones)}
          money={{ label: "Total", ...sumByCurrency(operaciones, "monto", { filter: (o) => o.estado !== "Cancelada" }) }}
          onExport={() => exportToExcel("reporte-comercial", { Operaciones: operaciones.map((o) => ({ Número: o.numero, Cliente: o.cliente, Unidad: o.unidad, Tipo: o.tipo, Moneda: o.monto_moneda || "PYG", Monto: o.monto, Estado: o.estado })) })}
        />
        <ReportCard
          title="Cuoteros" icon={Receipt} count={cuoteros.length} countLabel="cuotas registradas"
          breakdown={breakdownBy(cuoteros)}
          money={{ label: "Pendiente", ...sumByCurrency(cuoteros, "monto_cuota", { filter: (c) => c.estado !== "Pagado" }) }}
          onExport={() => exportToExcel("reporte-cuoteros", { Cuoteros: cuoteros.map((c) => ({ Número: c.numero, Cliente: c.cliente, Unidad: c.unidad, Cuota: c.numero_cuota, Moneda: c.monto_cuota_moneda || "PYG", Monto: c.monto_cuota, Vencimiento: c.fecha_vencimiento, Estado: c.estado })) })}
        />
        <ReportCard
          title="Proveedores" icon={Truck} count={proveedores.length} countLabel="proveedores"
          breakdown={breakdownBy(proveedores)}
          onExport={() => exportToExcel("reporte-proveedores", { Proveedores: proveedores.map((p) => ({ Nombre: p.nombre, Rubro: p.rubro, Contacto: p.contacto, Estado: p.estado })) })}
        />
        <ReportCard
          title="Cobranzas" icon={Receipt} count={cobranzas.length} countLabel="cuentas por cobrar"
          breakdown={breakdownBy(cobranzas)}
          money={{ label: "Pendiente", ...sumByCurrency(cobranzas, "monto", { filter: (c) => c.estado !== "Pagado" }) }}
          onExport={() => exportToExcel("reporte-cobranzas", { Cobranzas: cobranzas.map((c) => ({ Número: c.numero, Cliente: c.cliente, Concepto: c.concepto, Moneda: c.monto_moneda || "PYG", Monto: c.monto, Vencimiento: c.fecha_vencimiento, Estado: c.estado })) })}
        />
        <ReportCard
          title="RH" icon={Users} count={rh.length} countLabel="empleados"
          breakdown={breakdownBy(rh)}
          money={{ label: "Nómina activos", ...sumByCurrency(rh, "salario", { filter: (e) => e.estado === "Activo" }) }}
          onExport={() => exportToExcel("reporte-rh", { Empleados: rh.map((e) => ({ Número: e.numero, Nombre: e.nombre, Cargo: e.cargo, Moneda: e.salario_moneda || "PYG", Salario: e.salario, Estado: e.estado })) })}
        />
        <ReportCard
          title="Banco" icon={Landmark} count={banco.length} countLabel="movimientos"
          money={{ label: "Saldo", ...sumByCurrency(banco, "monto", { sign: (m) => (m.tipo === "Egreso" ? -1 : 1) }) }}
          onExport={() => exportToExcel("reporte-banco", { Movimientos: banco.map((m) => ({ Número: m.numero, Cuenta: m.cuenta, Concepto: m.concepto, Tipo: m.tipo, Moneda: m.monto_moneda || "PYG", Monto: m.monto, Fecha: m.fecha })) })}
        />
        <ReportCard
          title="Fondos fijos" icon={Wallet} count={fondos.length} countLabel="movimientos de caja chica"
          money={{ label: "Saldo", ...sumByCurrency(fondos, "monto", { sign: (m) => (m.tipo === "Gasto" ? -1 : 1) }) }}
          onExport={() => exportToExcel("reporte-fondos-fijos", { Fondos: fondos.map((f) => ({ Número: f.numero, Responsable: f.responsable, Concepto: f.concepto, Tipo: f.tipo, Moneda: f.monto_moneda || "PYG", Monto: f.monto, Fecha: f.fecha })) })}
        />
      </div>
    </div>
  );
}

const NAV = [
  { id: "dashboard", label: "Tablero", icon: LayoutDashboard },
  { id: "compras", label: "Compras", icon: ShoppingCart },
  { id: "presupuestos", label: "Presupuestos", icon: Handshake },
  { id: "inventario", label: "Inventario", icon: Boxes },
  { id: "trabajos", label: "Trabajos", icon: HardHat },
  { id: "pedidos", label: "Pedidos", icon: ClipboardList },
  { id: "planos", label: "Planos", icon: FileText },
  { id: "costeo", label: "Costeo", icon: Calculator },
  { id: "comercial", label: "Comercial", icon: Building2 },
  { id: "administracion", label: "Admin.", icon: Landmark },
  { id: "reportes", label: "Reportes", icon: BarChart3 },
];

function AppInner({ session, usuarios, setUsuarios, logout }) {
  const [view, setView] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState([]);
  const [orders, setOrders] = useState([]);
  const [presupuestos, setPresupuestos] = useState([]);
  const [requests, setRequests] = useState([]);
  const [workIndex, setWorkIndex] = useState([]);
  const [planosIndex, setPlanosIndex] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [operaciones, setOperaciones] = useState([]);
  const [cuoteros, setCuoteros] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [cobranzas, setCobranzas] = useState([]);
  const [rh, setRh] = useState([]);
  const [banco, setBanco] = useState([]);
  const [fondos, setFondos] = useState([]);
  const [contableIndex, setContableIndex] = useState([]);

  useEffect(() => {
    (async () => {
      // Comercial y Administración: los 8 sub-módulos que usan
      // <GenericModule> ya migraron a la tabla genérica /modulo/{nombre}.
      const [inv, ord, pres, req, widx, plidx, un, ope, cuo, prov, cob, rhData, bco, ff, ctidx] = await Promise.all([
        apiGet("/inventario"),
        apiGet("/ordenes-compra"),
        apiGet("/presupuestos"),
        apiGet("/pedidos-materiales"),
        apiGet("/trabajos"),
        apiGet("/planos"),
        apiGet("/modulo/unidades"),
        apiGet("/modulo/operaciones-comerciales"),
        apiGet("/modulo/cuoteros"),
        apiGet("/modulo/proveedores"),
        apiGet("/modulo/cobranzas"),
        apiGet("/modulo/rh"),
        apiGet("/modulo/banco"),
        apiGet("/modulo/fondos-fijos"),
        apiGet("/documentos-contables"),
      ]);
      setInventory(inv || []); // apiGet("/inventario") ya devuelve el arreglo directo
      setOrders(ord || []); // apiGet("/ordenes-compra") ya devuelve el arreglo directo
      setPresupuestos(pres || []);
      setRequests(req || []); // apiGet("/pedidos-materiales") ya devuelve el arreglo directo
      setWorkIndex(widx || []); // apiGet("/trabajos") ya devuelve el arreglo directo
      setPlanosIndex(plidx || []); // apiGet("/planos") ya devuelve el arreglo directo
      setUnidades(un || []);
      setOperaciones(ope || []);
      setCuoteros(cuo || []);
      setProveedores(prov || []);
      setCobranzas(cob || []);
      setRh(rhData || []);
      setBanco(bco || []);
      setFondos(ff || []);
      setContableIndex(ctidx || []); // apiGet("/documentos-contables") ya devuelve el arreglo directo
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.concrete, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('${FONT_LINK}');
        * { box-sizing: border-box; }
        body { margin: 0; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        ::selection { background: ${COLORS.safety}; color: #fff; }
        button:focus-visible, input:focus-visible, textarea:focus-visible, label:focus-within {
          outline: 2px solid ${COLORS.blueprint}; outline-offset: 1px;
        }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <nav
          style={{
            width: 84, flexShrink: 0, background: COLORS.ink, display: "flex", flexDirection: "column",
            alignItems: "center", paddingTop: 18, gap: 4,
          }}
        >
          <div style={{ color: COLORS.safety, marginBottom: 14 }}>
            <HardHat size={26} />
          </div>
          {NAV.map((n) => {
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                style={{
                  width: 66, background: active ? "rgba(242,101,15,0.16)" : "transparent",
                  border: "none", borderLeft: active ? `3px solid ${COLORS.safety}` : "3px solid transparent",
                  color: active ? COLORS.safety : "#c9c4b8", display: "flex", flexDirection: "column",
                  alignItems: "center", gap: 4, padding: "10px 4px", cursor: "pointer", fontSize: 10.5,
                  fontWeight: 600, fontFamily: "'Inter', sans-serif", letterSpacing: "0.02em",
                }}
              >
                <n.icon size={19} />
                {n.label}
              </button>
            );
          })}
          <button
            onClick={() => setView("usuarios")}
            style={{
              width: 66, background: view === "usuarios" ? "rgba(242,101,15,0.16)" : "transparent",
              border: "none", borderLeft: view === "usuarios" ? `3px solid ${COLORS.safety}` : "3px solid transparent",
              color: view === "usuarios" ? COLORS.safety : "#c9c4b8", display: "flex", flexDirection: "column",
              alignItems: "center", gap: 4, padding: "10px 4px", cursor: "pointer", fontSize: 10.5,
              fontWeight: 600, fontFamily: "'Inter', sans-serif", letterSpacing: "0.02em",
            }}
          >
            <ShieldCheck size={19} />
            Usuarios
          </button>

          <div style={{ marginTop: "auto", width: "100%", padding: "10px 6px", borderTop: "1px solid rgba(255,255,255,0.12)", textAlign: "center" }}>
            <div style={{ fontSize: 10.5, color: "#e7e4dd", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>{session.nombre}</div>
            <div style={{ fontSize: 9.5, color: "#8a8578", marginBottom: 6 }}>{ROL_LABEL[session.rol] || session.rol}</div>
            <button
              onClick={logout}
              style={{ background: "none", border: "none", color: "#c9c4b8", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, margin: "0 auto" }}
            >
              <Lock size={11} /> Salir
            </button>
          </div>
        </nav>

        {/* Main */}
        <main style={{ flex: 1, padding: "26px 30px 60px", maxWidth: 1100 }}>
          {loading ? (
            <Loading />
          ) : view === "dashboard" ? (
            <Dashboard inventory={inventory} orders={orders} requests={requests} workIndex={workIndex} planosIndex={planosIndex} goTo={setView} />
          ) : view === "compras" ? (
            <Compras orders={orders} setOrders={setOrders} />
          ) : view === "presupuestos" ? (
            <Presupuestos presupuestos={presupuestos} setPresupuestos={setPresupuestos} />
          ) : view === "inventario" ? (
            <Inventario items={inventory} setItems={setInventory} />
          ) : view === "trabajos" ? (
            <Trabajos workIndex={workIndex} setWorkIndex={setWorkIndex} />
          ) : view === "pedidos" ? (
            <Pedidos requests={requests} setRequests={setRequests} />
          ) : view === "planos" ? (
            <Planos planosIndex={planosIndex} setPlanosIndex={setPlanosIndex} />
          ) : view === "costeo" ? (
            <CosteoObras orders={orders} />
          ) : view === "comercial" ? (
            <Comercial unidades={unidades} setUnidades={setUnidades} operaciones={operaciones} setOperaciones={setOperaciones} cuoteros={cuoteros} setCuoteros={setCuoteros} />
          ) : view === "administracion" ? (
            <Administracion
              proveedores={proveedores} setProveedores={setProveedores}
              cobranzas={cobranzas} setCobranzas={setCobranzas}
              rh={rh} setRh={setRh}
              banco={banco} setBanco={setBanco}
              fondos={fondos} setFondos={setFondos}
              contableIndex={contableIndex} setContableIndex={setContableIndex}
            />
          ) : view === "usuarios" ? (
            <UsuariosPanel usuarios={usuarios} setUsuarios={setUsuarios} session={session} />
          ) : (
            <Reportes
              inventory={inventory} orders={orders} requests={requests} workIndex={workIndex} planosIndex={planosIndex}
              unidades={unidades} operaciones={operaciones} cuoteros={cuoteros}
              proveedores={proveedores} cobranzas={cobranzas} rh={rh} banco={banco} fondos={fondos}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return <AuthGate>{({ session, usuarios, setUsuarios, logout }) => <AppInner session={session} usuarios={usuarios} setUsuarios={setUsuarios} logout={logout} />}</AuthGate>;
}
