// AllUsBasecamp — React App
// Requires: window.sb (Supabase client from supabase-config.js)
//           React 18 + ReactDOM 18 + Babel standalone (loaded in index.html)
'use strict';

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════
const MAX_MEMBERS = 7;

const ACTIVITY_META = {
  vacation: { icon: '✈️', label: 'Plan Vacation',  subtitle: 'Dates, destinations & map',  gradient: 'linear-gradient(135deg,#667eea,#764ba2)', pinColor: '#6366f1', pinShape: 'teardrop' },
  event:    { icon: '🎉', label: 'Go to an Event', subtitle: 'Concerts, sports & shows',   gradient: 'linear-gradient(135deg,#f093fb,#f5576c)', pinColor: '#e11d48', pinShape: 'star'     },
  dine:     { icon: '🍽️', label: 'Dine Out',        subtitle: 'Restaurant ideas & plans',   gradient: 'linear-gradient(135deg,#4facfe,#00f2fe)', pinColor: '#0284c7', pinShape: 'pawn'     },
};

const PRESET_EMOJIS = [
  '🎯','🎮','🎵','🎨','🏋️','🧘','🚴','🏊','🎭','📚',
  '🌳','🏔️','🎪','🎬','🎤','🏆','🎲','🧩','🌅','🌊',
  '🏖️','🍕','🎂','☕','🛒','🎻','🏕️','🌺','🤸','🎡',
];

const PRESET_GRADIENTS = [
  { label: 'Violet',  value: 'linear-gradient(135deg,#7c3aed,#a855f7)', pinColor: '#7c3aed' },
  { label: 'Rose',    value: 'linear-gradient(135deg,#e11d48,#f43f5e)', pinColor: '#e11d48' },
  { label: 'Emerald', value: 'linear-gradient(135deg,#059669,#34d399)', pinColor: '#059669' },
  { label: 'Amber',   value: 'linear-gradient(135deg,#d97706,#fbbf24)', pinColor: '#d97706' },
  { label: 'Cyan',    value: 'linear-gradient(135deg,#0891b2,#22d3ee)', pinColor: '#0891b2' },
  { label: 'Orange',  value: 'linear-gradient(135deg,#ea580c,#fb923c)', pinColor: '#ea580c' },
  { label: 'Pink',    value: 'linear-gradient(135deg,#db2777,#f472b6)', pinColor: '#db2777' },
  { label: 'Indigo',  value: 'linear-gradient(135deg,#4338ca,#818cf8)', pinColor: '#4338ca' },
];

// Derived from ACTIVITY_META — no duplication
const COMMON_TILES = Object.entries(ACTIVITY_META).map(([type, m]) => ({ type, ...m }));

const MEMBER_TILES = [
  { type: 'meals',    icon: '🥗', label: 'Plan Meals', color: 'tile-green' },
  { type: 'exercise', icon: '🏃', label: 'Exercise',   color: 'tile-peach' },
  { type: 'book',     icon: '📖', label: 'Read Book',  color: 'tile-blue'  },
];

const PLAN_META = {
  vacation: { icon: '✈️', label: 'Plan Vacation'  },
  event:    { icon: '🎉', label: 'Go to an Event' },
  dine:     { icon: '🍽️', label: 'Dine Out'        },
  meals:    { icon: '🥗', label: 'Plan Meals'     },
  exercise: { icon: '🏃', label: 'Exercise'       },
  book:     { icon: '📖', label: 'Read Book'      },
};

// ════════════════════════════════════════════════════════════════
// SUPABASE HELPERS  (pure async — no DOM/toast side effects)
// ════════════════════════════════════════════════════════════════
async function sbLoadTagline() {
  const { data } = await window.sb
    .from('allusbasecamp_settings')
    .select('value')
    .eq('key', 'tagline')
    .maybeSingle();
  return data?.value || 'Together we make\nunforgettable memories';
}

async function sbSaveTagline(value) {
  const { error } = await window.sb
    .from('allusbasecamp_settings')
    .upsert({ key: 'tagline', value, updated_at: new Date().toISOString() },
            { onConflict: 'key' });
  if (error) throw error;
}

async function sbLoadMembers() {
  const { data, error } = await window.sb
    .from('allusbasecamp_members')
    .select('*')
    .order('position');
  if (error) throw error;
  const arr = new Array(MAX_MEMBERS).fill(null);
  (data || []).forEach(m => {
    if (m.position >= 0 && m.position < MAX_MEMBERS) arr[m.position] = m;
  });
  return arr;
}

async function sbSaveMember(slot, name, file, existingAvatarUrl, email) {
  let avatar_url = existingAvatarUrl || null;

  if (file) {
    const ext   = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path  = `slot-${slot}/avatar.${ext}`;
    const exts  = ['jpg','jpeg','png','webp','gif','heic'];
    // Remove all old avatar files for this slot
    await window.sb.storage.from('member-avatars').remove(exts.map(e => `slot-${slot}/avatar.${e}`));
    const { error: upErr } = await window.sb.storage
      .from('member-avatars')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (!upErr) {
      const { data: urlData } = window.sb.storage.from('member-avatars').getPublicUrl(path);
      avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;
    }
  }

  const row = { name, avatar_url, position: slot };
  if (email) row.email = email;

  const { data, error } = await window.sb
    .from('allusbasecamp_members')
    .upsert(row, { onConflict: 'position' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function sbDeleteMember(slot, memberId) {
  const exts = ['jpg','jpeg','png','webp','gif','heic'];
  await window.sb.storage.from('member-avatars').remove(exts.map(e => `slot-${slot}/avatar.${e}`));
  const { error } = await window.sb.from('allusbasecamp_members').delete().eq('id', memberId);
  if (error) throw error;
}


// SHA-256 hash of (pin + memberId) — one-way, never stores the raw PIN
async function hashPin(pin, memberId) {
  const raw  = new TextEncoder().encode(pin + memberId);
  const buf  = await crypto.subtle.digest('SHA-256', raw);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sbLoadPlans(type, memberId) {
  if (!memberId) {
    const { data, error } = await window.sb
      .from('allusbasecamp_common_plans')
      .select('*').eq('type', type).order('created_at');
    if (error) throw error;
    return data || [];
  } else {
    const { data, error } = await window.sb
      .from('allusbasecamp_personal_plans')
      .select('*').eq('type', type).eq('member_id', memberId).order('created_at');
    if (error) throw error;
    return data || [];
  }
}

async function sbAddPlan(type, memberId, content) {
  if (!memberId) {
    const { data, error } = await window.sb
      .from('allusbasecamp_common_plans')
      .insert({ type, content }).select().single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await window.sb
      .from('allusbasecamp_personal_plans')
      .insert({ type, content, member_id: memberId }).select().single();
    if (error) throw error;
    return data;
  }
}

async function sbDeletePlan(id, memberId) {
  const table = memberId
    ? 'allusbasecamp_personal_plans'
    : 'allusbasecamp_common_plans';
  await window.sb.from(table).delete().eq('id', id);
}

async function sbLoadMapPins() {
  const { data, error } = await window.sb
    .from('allusbasecamp_map_pins')
    .select('*')
    .order('created_at');
  if (error) throw error;
  return data || [];
}

async function sbSaveMapPin(type, lat, lng, label, monthYear) {
  if (!window.sb) throw new Error('Supabase not initialised');
  const { data, error } = await window.sb
    .from('allusbasecamp_map_pins')
    .insert({ type, lat: Number(lat), lng: Number(lng), label: label || '', month_year: monthYear || '' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function sbDeleteMapPin(id) {
  if (!window.sb) throw new Error('Supabase not initialised');
  const { error } = await window.sb.from('allusbasecamp_map_pins').delete().eq('id', id);
  if (error) throw error;
}

async function sbLoadCustomActivities() {
  const { data, error } = await window.sb
    .from('allusbasecamp_custom_activities')
    .select('*').order('created_at');
  if (error) throw error;
  return data || [];
}

async function sbSaveCustomActivity(name, emoji, gradient, pinColor) {
  const { data, error } = await window.sb
    .from('allusbasecamp_custom_activities')
    .insert({ name, emoji, gradient, pin_color: pinColor })
    .select().single();
  if (error) throw error;
  return data;
}

async function sbDeleteCustomActivity(id) {
  const { error } = await window.sb.from('allusbasecamp_custom_activities').delete().eq('id', id);
  if (error) throw error;
}

// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════
function defaultAvatar(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  const palettes = ['#D6EAD6','#FFF3CC','#D1ECF1','#FFE8D6','#E8D6F0','#D6E4F0','#F0EAD6'];
  ctx.fillStyle = palettes[name.charCodeAt(0) % palettes.length];
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#1A531A';
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0).toUpperCase(), 100, 108);
  return canvas.toDataURL();
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMonthYear(isoMonth) {
  // "2026-03" → "March 26"
  if (!isoMonth) return '';
  const [yr, mo] = isoMonth.split('-').map(Number);
  const monthName = new Date(yr, mo - 1, 1).toLocaleString('en-US', { month: 'long' });
  return `${monthName} ${String(yr).slice(2)}`;
}

function createActivityPin(type, monthYear, allMeta) {
  const L   = window.L;
  const cfg = (allMeta && allMeta[type]) || ACTIVITY_META[type] || ACTIVITY_META.vacation;
  const c   = cfg.pinColor;

  // Four distinct shapes: teardrop, star, pawn, badge (custom)
  let svgW, svgH, svgBody, emojiY, emojiSize;
  if (cfg.pinShape === 'teardrop') {
    svgW = 36; svgH = 48; emojiY = '37%'; emojiSize = 15;
    svgBody = `<path d="M18 2C9.163 2 2 9.163 2 18c0 11 16 28 16 28S34 29 34 18C34 9.163 26.837 2 18 2z" fill="${c}" stroke="white" stroke-width="2.5"/>`;
  } else if (cfg.pinShape === 'star') {
    svgW = 44; svgH = 44; emojiY = '50%'; emojiSize = 14;
    svgBody = `<polygon points="22,2 27.5,16.5 43,16.5 30.5,25.5 35.5,40 22,31 8.5,40 13.5,25.5 1,16.5 16.5,16.5" fill="${c}" stroke="white" stroke-width="2"/>`;
  } else if (cfg.pinShape === 'pawn') {
    // Chess pawn: circle head + tapered body + flat base
    svgW = 36; svgH = 50; emojiY = '20%'; emojiSize = 12;
    svgBody = `
      <circle cx="18" cy="11" r="9.5" fill="${c}" stroke="white" stroke-width="2"/>
      <path d="M11 21 Q9 28 7 35 h22 Q27 28 25 21 Z" fill="${c}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      <rect x="5" y="35" width="26" height="7" rx="3.5" fill="${c}" stroke="white" stroke-width="1.5"/>`;
  } else {
    // Badge: rounded rectangle + downward pointer — used for custom activities
    svgW = 40; svgH = 48; emojiY = '36%'; emojiSize = 16;
    svgBody = `
      <rect x="2" y="2" width="36" height="30" rx="10" fill="${c}" stroke="white" stroke-width="2"/>
      <polygon points="14,32 26,32 20,46" fill="${c}" stroke="white" stroke-width="2" stroke-linejoin="round"/>`;
  }

  const labelH   = monthYear ? 20 : 0;
  const totalH   = svgH + labelH + 2;
  const anchorY  = cfg.pinShape === 'star' ? svgH / 2 + labelH : totalH; // star anchors at center

  const html = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
      ${monthYear ? `<div style="background:rgba(15,23,42,0.84);color:white;font-size:9px;font-weight:700;
        padding:2px 6px;border-radius:5px;white-space:nowrap;font-family:Inter,sans-serif;
        box-shadow:0 1px 4px rgba(0,0,0,0.3);letter-spacing:0.02em;">${monthYear}</div>` : ''}
      <div style="position:relative;width:${svgW}px;height:${svgH}px;">
        <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" fill="none"
          xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0;">${svgBody}</svg>
        <span style="position:absolute;top:${emojiY};left:50%;transform:translate(-50%,-50%);
          font-size:${emojiSize}px;line-height:1;pointer-events:none;">${cfg.icon}</span>
      </div>
    </div>`;

  return L.divIcon({
    className:   '',
    html,
    iconSize:    [svgW, totalH],
    iconAnchor:  [svgW / 2, anchorY],
    popupAnchor: [0, -(totalH + 8)],
  });
}

function isSupabaseConfigured() {
  try {
    return (
      typeof SUPABASE_URL !== 'undefined' &&
      !SUPABASE_URL.includes('YOUR_PROJECT_ID') &&
      typeof SUPABASE_ANON_KEY !== 'undefined' &&
      SUPABASE_ANON_KEY.startsWith('eyJ')
    );
  } catch { return false; }
}

// ════════════════════════════════════════════════════════════════
// TOAST  (module-level setter so Supabase helpers can call it)
// ════════════════════════════════════════════════════════════════
let _showToast = () => {};

function Toast({ msg, visible }) {
  return <div className={`toast${visible ? ' show' : ''}`}>{msg}</div>;
}

// ════════════════════════════════════════════════════════════════
// CONTINUE BUTTON  (sticky, safe-area-aware, indigo)
// ════════════════════════════════════════════════════════════════
function ContinueButton({ enabled, onClick, label = 'Continue →' }) {
  return (
    <div className="sticky-continue">
      <button
        className={`continue-btn${enabled ? ' continue-btn--active' : ' continue-btn--disabled'}`}
        onClick={enabled ? onClick : undefined}
        disabled={!enabled}
        aria-disabled={!enabled}
      >
        {label}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ACTIVITY TILE  (haptic via ref, indigo selection via CSS)
// ════════════════════════════════════════════════════════════════
function ActivityTile({ type, icon, label, color, selected, onSelect }) {
  const ref = useRef(null);

  function handleClick() {
    // Haptic micro-animation via class toggle — avoids re-render during animation
    if (ref.current) {
      ref.current.classList.remove('tile--tapping');
      void ref.current.offsetWidth; // force reflow so animation restarts on repeat taps
      ref.current.classList.add('tile--tapping');
      setTimeout(() => ref.current?.classList.remove('tile--tapping'), 220);
    }
    onSelect(type);
  }

  return (
    <div
      ref={ref}
      role="button"
      aria-pressed={selected}
      className={`tile ${color}${selected ? ' tile--selected' : ''}`}
      onClick={handleClick}
    >
      <span className="tile-icon">{icon}</span>
      <span className="tile-label">{label}</span>
      {selected && <span className="tile-check">✓</span>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AVATAR SLOT
// ════════════════════════════════════════════════════════════════
function AvatarSlot({ member, slot, onFilled, onEmpty, editMode, onRemove, onLongPress }) {
  const fallback = useMemo(
    () => member ? defaultAvatar(member.name) : null,
    [member?.name]
  );
  const longPressTimer = useRef(null);

  function startPress() {
    if (!member) return;
    longPressTimer.current = setTimeout(() => {
      onLongPress && onLongPress();
    }, 500);
  }

  function cancelPress() {
    clearTimeout(longPressTimer.current);
  }

  function handleClick() {
    if (editMode) return; // taps disabled in edit mode
    member ? onFilled(slot) : onEmpty(slot);
  }

  function renderInner() {
    if (!member) return <span style={{ fontSize: '1.4rem', color: 'rgba(26,83,26,0.28)' }}>＋</span>;
    const url = member.avatar_url;
    if (url && url.startsWith('emoji:')) {
      return <span style={{ fontSize: '1.55rem', lineHeight: 1 }}>{url.slice(6)}</span>;
    }
    return <img src={url || fallback} alt={member.name} loading="lazy" />;
  }

  return (
    <div
      className="member-slot"
      onClick={handleClick}
      onMouseDown={startPress}
      onMouseUp={cancelPress}
      onMouseLeave={cancelPress}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchCancel={cancelPress}
      style={{ position: 'relative' }}>
      <div
        className={`avatar-circle${member ? ' filled' : ' empty'}${editMode && member ? ' avatar-wiggle' : ''}`}
        style={editMode && member ? { opacity: 0.85 } : {}}>
        {renderInner()}
      </div>
      {/* Remove badge — visible only in edit mode on filled slots */}
      {editMode && member && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(slot, member); }}
          aria-label={`Remove ${member.name}`}
          style={{
            position: 'absolute', top: 0, right: 0,
            width: 22, height: 22, borderRadius: '50%',
            background: '#dc2626', border: '2px solid #fff',
            color: '#fff', fontSize: '12px', fontWeight: 700,
            lineHeight: 1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, padding: 0,
            boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          }}>
          ✕
        </button>
      )}
      <span className="avatar-name" style={!member ? { color: 'rgba(26,83,26,0.3)' } : {}}>
        {member ? member.name : 'Add'}
      </span>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// TAGLINE EDITOR
// ════════════════════════════════════════════════════════════════
function TaglineEditor({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value);
  const textareaRef           = useRef(null);
  const saveTimer             = useRef(null);

  useEffect(() => { setDraft(value); }, [value]);

  function startEdit() {
    setDraft(value);
    setEditing(true);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }, 40);
  }

  function commit() {
    const val = draft.trim() || value;
    setEditing(false);
    if (val !== value) {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => onSave(val), 300);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  }

  // Render tagline as React elements (first line plain, rest bold italic)
  function renderLines(text) {
    const lines = text.split('\n').filter(Boolean);
    return lines.map((line, i) => (
      <span key={i}>
        {i === 0 ? line : <em className="tagline-em">{line}</em>}
        {i < lines.length - 1 && <br />}
      </span>
    ));
  }

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="tagline-input"
        rows={3}
        style={{ fontSize: 'max(16px, 1.15rem)' }}
      />
    );
  }

  return (
    <p className="tagline-display" onClick={startEdit}>
      {renderLines(value)}
    </p>
  );
}

// ════════════════════════════════════════════════════════════════
// LOADING SCREEN
// ════════════════════════════════════════════════════════════════
function LoadingScreen() {
  return (
    <div className="screen screen-flex-center">
      <div style={{ textAlign: 'center' }}>
        <div className="spinner"></div>
        <p className="loading-title">AllUsBasecamp</p>
        <p className="loading-sub">Family Hub</p>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MEMBER MODAL  (bottom sheet)
// ════════════════════════════════════════════════════════════════
function MemberModal({ slot, member, onSave, onDelete, onClose }) {
  const [name,       setName]       = useState(member?.name || '');
  const [email,      setEmail]      = useState(member?.email || '');
  const [previewUrl, setPreviewUrl] = useState(member?.avatar_url || null);
  const [pendingFile,setPendingFile] = useState(null);
  const [saving,     setSaving]     = useState(false);
  const fileRef = useRef(null);

  function handleFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    // Reset so same file can be chosen again
    e.target.value = '';
    setPendingFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPreviewUrl(ev.target.result);
    reader.readAsDataURL(f);
  }

  async function handleSave() {
    if (!name.trim()) { fileRef.current?.focus(); return; }
    setSaving(true);
    try {
      await onSave(slot, name.trim(), pendingFile, member?.avatar_url, email.trim().toLowerCase() || null);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    await onDelete(slot, member.id);
  }

  return (
    <div className="modal" onClick={e => e.target.className === 'modal' && onClose()}>
      <div className="modal-sheet">
        <div className="modal-handle"></div>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>

        <h2 className="modal-heading">{member ? 'Edit Member' : 'Add Member'}</h2>

        {/* Avatar picker */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div className="avatar-pick" onClick={() => fileRef.current?.click()}>
            {previewUrl && previewUrl.startsWith('emoji:')
              ? <span style={{ fontSize: '3rem', lineHeight: 1 }}>{previewUrl.slice(6)}</span>
              : previewUrl
                ? <img src={previewUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <span style={{ fontSize: '3rem' }}>👤</span>
            }
          </div>
          <button className="upload-label" type="button" onClick={() => fileRef.current?.click()}>
            📷 Choose Photo
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
        </div>

        {/* Name input */}
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          placeholder="Member name"
          maxLength={20}
          className="modal-name-input"
          style={{ fontSize: 'max(16px, 1rem)' }}
          autoComplete="off"
        />

        {/* Email input */}
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email (optional)"
          className="modal-name-input"
          style={{ fontSize: 'max(16px, 1rem)', marginTop: 10 }}
          autoComplete="email"
        />

        <button
          className={`modal-save-btn${saving ? ' loading' : ''}`}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Member'}
        </button>

        {member && (
          <button className="modal-delete-btn" onClick={handleDelete}>
            Remove Member
          </button>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// CREATE ACTIVITY MODAL
// ════════════════════════════════════════════════════════════════
function CreateActivityModal({ onClose, onSave }) {
  const [name,     setName]     = useState('');
  const [emoji,    setEmoji]    = useState(PRESET_EMOJIS[0]);
  const [grad,     setGrad]     = useState(PRESET_GRADIENTS[0]);
  const [saving,   setSaving]   = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), emoji, gradient: grad.value, pinColor: grad.pinColor });
    } finally { setSaving(false); }
  }

  return (
    <div className="modal" onClick={e => e.target.className === 'modal' && onClose()}>
      <div className="modal-sheet" style={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-handle" />
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="modal-heading">Create New Activity</h2>

        {/* Live preview tile */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ background: grad.value, borderRadius: 16, padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: 220 }}>
            <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{emoji}</span>
            <div>
              <p style={{ fontWeight: 700, color: 'white', margin: 0, fontSize: '0.95rem' }}>
                {name || 'Activity name'}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.75)', margin: 0, fontSize: '0.75rem' }}>
                Custom memory activity
              </p>
            </div>
          </div>
        </div>

        {/* Name input */}
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder="Activity name…" maxLength={30}
          className="modal-name-input" style={{ fontSize: 'max(16px,1rem)' }} autoComplete="off" />

        {/* Emoji picker */}
        <p className="create-act-label">Choose an icon</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 6, marginBottom: 16 }}>
          {PRESET_EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)}
              style={{ fontSize: '1.35rem', padding: '7px 4px', borderRadius: 10, border: 'none',
                cursor: 'pointer', background: emoji === e ? '#e0e7ff' : '#f8fafc',
                outline: emoji === e ? '2px solid #6366f1' : 'none', fontFamily: 'inherit' }}>
              {e}
            </button>
          ))}
        </div>

        {/* Colour picker */}
        <p className="create-act-label">Choose a colour</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {PRESET_GRADIENTS.map(g => (
            <button key={g.value} onClick={() => setGrad(g)}
              style={{ width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: g.value, flexShrink: 0,
                outline: grad.value === g.value ? '3px solid #1e293b' : '2px solid transparent',
                transition: 'outline 0.12s' }} title={g.label} />
          ))}
        </div>

        <button className={`modal-save-btn${(!name.trim() || saving) ? ' continue-btn--disabled' : ''}`}
          onClick={handleCreate} disabled={!name.trim() || saving}>
          {saving ? 'Creating…' : 'Create Activity'}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ACTIVITY MAP SCREEN  (shared by Plan Vacation / Event / Dine)
// ════════════════════════════════════════════════════════════════
function ActivityMapScreen({ activityType, onBack, allActivitiesMeta }) {
  const meta = (allActivitiesMeta && allActivitiesMeta[activityType]) || ACTIVITY_META[activityType] || ACTIVITY_META.vacation;

  const [pins,       setPins]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showList,   setShowList]   = useState(false);
  const [searchQ,    setSearchQ]    = useState('');
  const [searching,  setSearching]  = useState(false);
  const [pendingPin, setPendingPin] = useState(null); // { lat, lng, label }
  const [monthInput, setMonthInput] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  const mapContainerRef  = useRef(null);
  const mapInstanceRef   = useRef(null);
  const markersRef       = useRef({});      // id → L.marker
  const pendingMarkerRef = useRef(null);
  const actTypeRef       = useRef(activityType);

  // Load all family map pins
  useEffect(() => {
    sbLoadMapPins()
      .then(data => { setPins(data); setLoading(false); })
      .catch(err  => { console.error(err); setLoading(false); _showToast('Could not load pins'); });
  }, []);

  // Init Leaflet map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const L = window.L;
    if (!L) return;

    const map = L.map(mapContainerRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OSM</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', e => {
      const { lat, lng } = e.latlng;
      setPendingPin({ lat, lng, label: `${lat.toFixed(5)}, ${lng.toFixed(5)}` });
    });

    mapInstanceRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Show/update pending marker (pulsing dot) while awaiting confirmation
  useEffect(() => {
    const L = window.L; const map = mapInstanceRef.current;
    if (!L || !map) return;
    if (pendingMarkerRef.current) { pendingMarkerRef.current.remove(); pendingMarkerRef.current = null; }
    if (pendingPin) {
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:18px;height:18px;background:${meta.pinColor};border:3px solid white;
          border-radius:50%;box-shadow:0 0 0 4px ${meta.pinColor}55;animation:pulse 1s infinite;"></div>`,
        iconSize: [18, 18], iconAnchor: [9, 9],
      });
      pendingMarkerRef.current = L.marker([pendingPin.lat, pendingPin.lng], { icon }).addTo(map);
    }
  }, [pendingPin]);

  // Sync saved pins ↔ Leaflet markers (diff-based so existing markers are preserved)
  useEffect(() => {
    const L = window.L; const map = mapInstanceRef.current;
    if (!L || !map || loading) return;
    const pinIds = new Set(pins.map(p => String(p.id)));
    // Remove stale
    Object.keys(markersRef.current).forEach(id => {
      if (!pinIds.has(id)) { markersRef.current[id].remove(); delete markersRef.current[id]; }
    });
    // Add new
    pins.forEach(pin => {
      const key = String(pin.id);
      if (!markersRef.current[key]) {
        const m = (allActivitiesMeta && allActivitiesMeta[pin.type]) || ACTIVITY_META[pin.type] || meta;
        const icon   = createActivityPin(pin.type, pin.month_year, allActivitiesMeta);
        const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
        marker.bindPopup(
          `<div style="text-align:center;min-width:130px;font-family:Inter,sans-serif;">
            <div style="font-size:1.2rem;margin-bottom:4px;">${m.icon}</div>
            <b style="font-size:0.85rem;">${pin.label || 'Location'}</b><br/>
            <span style="font-size:0.75rem;color:#64748b;">${m.label}</span><br/>
            <span style="font-size:0.75rem;color:#94a3b8;">${pin.month_year}</span><br/>
            <button onclick="window._wtDelPin('${key}')"
              style="margin-top:8px;padding:5px 14px;background:#ef4444;color:white;
              border:none;border-radius:8px;font-size:0.8rem;cursor:pointer;font-family:inherit;">
              🗑 Remove
            </button>
          </div>`, { maxWidth: 210 }
        );
        markersRef.current[key] = marker;
      }
    });
  }, [pins, loading]);

  // Expose delete handler to popup buttons
  useEffect(() => {
    window._wtDelPin = async (id) => {
      mapInstanceRef.current?.closePopup();
      setPins(prev => prev.filter(p => String(p.id) !== id));
      if (!id.startsWith('_opt_')) {
        try { await sbDeleteMapPin(id); } catch (e) { console.error(e); }
      }
    };
    return () => { delete window._wtDelPin; };
  }, []);

  async function handleSearch() {
    const q = searchQ.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`);
      const data = await res.json();
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const plat = parseFloat(lat), plng = parseFloat(lon);
        mapInstanceRef.current?.flyTo([plat, plng], 11);
        setPendingPin({ lat: plat, lng: plng, label: display_name });
        setSearchQ('');
      } else { _showToast('Location not found'); }
    } catch { _showToast('Search failed — check connection'); }
    finally   { setSearching(false); }
  }

  async function confirmPin() {
    if (!pendingPin) return;
    const my   = formatMonthYear(monthInput);
    const type = actTypeRef.current;
    const temp = { id: `_opt_${Date.now()}`, type, lat: pendingPin.lat, lng: pendingPin.lng,
                   label: pendingPin.label, month_year: my, created_at: new Date().toISOString() };
    setPins(prev => [...prev, temp]);
    setPendingPin(null);
    try {
      const saved = await sbSaveMapPin(type, pendingPin.lat, pendingPin.lng, pendingPin.label, my);
      setPins(prev => prev.map(p => p.id === temp.id ? saved : p));
    } catch (err) {
      console.error('sbSaveMapPin error:', err);
      setPins(prev => prev.filter(p => p.id !== temp.id));
      const msg = err?.message || err?.details || 'unknown error';
      _showToast(`Pin not saved: ${msg}`);
    }
  }

  return (
    <div className="screen" style={{ background: '#f1f5f9' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Header ── */}
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0',
          padding: 'calc(var(--sat) + 14px) 16px 14px' }}>
          <button className="back-btn" onClick={onBack} style={{ marginBottom: 10 }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>{meta.icon}</span>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>{meta.label}</h1>
              <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>All family pins on this map</p>
            </div>
            <button onClick={() => setShowList(s => !s)}
              style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                background: showList ? '#6366f1' : 'white', color: showList ? 'white' : '#6366f1',
                fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 0.15s, color 0.15s' }}>
              📋 {showList ? 'Map' : 'List'}
            </button>
          </div>
        </div>

        {/* ── Search + month picker ── */}
        <div style={{ background: 'white', padding: '10px 14px 12px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" value={searchQ} onChange={e => setSearchQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search a city, place or address…"
              className="vac-search-input" style={{ fontSize: 'max(16px,0.88rem)' }} />
            <button onClick={handleSearch} disabled={searching} className="vac-search-btn">
              {searching ? '…' : '🔍'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.74rem', color: '#64748b', fontWeight: 500, flexShrink: 0 }}>Pin date:</span>
            <input type="month" value={monthInput} onChange={e => setMonthInput(e.target.value)}
              className="vac-date-input" style={{ flex: 1, maxWidth: 155 }} />
            {/* Legend */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 120, justifyContent: 'flex-end' }}>
              {Object.values(allActivitiesMeta || ACTIVITY_META).map(m => (
                <span key={m.label} title={m.label}
                  style={{ fontSize: '0.95rem', lineHeight: 1, opacity: m.pinColor === meta.pinColor ? 1 : 0.4 }}>
                  {m.icon}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Map fills remaining space ── */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <div ref={mapContainerRef} style={{ position: 'absolute', inset: 0 }} />

          {/* First-use hint */}
          {!loading && pins.length === 0 && !pendingPin && (
            <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(15,23,42,0.76)', color: 'white', padding: '7px 16px', borderRadius: 20,
              fontSize: '0.77rem', fontWeight: 500, zIndex: 500, pointerEvents: 'none', whiteSpace: 'nowrap',
              boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
              Tap the map or search to drop a pin
            </div>
          )}

          {/* ── All-pins list panel ── */}
          {showList && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 900, background: 'white',
              display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', margin: 0 }}>
                    All Saved Pins <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: '0.85rem' }}>({pins.length})</span>
                  </p>
                  <button onClick={() => setShowList(false)}
                    style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer', color: '#64748b', padding: '4px 8px' }}>✕</button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 24px' }}>
                {pins.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', padding: '32px 0', fontSize: '0.9rem' }}>
                    No pins yet — tap the map to add one!
                  </p>
                ) : pins.map(pin => {
                  const m = (allActivitiesMeta && allActivitiesMeta[pin.type]) || ACTIVITY_META[pin.type] || ACTIVITY_META.vacation;
                  return (
                    <div key={pin.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 13px', background: '#f8fafc', borderRadius: 12, marginBottom: 8,
                      border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: m.gradient || m.pinColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.2rem', flexShrink: 0 }}>{m.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1e293b', margin: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pin.label || 'Location'}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>
                          {m.label} · {pin.month_year}
                        </p>
                      </div>
                      <button onClick={() => window._wtDelPin(String(pin.id))}
                        style={{ color: '#ef4444', background: 'none', border: 'none',
                          cursor: 'pointer', fontSize: '1rem', padding: '4px 6px', flexShrink: 0 }}>
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Pending-pin confirmation sheet ── */}
          {pendingPin && (
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 1000,
              background: 'white', borderRadius: '22px 22px 0 0',
              boxShadow: '0 -4px 28px rgba(0,0,0,0.16)', padding: '14px 18px 28px' }}>
              <div style={{ width: 38, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 14px' }} />
              <p style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, marginBottom: 4,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>📍 Selected location</p>
              <p style={{ fontSize: '0.88rem', color: '#1e293b', lineHeight: 1.4, marginBottom: 14 }}>
                {pendingPin.label}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setPendingPin(null)}
                  style={{ flex: 1, padding: '13px', borderRadius: 14, border: '1.5px solid #e2e8f0',
                    background: 'white', color: '#64748b', fontWeight: 600, fontSize: '0.88rem',
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  Cancel
                </button>
                <button onClick={confirmPin}
                  style={{ flex: 2, padding: '13px', borderRadius: 14, border: 'none',
                    background: meta.pinColor, color: 'white', fontWeight: 700, fontSize: '0.88rem',
                    cursor: 'pointer', fontFamily: 'inherit' }}>
                  {meta.icon} Drop Pin · {formatMonthYear(monthInput)}
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// PLAN SCREEN
// ════════════════════════════════════════════════════════════════
function PlanScreen({ planCtx, onBack }) {
  const [plans,      setPlans]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [inputValue, setInputValue] = useState('');
  const listRef = useRef(null);
  const meta    = PLAN_META[planCtx.type] || { icon: '📝', label: planCtx.type };

  useEffect(() => {
    setLoading(true);
    sbLoadPlans(planCtx.type, planCtx.memberId)
      .then(data => { setPlans(data); setLoading(false); })
      .catch(err  => { console.error(err); setLoading(false); _showToast('Could not load plans'); });
  }, [planCtx.type, planCtx.memberId]);

  async function handleAdd() {
    const content = inputValue.trim();
    if (!content) return;
    setInputValue('');

    // Optimistic insert
    const temp = { id: `_opt_${Date.now()}`, content, created_at: new Date().toISOString() };
    setPlans(prev => [...prev, temp]);
    setTimeout(() => listRef.current?.scrollTo({ top: 9999, behavior: 'smooth' }), 60);

    try {
      const saved = await sbAddPlan(planCtx.type, planCtx.memberId, content);
      setPlans(prev => prev.map(p => p.id === temp.id ? saved : p));
    } catch (err) {
      console.error(err);
      setPlans(prev => prev.filter(p => p.id !== temp.id));
      _showToast('Could not save — check connection');
    }
  }

  async function handleDelete(id) {
    setPlans(prev => prev.filter(p => p.id !== id));
    try { await sbDeletePlan(id, planCtx.memberId); }
    catch (err) { console.error(err); }
  }

  return (
    <div className="screen">
      <div className="inner-screen">

        <div className="inner-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="inner-title-row">
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>{meta.icon}</span>
            <h1 className="inner-title">{meta.label}</h1>
          </div>
        </div>

        <div className="plan-body">
          <ul className="plan-list" ref={listRef}>
            {loading && <li className="plan-empty-msg">Loading…</li>}
            {!loading && plans.length === 0 && (
              <li className="plan-empty-msg">Nothing here yet — add your first entry below!</li>
            )}
            {plans.map(plan => (
              <li key={plan.id} className="plan-item">
                <span className="plan-item-text">{plan.content}</span>
                <span className="plan-item-date">{formatDate(plan.created_at)}</span>
                <button className="plan-delete-btn" onClick={() => handleDelete(plan.id)} aria-label="Delete">✕</button>
              </li>
            ))}
          </ul>

          <div className="plan-add-row">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="Add a note or plan…"
              maxLength={200}
              className="plan-input"
              style={{ fontSize: 'max(16px, 0.9rem)' }}
            />
            <button className="plan-add-btn" onClick={handleAdd}>＋</button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MEMORIES MAP VIEW  (read-only Leaflet map for CommonAreaScreen)
// ════════════════════════════════════════════════════════════════
function MemoriesMapView({ pins, allActivitiesMeta }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const L = window.L;
    if (!L) return;
    const map = L.map(containerRef.current).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OSM</a>', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 150);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const L = window.L; const map = mapRef.current;
    if (!L || !map) return;
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    pins.forEach(pin => {
      const m    = (allActivitiesMeta && allActivitiesMeta[pin.type]) || ACTIVITY_META[pin.type] || ACTIVITY_META.vacation;
      const icon = createActivityPin(pin.type, pin.month_year, allActivitiesMeta);
      const mk   = L.marker([pin.lat, pin.lng], { icon }).addTo(map)
        .bindPopup(`<div style="text-align:center;min-width:110px;font-family:Inter,sans-serif;">
          <div style="font-size:1.3rem;margin-bottom:4px;">${m.icon}</div>
          <b style="font-size:0.82rem;">${pin.label || 'Location'}</b><br/>
          <span style="font-size:0.72rem;color:#64748b;">${m.label} · ${pin.month_year}</span>
        </div>`, { maxWidth: 200 });
      markersRef.current.push(mk);
    });
    if (pins.length > 0) {
      try {
        const bounds = window.L.latLngBounds(pins.map(p => [p.lat, p.lng]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
      } catch (_) {}
    } else {
      map.setView([20, 0], 2);
    }
  }, [pins, allActivitiesMeta]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ════════════════════════════════════════════════════════════════
// COMMON AREA SCREEN  (modern card tiles)
// ════════════════════════════════════════════════════════════════
function CommonAreaScreen({ onBack, onSelectTile, customActivities, onCreateActivity, mapPins, allActivitiesMeta, onDeletePin, defaultTab }) {
  const [activeTab, setActiveTab] = useState(defaultTab || 'plan');    // 'plan' | 'memories'
  const [memView,   setMemView]   = useState('list');    // 'list' | 'map'
  const [filter,    setFilter]    = useState('all');     // 'all' | activityType key

  const pins = mapPins || [];

  // Types that actually have pins (for filter chips)
  const pinTypes = useMemo(() => [...new Set(pins.map(p => p.type))], [pins]);

  // Filtered pins
  const filteredPins = useMemo(
    () => filter === 'all' ? pins : pins.filter(p => p.type === filter),
    [pins, filter]
  );

  // When filter type no longer has pins, reset to 'all'
  useEffect(() => {
    if (filter !== 'all' && !pinTypes.includes(filter)) setFilter('all');
  }, [pinTypes, filter]);

  const TABS = [['plan', '📋 Plan'], ['memories', '🗺 Memories']];

  return (
    <div className="screen" style={{ background: 'linear-gradient(180deg,#f0f4ff 0%,#fafafa 100%)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Header */}
        <div className="inner-header" style={{ paddingBottom: 10 }}>
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="inner-title-row">
            <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>🏠</span>
            <h1 className="inner-title">Family Basecamp</h1>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          {TABS.map(([tab, label]) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer',
                fontWeight: activeTab === tab ? 700 : 500, fontFamily: 'inherit', fontSize: '0.88rem',
                color: activeTab === tab ? '#6366f1' : '#64748b',
                borderBottom: activeTab === tab ? '2.5px solid #6366f1' : '2.5px solid transparent',
                transition: 'color 0.15s, border-color 0.15s' }}>
              {label}
              {tab === 'memories' && pins.length > 0 && (
                <span style={{ marginLeft: 5, background: '#6366f1', color: 'white',
                  borderRadius: 10, fontSize: '0.7rem', padding: '1px 6px', fontWeight: 700 }}>
                  {pins.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ PLAN TAB ══ */}
        {activeTab === 'plan' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px 32px' }}>
            <p style={{ fontSize: '0.73rem', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.06em',
              textTransform: 'uppercase', marginBottom: 14 }}>Plan Together</p>

            {COMMON_TILES.map(tile => (
              <div key={tile.type} onClick={() => onSelectTile(tile.type)}
                className="basecamp-card" style={{ background: tile.gradient }}>
                <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{tile.icon}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: 'white', margin: 0 }}>{tile.label}</p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)', margin: '3px 0 0' }}>{tile.subtitle}</p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.3rem' }}>›</span>
              </div>
            ))}

            {(customActivities || []).map(act => (
              <div key={act.id} onClick={() => onSelectTile(act.id)}
                className="basecamp-card" style={{ background: act.gradient }}>
                <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>{act.emoji}</span>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 700, fontSize: '1rem', color: 'white', margin: 0 }}>{act.name}</p>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)', margin: '3px 0 0' }}>Custom memory activity</p>
                </div>
                <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '1.3rem' }}>›</span>
              </div>
            ))}

            <button onClick={onCreateActivity} className="create-memories-btn">
              <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>＋</span>
              Create New Memories
            </button>
          </div>
        )}

        {/* ══ MEMORIES TAB ══ */}
        {activeTab === 'memories' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Controls: filter carousel + map/list toggle */}
            <div className="bg-white border-b border-slate-200 flex-shrink-0 pt-2.5 pb-2.5">

              {/* ── Filter carousel ── */}
              {/* Fade-edge wrapper: masks the right edge to signal more chips */}
              <div className="relative mb-2.5"
                style={{
                  maskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)',
                }}>
                <div className="filter-carousel flex flex-nowrap gap-2 overflow-x-auto px-3.5"
                  style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingRight: 32 }}>

                  {/* "All" chip */}
                  <button
                    onClick={() => setFilter('all')}
                    className={[
                      'flex-shrink-0 inline-flex items-center gap-1 px-4 py-1.5 rounded-full',
                      'text-[0.8rem] font-semibold whitespace-nowrap border',
                      'transition-all duration-150 active:scale-95',
                      filter === 'all'
                        ? 'bg-[#1e3a8a] text-white border-[#1e3a8a] shadow-sm'
                        : 'bg-cream text-slate-500 border-slate-200 hover:border-slate-300',
                    ].join(' ')}>
                    All&nbsp;<span className="opacity-70 text-[0.72rem]">({pins.length})</span>
                  </button>

                  {/* Dynamic pin-type chips */}
                  {pinTypes.map(type => {
                    const m = (allActivitiesMeta && allActivitiesMeta[type]) || ACTIVITY_META[type];
                    if (!m) return null;
                    const count = pins.filter(p => p.type === type).length;
                    return (
                      <button key={type} onClick={() => setFilter(type)}
                        className={[
                          'flex-shrink-0 inline-flex items-center gap-1 px-4 py-1.5 rounded-full',
                          'text-[0.8rem] font-semibold whitespace-nowrap border',
                          'transition-all duration-150 active:scale-95',
                          filter === type
                            ? 'bg-[#1e3a8a] text-white border-[#1e3a8a] shadow-sm'
                            : 'bg-cream text-slate-500 border-slate-200 hover:border-slate-300',
                        ].join(' ')}>
                        {m.icon}&nbsp;{m.label.split(' ').pop()}&nbsp;<span className="opacity-70 text-[0.72rem]">({count})</span>
                      </button>
                    );
                  })}

                </div>
              </div>

              {/* ── Map / List toggle ── */}
              <div className="flex gap-2 px-3.5">
                {[['list', '☰ List'], ['map', '🗺 Map']].map(([v, lbl]) => (
                  <button key={v} onClick={() => setMemView(v)}
                    className={[
                      'flex-1 py-2 rounded-xl text-[0.82rem] font-semibold border-none cursor-pointer',
                      'font-[inherit] transition-all duration-150 active:scale-95',
                      memView === v ? 'bg-indigo-500 text-white shadow-sm' : 'bg-slate-100 text-slate-500',
                    ].join(' ')}>
                    {lbl}
                  </button>
                ))}
              </div>

            </div>

            {/* ── MAP VIEW ── */}
            {memView === 'map' && (
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {filteredPins.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', height: '100%', color: '#94a3b8', gap: 12 }}>
                    <span style={{ fontSize: '3rem' }}>🗺</span>
                    <p style={{ fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.5 }}>
                      No memories pinned yet.<br/>Tap a tile in Plan to start!
                    </p>
                  </div>
                ) : (
                  <MemoriesMapView pins={filteredPins} allActivitiesMeta={allActivitiesMeta} />
                )}
              </div>
            )}

            {/* ── LIST VIEW ── */}
            {memView === 'list' && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px 24px' }}>
                {filteredPins.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', paddingTop: 60, color: '#94a3b8', gap: 12 }}>
                    <span style={{ fontSize: '3rem' }}>📍</span>
                    <p style={{ fontSize: '0.9rem', textAlign: 'center', lineHeight: 1.5 }}>
                      No memories pinned yet.<br/>Tap a tile in Plan to start!
                    </p>
                  </div>
                ) : filteredPins.map(pin => {
                  const m = (allActivitiesMeta && allActivitiesMeta[pin.type]) || ACTIVITY_META[pin.type] || ACTIVITY_META.vacation;
                  return (
                    <div key={pin.id} className="mem-list-item" onClick={() => onSelectTile(pin.type)}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: m.gradient || m.pinColor || '#6366f1',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                        {m.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.86rem', fontWeight: 600, color: '#1e293b', margin: 0,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {pin.label || 'Location'}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0' }}>
                          {m.label} · {pin.month_year}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); onDeletePin(String(pin.id)); }}
                        style={{ background: 'none', border: 'none', color: '#cbd5e1',
                          fontSize: '1rem', cursor: 'pointer', padding: '4px 6px', flexShrink: 0,
                          transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>
                        🗑
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MEMBER AREA SCREEN
// ════════════════════════════════════════════════════════════════
function MemberAreaScreen({ member, onBack, onContinue }) {
  const [selectedTile, setSelectedTile] = useState(null);

  function handleSelect(type) {
    setSelectedTile(prev => prev === type ? null : type);
  }

  const avatarSrc = member.avatar_url || defaultAvatar(member.name);

  return (
    <div className="screen">
      <div className="inner-screen">

        <div className="inner-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="inner-title-row">
            <div className="member-hero-avatar">
              {member.avatar_url && member.avatar_url.startsWith('emoji:')
                ? <span style={{ fontSize: '1.7rem', lineHeight: 1 }}>{member.avatar_url.slice(6)}</span>
                : member.avatar_url
                  ? <img src={member.avatar_url} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : member.name.charAt(0).toUpperCase()
              }
            </div>
            <h1 className="inner-title">{member.name}</h1>
          </div>
        </div>

        <div className="tile-grid">
          {MEMBER_TILES.map(t => (
            <ActivityTile
              key={t.type}
              type={t.type}
              icon={t.icon}
              label={t.label}
              color={t.color}
              selected={selectedTile === t.type}
              onSelect={handleSelect}
            />
          ))}
        </div>

        <ContinueButton
          enabled={!!selectedTile}
          onClick={() => selectedTile && onContinue(selectedTile, member.id)}
        />

      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// AUTH MODAL — bottom sheet triggered by the user icon
// Returning user (email saved in localStorage): password only
// New user: email + password  →  signUp (auto sign-in if already exists)
// ════════════════════════════════════════════════════════════════
const AUTH_EMAIL_KEY = 'abc_user_email';

function AuthModal({ onClose, onAuth }) {
  const stored      = localStorage.getItem(AUTH_EMAIL_KEY) || '';
  const [mode,      setMode]     = useState(stored ? 'returning' : 'new');
  const [email,     setEmail]    = useState(stored);
  const [password,  setPassword] = useState('');
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr || !password) return;
    setLoading(true); setError('');

    if (mode === 'returning') {
      // Existing device — sign in directly
      const { data, error: err } = await window.sb.auth.signInWithPassword({ email: addr, password });
      setLoading(false);
      if (err) { setError('Incorrect password. Try again.'); return; }
      localStorage.setItem(AUTH_EMAIL_KEY, addr);
      onAuth(data.user); onClose();

    } else {
      // New device / new user — try sign up first
      const { data: sd, error: se } = await window.sb.auth.signUp({ email: addr, password });

      if (se && /already registered/i.test(se.message)) {
        // Account exists — sign in with these credentials
        const { data, error: ie } = await window.sb.auth.signInWithPassword({ email: addr, password });
        setLoading(false);
        if (ie) { setError('Wrong password for this account.'); return; }
        localStorage.setItem(AUTH_EMAIL_KEY, addr);
        onAuth(data.user); onClose();

      } else if (se) {
        setLoading(false);
        setError(se.message);

      } else if (sd.session) {
        // Signed up, session created immediately (email confirm disabled)
        setLoading(false);
        localStorage.setItem(AUTH_EMAIL_KEY, addr);
        onAuth(sd.user); onClose();

      } else {
        // Email confirmation required — guide user
        setLoading(false);
        setError('Almost there! Check your email to confirm your account, then sign in again.');
      }
    }
  }

  function switchAccount() {
    localStorage.removeItem(AUTH_EMAIL_KEY);
    setEmail(''); setPassword(''); setError('');
    setMode('new');
  }

  const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
    sheet:   { width: '100%', maxWidth: 390, background: '#FDFBF7', borderRadius: '24px 24px 0 0', padding: '24px 24px 52px', boxSizing: 'border-box' },
    drag:    { width: 40, height: 4, borderRadius: 9, background: '#E4D9C8', margin: '0 auto 22px' },
    title:   { fontSize: '1.2rem', fontWeight: 800, color: '#1A531A', marginBottom: 5 },
    sub:     { fontSize: '0.82rem', color: '#6b7280', marginBottom: 18, lineHeight: 1.5 },
    inp:     { display: 'block', width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 12, border: '1.5px solid #E4D9C8', background: '#F0EBE1', fontSize: '1rem', color: '#1A531A', outline: 'none', fontFamily: 'inherit', marginBottom: 10 },
    btn:     (off) => ({ width: '100%', marginTop: 4, padding: '13px 0', borderRadius: 12, border: 'none', cursor: off ? 'not-allowed' : 'pointer', background: off ? '#e5e7eb' : 'linear-gradient(135deg,#2D7A2D,#1A531A)', color: off ? '#9ca3af' : '#fff', fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit' }),
    err:     { color: '#dc2626', fontSize: '0.78rem', marginTop: 2, marginBottom: 6 },
    ghost:   { background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  };

  const ready = mode === 'returning' ? !!password : (!!email.trim() && !!password);

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={S.sheet}>
        <div style={S.drag} />

        {mode === 'returning' ? (
          <form onSubmit={handleSubmit}>
            <p style={S.title}>Welcome back 👋</p>
            <p style={S.sub}>
              Signing in as <strong style={{ color: '#1A531A' }}>{email}</strong>
            </p>
            <input
              type="password" required autoFocus
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={S.inp}
              autoComplete="current-password"
            />
            {error && <p style={S.err}>{error}</p>}
            <button type="submit" disabled={loading || !ready} style={S.btn(loading || !ready)}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button type="button" onClick={switchAccount}
                      style={{ ...S.ghost, color: '#6b7280', fontSize: '0.78rem' }}>
                Not you? Use a different account
              </button>
            </div>
          </form>

        ) : (
          <form onSubmit={handleSubmit}>
            <p style={S.title}>Sign In</p>
            <p style={S.sub}>First time here? We'll create your account automatically.</p>
            <input
              type="email" required autoFocus
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={S.inp}
              autoComplete="email"
            />
            <input
              type="password" required
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ ...S.inp, marginBottom: 0 }}
              autoComplete="new-password"
            />
            {error && <p style={S.err}>{error}</p>}
            <button type="submit" disabled={loading || !ready} style={S.btn(loading || !ready)}>
              {loading ? 'Please wait…' : 'Continue →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// MEMBER PIN MODAL
// Full-screen — set PIN on first visit, enter PIN on return visits
// PIN stored in allusbasecamp_settings as member_pin_{id}
// ════════════════════════════════════════════════════════════════
function MemberPinModal({ member, hasPin, onVerified, onCancel }) {
  // mode: 'set' → 'confirm' → done, or 'enter' → done
  const [mode,    setMode]    = useState(hasPin ? 'enter' : 'set');
  const [digits,  setDigits]  = useState('');   // current input
  const firstPin  = useRef('');                 // holds original PIN while confirming
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const hiddenRef = useRef(null);

  // Focus the hidden input whenever the overlay is tapped
  function focusHidden() { hiddenRef.current?.focus(); }

  // Auto-focus on mount and on mode change
  useEffect(() => {
    setDigits(''); setError('');
    setTimeout(() => hiddenRef.current?.focus(), 80);
  }, [mode]);

  async function handleComplete(value) {
    if (mode === 'set') {
      firstPin.current = value;
      setMode('confirm');

    } else if (mode === 'confirm') {
      if (value !== firstPin.current) {
        setError('PINs do not match. Try again.');
        firstPin.current = '';
        setMode('set');
        return;
      }
      setLoading(true); setError('');
      const hashed = await hashPin(firstPin.current, member.id);
      const { error: err } = await window.sb
        .from('allusbasecamp_settings')
        .upsert({ key: `member_pin_${member.id}`, value: hashed, updated_at: new Date().toISOString() },
                 { onConflict: 'key' });
      setLoading(false);
      if (err) { setError('Could not save PIN. Try again.'); setMode('set'); return; }
      onVerified();

    } else {
      // enter mode
      setLoading(true); setError('');
      const [hashed, result] = await Promise.all([
        hashPin(value, member.id),
        window.sb.from('allusbasecamp_settings')
          .select('value').eq('key', `member_pin_${member.id}`).maybeSingle(),
      ]);
      setLoading(false);
      const { data, error: err } = result;
      if (err || !data) { setError('Could not verify. Try again.'); setDigits(''); return; }
      if (data.value === hashed) {
        onVerified();
      } else {
        setError('Incorrect PIN. Try again.');
        setDigits('');
      }
    }
  }

  function handleChange(e) {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setDigits(val);
    setError('');
    if (val.length === 4) handleComplete(val);
  }

  const avatarUrl = member.avatar_url;

  const titles = {
    set:     { heading: `Hi, ${member.name}!`, sub: 'Create a 4-digit PIN to protect your space.' },
    confirm: { heading: 'Confirm your PIN',     sub: 'Enter the same 4 digits again.' },
    enter:   { heading: `Hi, ${member.name}!`, sub: 'Enter your 4-digit PIN to continue.' },
  };

  const S = {
    overlay: {
      position: 'absolute', inset: 0, zIndex: 300,
      background: '#FDFBF7',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 28px',
    },
    avatarWrap: {
      width: 72, height: 72, borderRadius: '50%',
      background: 'linear-gradient(135deg,#e8f5e9,#c8e6c9)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '2rem', marginBottom: 16, overflow: 'hidden',
      boxShadow: '0 4px 16px rgba(26,83,26,0.15)',
    },
    name:  { margin: '0 0 4px', fontSize: '1.3rem', fontWeight: 800, color: '#1A531A', textAlign: 'center' },
    sub:   { margin: '0 0 28px', fontSize: '0.84rem', color: 'rgba(26,83,26,0.5)', textAlign: 'center', lineHeight: 1.5 },
    dots:  { display: 'flex', gap: 16, marginBottom: 20 },
    dot:   (filled) => ({
      width: 18, height: 18, borderRadius: '50%',
      background: filled ? '#1A531A' : 'none',
      border: `2.5px solid ${filled ? '#1A531A' : '#C8D9C8'}`,
      transition: 'background 0.15s, border-color 0.15s',
    }),
    err:    { color: '#dc2626', fontSize: '0.82rem', marginBottom: 14, textAlign: 'center' },
    cancel: {
      marginTop: 20, background: 'none', border: 'none', cursor: 'pointer',
      color: 'rgba(26,83,26,0.4)', fontSize: '0.82rem', fontFamily: 'inherit',
    },
  };

  return (
    <div style={S.overlay} onClick={focusHidden}>

      {/* Hidden input captures all keystrokes — reliable on all mobile keyboards */}
      <input
        ref={hiddenRef}
        type="tel"
        inputMode="numeric"
        value={digits}
        onChange={handleChange}
        disabled={loading}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
      />

      <div style={S.avatarWrap}>
        {avatarUrl && avatarUrl.startsWith('emoji:')
          ? <span>{avatarUrl.slice(6)}</span>
          : avatarUrl
            ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span>👤</span>
        }
      </div>

      <p style={S.name}>{titles[mode].heading}</p>
      <p style={S.sub}>{titles[mode].sub}</p>

      {/* 4 dot indicators */}
      <div style={S.dots}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={S.dot(i < digits.length)} />
        ))}
      </div>

      {error && <p style={S.err}>{error}</p>}
      {loading && <p style={{ color: '#1A531A', fontSize: '0.85rem', marginBottom: 8 }}>Please wait…</p>}

      <button style={S.cancel} onClick={onCancel}>Cancel</button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// WELCOME SCREEN
// ════════════════════════════════════════════════════════════════
function WelcomeScreen({ members, tagline, onTaglineSave, onMemberSlotClick, onRemoveMember }) {
  const [editMode,      setEditMode]      = useState(false);
  const [showGateMsg,   setShowGateMsg]   = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null); // { slot, member, hasPin }

  async function requestRemove(slot, member) {
    const { data } = await window.sb
      .from('allusbasecamp_settings')
      .select('value').eq('key', `member_pin_${member.id}`).maybeSingle();
    if (data?.value) {
      setPendingRemove({ slot, member, hasPin: true });
    } else {
      // No PIN — remove immediately
      onRemoveMember(slot, member.id);
    }
  }

  return (
    <div className="screen" onClick={() => { if (editMode) setEditMode(false); }}>

      {/* Tagline */}
      <div className="tagline-area">
        <TaglineEditor value={tagline} onSave={onTaglineSave} />
        <p className="tagline-hint">tap to edit</p>
      </div>

      {/* Member grid — filled members + one add button */}
      <div className="member-grid-wrap" onClick={e => e.stopPropagation()}>

        {/* Done button — only visible in edit mode */}
        {editMode && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6, padding: '0 2px' }}>
            <button
              onClick={() => setEditMode(false)}
              style={{
                background: '#1A531A', border: 'none', cursor: 'pointer',
                padding: '6px 18px', borderRadius: 20,
                fontSize: '0.82rem', fontWeight: 700,
                color: '#fff', fontFamily: 'inherit',
                boxShadow: '0 2px 8px rgba(26,83,26,0.25)',
              }}>
              Done
            </button>
          </div>
        )}

        <div className="member-grid">
          {members
            .map((member, i) => ({ member, slot: i }))
            .filter(({ member }) => member !== null)
            .map(({ member, slot }) => (
              <AvatarSlot
                key={slot}
                slot={slot}
                member={member}
                onFilled={s => onMemberSlotClick(s, true)}
                onEmpty={s  => onMemberSlotClick(s, false)}
                editMode={editMode}
                onRemove={(s, m) => requestRemove(s, m)}
                onLongPress={() => setEditMode(true)}
              />
            ))
          }
          {!editMode && members.findIndex(m => m === null) !== -1 && (
            <AvatarSlot
              key="add"
              slot={members.findIndex(m => m === null)}
              member={null}
              onFilled={s => onMemberSlotClick(s, true)}
              onEmpty={s  => onMemberSlotClick(s, false)}
            />
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="cta-area">
        <button className="cta-btn" onClick={() => setShowGateMsg(true)}>
          🏠&nbsp;&nbsp;Family Basecamp
        </button>
        <div className="dots">
          <span className="dot active"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>

      {/* Brand logo — subtle, non-distracting watermark */}
      <img src="logo.svg" alt="" aria-hidden="true" className="brand-logo" />

      {/* PIN confirmation before removing a member */}
      {pendingRemove && (
        <MemberPinModal
          member={pendingRemove.member}
          hasPin={true}
          onVerified={() => {
            onRemoveMember(pendingRemove.slot, pendingRemove.member.id);
            setPendingRemove(null);
            setEditMode(false);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}

      {/* Gate message popup */}
      {showGateMsg && (
        <div
          onClick={() => setShowGateMsg(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '32px',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#FDFBF7', borderRadius: 24,
              padding: '32px 24px 28px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              width: '100%',
            }}>
            <div style={{ fontSize: '2.8rem', marginBottom: 14 }}>🔒</div>
            <p style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: '#1A531A', lineHeight: 1.4 }}>
              Access granted only after<br />clicking your avatar.
            </p>
            <p style={{ margin: '0 0 24px', fontSize: '0.82rem', color: 'rgba(26,83,26,0.5)' }}>
              Tap your family member icon to get started.
            </p>
            <button
              onClick={() => setShowGateMsg(false)}
              style={{
                width: '100%', padding: '12px', borderRadius: 14, border: 'none',
                background: '#1A531A', color: '#fff',
                fontSize: '0.95rem', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
              Got it
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════
function App() {
  const [screen,            setScreen]            = useState('loading');
  const [members,           setMembers]           = useState(new Array(MAX_MEMBERS).fill(null));
  const [tagline,           setTagline]           = useState('Together we make\nunforgettable memories');
  const [currentMember,     setCurrentMember]     = useState(null);
  const [modalSlot,         setModalSlot]         = useState(null);
  const [planCtx,           setPlanCtx]           = useState(null);
  const [mapActivityType,   setMapActivityType]   = useState('vacation');
  const [customActivities,  setCustomActivities]  = useState([]);
  const [showCreateActivity,setShowCreateActivity]= useState(false);
  const [mapPins,           setMapPins]           = useState([]);
  const [toast,             setToast]             = useState({ msg: '', visible: false });
  const [authUser,          setAuthUser]          = useState(null);
  const [showAuthModal,     setShowAuthModal]     = useState(false);
  const [authMenuOpen,      setAuthMenuOpen]      = useState(false);
  const [otpTarget,         setOtpTarget]         = useState(null); // { member, hasPin } awaiting PIN entry
  const [commonDefaultTab,  setCommonDefaultTab]  = useState('plan');
  const toastTimer = useRef(null);

  // Merge built-in + custom activities into one lookup table
  const allActivitiesMeta = useMemo(() => {
    const merged = { ...ACTIVITY_META };
    customActivities.forEach(act => {
      merged[act.id] = {
        icon:     act.emoji,
        label:    act.name,
        subtitle: 'Custom memory activity',
        gradient: act.gradient,
        pinColor: act.pin_color || '#6366f1',
        pinShape: 'badge',
      };
    });
    return merged;
  }, [customActivities]);

  // Wire up the module-level toast setter so Supabase helpers can call it
  useEffect(() => {
    _showToast = (msg) => {
      setToast({ msg, visible: true });
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(
        () => setToast(t => ({ ...t, visible: false })),
        2400
      );
    };
  }, []);

  // ── Load app data (called after auth is confirmed) ─────────
  async function loadAppData(gotoMemories = false) {
    try {
      const [tl, mems, acts] = await Promise.all([
        sbLoadTagline(), sbLoadMembers(), sbLoadCustomActivities()
      ]);
      setTagline(tl);
      setMembers(mems);
      setCustomActivities(acts);
      setScreen(gotoMemories ? 'common' : 'welcome');  // gotoMemories passed from bootstrap
    } catch (err) {
      console.error('Init error:', err);
      _showToast('Connection error — check Supabase config');
      setScreen('welcome');
    }
  }

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setTimeout(() => setScreen('config-error'), 600);
      return;
    }

    // Check if wellness tracker sent us here to open memories
    const gotoMemories = sessionStorage.getItem('abc_goto') === 'memories';
    if (gotoMemories) {
      sessionStorage.removeItem('abc_goto');
      setCommonDefaultTab('memories');
    }

    // Always load app data — no auth required to view the home screen
    loadAppData(gotoMemories);

    // Restore any existing admin session silently
    window.sb.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setAuthUser(session.user);
    });

    const { data: { subscription: authSub } } = window.sb.auth.onAuthStateChange(
      (_event, session) => { setAuthUser(session?.user ?? null); }
    );

    return () => authSub?.unsubscribe();
  }, []);

  // ── Auth ───────────────────────────────────────────────────
  function handleAuthClick() {
    if (authUser) { setAuthMenuOpen(o => !o); }
    else { setShowAuthModal(true); }
  }
  async function handleSignOut() {
    await window.sb.auth.signOut();
    localStorage.removeItem(AUTH_EMAIL_KEY);
    setAuthUser(null);
    setAuthMenuOpen(false);
    _showToast('Signed out');
  }

  // ── Tagline ────────────────────────────────────────────────
  async function handleTaglineSave(val) {
    setTagline(val);
    try {
      await sbSaveTagline(val);
      _showToast('Tagline saved ✓');
    } catch {
      _showToast('Could not save tagline');
    }
  }

  // ── Navigate to member's wellness tracker ──────────────────
  function navigateToMember(m) {
    sessionStorage.setItem('wt_member_id', m.id         || '');
    sessionStorage.setItem('wt_name',      m.name       || '');
    sessionStorage.setItem('wt_avatar',    m.avatar_url || '');
    window.location.href = 'wellness-tracker.html';
  }

  // ── Check if member has a PIN then show PIN modal ──────────
  async function openPinModal(m) {
    const { data } = await window.sb
      .from('allusbasecamp_settings')
      .select('value')
      .eq('key', `member_pin_${m.id}`)
      .maybeSingle();
    setOtpTarget({ member: m, hasPin: !!data?.value });
  }

  // ── Member slot click ──────────────────────────────────────
  function handleMemberSlotClick(slot, isFilled) {
    if (isFilled) {
      const m = members[slot];
      if (!m) return;
      openPinModal(m);  // PIN is always required; email is optional
    } else {
      setModalSlot(slot);
    }
  }

  // ── Save / delete member ───────────────────────────────────
  async function handleSaveMember(slot, name, file, existingAvatarUrl, email) {
    const saved = await sbSaveMember(slot, name, file, existingAvatarUrl, email);
    setMembers(prev => {
      const next = [...prev];
      next[slot] = saved;
      return next;
    });
    setModalSlot(null);
    _showToast(existingAvatarUrl ? 'Member updated ✓' : 'Member added ✓');
  }

  async function handleDeleteMember(slot, memberId) {
    await sbDeleteMember(slot, memberId);
    setMembers(prev => {
      const next = [...prev];
      next[slot] = null;
      return next;
    });
    setModalSlot(null);
    _showToast('Member removed');
  }

  // ── Common tile tap → activity map screen ─────────────────
  function handleCommonTileClick(type) {
    setMapActivityType(type);
    setScreen('activitymap');
  }

  // ── Refresh map pins whenever user enters Family Basecamp ──
  useEffect(() => {
    if (screen === 'common') {
      sbLoadMapPins().then(setMapPins).catch(console.error);
    }
  }, [screen]);

  // ── Delete a map pin (from Memories list/map in CommonArea) ─
  async function handleDeletePin(id) {
    setMapPins(prev => prev.filter(p => String(p.id) !== String(id)));
    try { await sbDeleteMapPin(id); } catch (e) { console.error(e); }
  }

  // ── Create custom activity ─────────────────────────────────
  async function handleCreateActivity({ name, emoji, gradient, pinColor }) {
    try {
      const saved = await sbSaveCustomActivity(name, emoji, gradient, pinColor);
      setCustomActivities(prev => [...prev, saved]);
      setShowCreateActivity(false);
      _showToast(`"${name}" activity created ✓`);
    } catch (err) {
      console.error(err);
      _showToast('Could not save activity — check connection');
    }
  }

  function handleMemberContinue(type, memberId) {
    setPlanCtx({ type, memberId, backScreen: 'member' });
    setScreen('plan');
  }

  function handlePlanBack() {
    setScreen(planCtx?.backScreen || 'welcome');
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      {screen === 'loading' && <LoadingScreen />}

      {screen === 'config-error' && (
        <div className="screen screen-flex-center">
          <div style={{ textAlign: 'center', padding: '0 32px' }}>
            <p style={{ fontSize: '2.8rem', marginBottom: 16 }}>⚙️</p>
            <p className="loading-title">Setup Required</p>
            <p className="loading-sub" style={{ marginTop: 10, lineHeight: 1.7 }}>
              Edit <strong>supabase-config.js</strong> with your<br />
              Supabase project URL and anon key,<br />
              then run <strong>setup.sql</strong> in the SQL editor.
            </p>
          </div>
        </div>
      )}

      {screen === 'welcome' && (
        <WelcomeScreen
          members={members}
          tagline={tagline}
          onTaglineSave={handleTaglineSave}
          onMemberSlotClick={handleMemberSlotClick}
          authUser={authUser}
          onAuthClick={handleAuthClick}
          onRemoveMember={handleDeleteMember}
        />
      )}

      {screen === 'common' && (
        <CommonAreaScreen
          onBack={() => setScreen('welcome')}
          onSelectTile={handleCommonTileClick}
          customActivities={customActivities}
          onCreateActivity={() => setShowCreateActivity(true)}
          mapPins={mapPins}
          allActivitiesMeta={allActivitiesMeta}
          onDeletePin={handleDeletePin}
          defaultTab={commonDefaultTab}
        />
      )}

      {screen === 'activitymap' && (
        <ActivityMapScreen
          activityType={mapActivityType}
          onBack={() => setScreen('common')}
          allActivitiesMeta={allActivitiesMeta}
        />
      )}

      {screen === 'member' && currentMember && (
        <MemberAreaScreen
          member={currentMember}
          onBack={() => setScreen('welcome')}
          onContinue={handleMemberContinue}
        />
      )}

      {screen === 'plan' && planCtx && (
        <PlanScreen
          planCtx={planCtx}
          onBack={handlePlanBack}
        />
      )}

      {/* Modal — rendered on top of current screen */}
      {modalSlot !== null && (
        <MemberModal
          slot={modalSlot}
          member={members[modalSlot]}
          onSave={handleSaveMember}
          onDelete={handleDeleteMember}
          onClose={() => setModalSlot(null)}
        />
      )}

      {showCreateActivity && (
        <CreateActivityModal
          onClose={() => setShowCreateActivity(false)}
          onSave={handleCreateActivity}
        />
      )}

      {/* Account button — fixed top-right, only on welcome (user is always authed here) */}
      {screen === 'welcome' && authUser && (
        <button
          onClick={handleAuthClick}
          aria-label="Account"
          style={{
            position: 'fixed',
            top: 'max(14px, calc(env(safe-area-inset-top, 0px) + 8px))',
            right: 16,
            background: '#1A531A',
            border: '2px solid #2D7A2D',
            borderRadius: 12, width: 38, height: 38,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', zIndex: 200,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            fontSize: '0.82rem', fontWeight: 800,
            color: '#fff', fontFamily: 'inherit',
          }}>
          {authUser.email ? authUser.email[0].toUpperCase() : '✓'}
        </button>
      )}

      {/* Auth modal — triggered by user icon */}
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuth={user => { setAuthUser(user); setShowAuthModal(false); _showToast('Signed in ✓'); }}
        />
      )}

      {/* PIN gate — blocks entry until member enters/sets their PIN */}
      {otpTarget && (
        <MemberPinModal
          member={otpTarget.member}
          hasPin={otpTarget.hasPin}
          onVerified={() => { const m = otpTarget.member; setOtpTarget(null); navigateToMember(m); }}
          onCancel={() => setOtpTarget(null)}
        />
      )}

      {/* Signed-in account menu (tap avatar when logged in) */}
      {authMenuOpen && authUser && (
        <div
          onClick={() => setAuthMenuOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 899,
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
          }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              marginTop: 'calc(env(safe-area-inset-top, 0px) + 58px)',
              marginRight: 12,
              background: '#FDFBF7', borderRadius: 16,
              boxShadow: '0 4px 24px rgba(0,0,0,0.14)',
              border: '1px solid #E4D9C8',
              minWidth: 210, padding: '12px 0', zIndex: 900,
            }}>
            <p style={{
              fontSize: '0.75rem', color: '#6b7280', padding: '4px 16px 10px',
              borderBottom: '1px solid #E4D9C8', margin: 0, wordBreak: 'break-all',
            }}>
              Signed in as<br />
              <strong style={{ color: '#1A531A' }}>{authUser.email}</strong>
            </p>
            <button
              onClick={handleSignOut}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '11px 16px', background: 'none', border: 'none',
                fontSize: '0.88rem', color: '#dc2626', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      <Toast msg={toast.msg} visible={toast.visible} />
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// MOUNT
// ════════════════════════════════════════════════════════════════
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
