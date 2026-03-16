// AllUsBasecamp — React App
// Requires: window.sb (Supabase client from supabase-config.js)
//           React 18 + ReactDOM 18 + Babel standalone (loaded in index.html)
'use strict';

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════
const MAX_MEMBERS = 7;

const COMMON_TILES = [
  { type: 'vacation', icon: '✈️', label: 'Plan Vacation',  color: 'tile-green'  },
  { type: 'event',    icon: '🎉', label: 'Go to an Event', color: 'tile-yellow' },
  { type: 'dine',     icon: '🍽️', label: 'Dine Out',        color: 'tile-blue'   },
];

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

async function sbSaveMember(slot, name, file, existingAvatarUrl) {
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

  const { data, error } = await window.sb
    .from('allusbasecamp_members')
    .upsert({ name, avatar_url, position: slot }, { onConflict: 'position' })
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
function AvatarSlot({ member, slot, onFilled, onEmpty }) {
  const fallback = useMemo(
    () => member ? defaultAvatar(member.name) : null,
    [member?.name]
  );

  function handleClick() {
    member ? onFilled(slot) : onEmpty(slot);
  }

  return (
    <div className="member-slot" onClick={handleClick}>
      <div className={`avatar-circle${member ? ' filled' : ' empty'}`}>
        {member
          ? <img src={member.avatar_url || fallback} alt={member.name} loading="lazy" />
          : <span style={{ fontSize: '1.4rem', color: 'rgba(26,83,26,0.28)' }}>＋</span>
        }
      </div>
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
      await onSave(slot, name.trim(), pendingFile, member?.avatar_url);
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
            {previewUrl
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
// COMMON AREA SCREEN
// ════════════════════════════════════════════════════════════════
function CommonAreaScreen({ onBack, onContinue }) {
  const [selectedTile, setSelectedTile] = useState(null);

  function handleSelect(type) {
    setSelectedTile(prev => prev === type ? null : type);
  }

  return (
    <div className="screen">
      <div className="inner-screen">

        <div className="inner-header">
          <button className="back-btn" onClick={onBack}>← Back</button>
          <div className="inner-title-row">
            <span style={{ fontSize: '2.2rem', lineHeight: 1 }}>🏠</span>
            <h1 className="inner-title">Family Basecamp</h1>
          </div>
        </div>

        <div className="tile-grid">
          {COMMON_TILES.map(t => (
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
          onClick={() => selectedTile && onContinue(selectedTile)}
        />

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
              {member.avatar_url
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
// WELCOME SCREEN
// ════════════════════════════════════════════════════════════════
function WelcomeScreen({ members, tagline, onTaglineSave, onMemberSlotClick, onCommonArea }) {
  return (
    <div className="screen">

      {/* Tagline */}
      <div className="tagline-area">
        <TaglineEditor value={tagline} onSave={onTaglineSave} />
        <p className="tagline-hint">tap to edit</p>
      </div>

      {/* Member grid — filled members + one add button */}
      <div className="member-grid-wrap">
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
              />
            ))
          }
          {members.findIndex(m => m === null) !== -1 && (
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
        <button className="cta-btn" onClick={onCommonArea}>
          🏠&nbsp;&nbsp;Family Basecamp
        </button>
        <div className="dots">
          <span className="dot active"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>
      </div>

    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// ROOT APP
// ════════════════════════════════════════════════════════════════
function App() {
  const [screen,        setScreen]        = useState('loading');
  const [members,       setMembers]       = useState(new Array(MAX_MEMBERS).fill(null));
  const [tagline,       setTagline]       = useState('Together we make\nunforgettable memories');
  const [currentMember, setCurrentMember] = useState(null);
  const [modalSlot,     setModalSlot]     = useState(null);  // null = closed
  const [planCtx,       setPlanCtx]       = useState(null);
  const [toast,         setToast]         = useState({ msg: '', visible: false });
  const toastTimer = useRef(null);

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

  // ── Bootstrap ──────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setTimeout(() => setScreen('config-error'), 600);
      return;
    }
    Promise.all([sbLoadTagline(), sbLoadMembers()])
      .then(([tl, mems]) => {
        setTagline(tl);
        setMembers(mems);
        setScreen('welcome');
      })
      .catch(err => {
        console.error('Init error:', err);
        _showToast('Connection error — check Supabase config');
        setScreen('welcome');
      });
  }, []);

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

  // ── Member slot click ──────────────────────────────────────
  function handleMemberSlotClick(slot, isFilled) {
    if (isFilled) {
      const m = members[slot];
      if (!m) return;
      sessionStorage.setItem('wt_member_id', m.id          || '');
      sessionStorage.setItem('wt_name',      m.name        || '');
      sessionStorage.setItem('wt_avatar',    m.avatar_url  || '');
      window.location.href = 'wellness-tracker.html';
    } else {
      setModalSlot(slot);
    }
  }

  // ── Save / delete member ───────────────────────────────────
  async function handleSaveMember(slot, name, file, existingAvatarUrl) {
    const saved = await sbSaveMember(slot, name, file, existingAvatarUrl);
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

  // ── Continue (tile selection → plan screen) ────────────────
  function handleCommonContinue(type) {
    setPlanCtx({ type, memberId: null, backScreen: 'common' });
    setScreen('plan');
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
          onCommonArea={() => setScreen('common')}
        />
      )}

      {screen === 'common' && (
        <CommonAreaScreen
          onBack={() => setScreen('welcome')}
          onContinue={handleCommonContinue}
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

      <Toast msg={toast.msg} visible={toast.visible} />
    </>
  );
}

// ════════════════════════════════════════════════════════════════
// MOUNT
// ════════════════════════════════════════════════════════════════
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
