'use strict';

// ════════════════════════════════════════════════════════════════
// AllUsBasecamp — App Logic
// Supabase tables: allusbasecamp_settings | allusbasecamp_members
//                  allusbasecamp_common_plans | allusbasecamp_personal_plans
// Storage bucket:  member-avatars
// ════════════════════════════════════════════════════════════════

const MAX_MEMBERS = 7;

// ── Module state ─────────────────────────────────────────────────
let members        = new Array(MAX_MEMBERS).fill(null); // index = position slot
let currentMember  = null;   // member row currently on screen-member
let activeSlot     = null;   // slot open in the modal
let activePlanCtx  = null;   // { type, memberId|null, backScreen }
let pendingFile    = null;   // file chosen in the modal, not yet uploaded

// ── DOM shortcuts ────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const qA = sel => document.querySelectorAll(sel);

// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    if (s.id === id) {
      s.classList.remove('hidden');
      // Defer so the browser paints the element before adding active
      requestAnimationFrame(() => s.classList.add('active'));
    } else {
      s.classList.remove('active');
      s.classList.add('hidden');
    }
  });
}

// ════════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ════════════════════════════════════════════════════════════════
// SUPABASE — SETTINGS (tagline)
// ════════════════════════════════════════════════════════════════
async function loadTagline() {
  const { data } = await sb
    .from('allusbasecamp_settings')
    .select('value')
    .eq('key', 'tagline')
    .maybeSingle();
  return data?.value || 'Together we make\nunforgettable memories';
}

async function saveTagline(value) {
  const { error } = await sb
    .from('allusbasecamp_settings')
    .upsert({ key: 'tagline', value, updated_at: new Date().toISOString() },
            { onConflict: 'key' });
  if (error) { showToast('Could not save tagline'); return; }
  showToast('Tagline saved ✓');
}

// ── Tagline UI ───────────────────────────────────────────────────
let currentTagline = '';

function renderTagline(text) {
  currentTagline = text;
  const lines = text.split('\n').filter(Boolean);
  // First line plain, remaining lines bold italic
  const html = lines.map((line, i) =>
    i === 0
      ? line
      : `<em class="font-bold italic">${line}</em>`
  ).join('<br>');
  $('tagline-display').innerHTML = html;
}

function initTaglineEdit() {
  const display = $('tagline-display');
  const input   = $('tagline-input');

  display.addEventListener('click', () => {
    input.value = currentTagline;
    display.classList.add('hidden');
    input.classList.remove('hidden');
    input.focus();
    input.select();
  });

  let saveDebounce = null;

  async function commitTagline() {
    const val = input.value.trim() || currentTagline;
    input.classList.add('hidden');
    display.classList.remove('hidden');
    renderTagline(val);
    if (val !== currentTagline) {
      clearTimeout(saveDebounce);
      saveDebounce = setTimeout(() => saveTagline(val), 400);
    }
  }

  input.addEventListener('blur', commitTagline);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTagline(); }
    if (e.key === 'Escape') { input.value = currentTagline; commitTagline(); }
  });
}

// ════════════════════════════════════════════════════════════════
// SUPABASE — MEMBERS
// ════════════════════════════════════════════════════════════════
async function loadMembers() {
  const { data, error } = await sb
    .from('allusbasecamp_members')
    .select('*')
    .order('position');
  if (error) { console.error('loadMembers:', error); return; }
  members = new Array(MAX_MEMBERS).fill(null);
  (data || []).forEach(m => {
    if (m.position >= 0 && m.position < MAX_MEMBERS) {
      members[m.position] = m;
    }
  });
}

async function saveMember(slot, name, file) {
  const btn = $('modal-save-btn');
  btn.textContent = 'Saving…';
  btn.classList.add('loading');

  try {
    let avatar_url = members[slot]?.avatar_url ?? null;

    // ── Upload photo to Supabase Storage ──
    if (file) {
      const ext  = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `slot-${slot}/avatar.${ext}`;

      // Remove any previous avatar files for this slot
      const oldPaths = ['jpg','jpeg','png','webp','gif','heic'].map(e => `slot-${slot}/avatar.${e}`);
      await sb.storage.from('member-avatars').remove(oldPaths);

      const { error: uploadErr } = await sb.storage
        .from('member-avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadErr) {
        console.error('Upload error:', uploadErr);
        showToast('Photo upload failed');
      } else {
        const { data: urlData } = sb.storage
          .from('member-avatars')
          .getPublicUrl(path);
        // Append cache-buster so the browser re-fetches the new image
        avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;
      }
    }

    // ── Upsert member row ──
    const { data, error } = await sb
      .from('allusbasecamp_members')
      .upsert({ name, avatar_url, position: slot },
              { onConflict: 'position' })
      .select()
      .single();

    if (error) throw error;

    members[slot] = data;
    renderMemberGrid();
    closeModal();
    showToast(members[slot] ? 'Member updated ✓' : 'Member added ✓');

  } catch (err) {
    console.error('saveMember:', err);
    showToast('Could not save member');
  } finally {
    btn.textContent = 'Save Member';
    btn.classList.remove('loading');
  }
}

async function deleteMember(slot) {
  const member = members[slot];
  if (!member?.id) return;

  // Remove all possible avatar files
  const paths = ['jpg','jpeg','png','webp','gif','heic']
    .map(e => `slot-${slot}/avatar.${e}`);
  await sb.storage.from('member-avatars').remove(paths);

  const { error } = await sb
    .from('allusbasecamp_members')
    .delete()
    .eq('id', member.id);

  if (error) { showToast('Could not remove member'); return; }

  members[slot] = null;
  renderMemberGrid();
  closeModal();
  showToast('Member removed');
}

// ── Render member grid ───────────────────────────────────────────
function defaultAvatar(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  const bg = ['#D6EAD6','#FFF3CC','#D1ECF1','#FFE8D6','#E8D6F0','#D6E4F0','#F0EAD6'];
  ctx.fillStyle = bg[name.charCodeAt(0) % bg.length];
  ctx.fillRect(0, 0, 200, 200);
  ctx.fillStyle = '#1A531A';
  ctx.font = 'bold 80px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name.charAt(0).toUpperCase(), 100, 108);
  return canvas.toDataURL();
}

function renderMemberGrid() {
  const grid = $('member-grid');
  grid.innerHTML = '';

  for (let i = 0; i < MAX_MEMBERS; i++) {
    const member = members[i];
    const slot   = document.createElement('div');
    slot.className = 'member-slot';

    if (member) {
      const src = member.avatar_url || defaultAvatar(member.name);
      slot.innerHTML = `
        <div class="avatar-circle filled">
          <img src="${escHtml(src)}" alt="${escHtml(member.name)}" loading="lazy">
        </div>
        <span class="avatar-name">${escHtml(member.name)}</span>
      `;
      slot.addEventListener('click', () => openMemberScreen(i));
    } else {
      slot.innerHTML = `
        <div class="avatar-circle empty">
          <span style="font-size:1.5rem;color:rgba(26,83,26,0.28);line-height:1">＋</span>
        </div>
        <span class="avatar-name" style="color:rgba(26,83,26,0.3)">Add</span>
      `;
      slot.addEventListener('click', () => openMemberModal(i));
    }

    grid.appendChild(slot);
  }
}

// ════════════════════════════════════════════════════════════════
// MEMBER MODAL (add / edit)
// ════════════════════════════════════════════════════════════════
function openMemberModal(slot) {
  activeSlot   = slot;
  pendingFile  = null;
  const member = members[slot];

  $('modal-title').textContent = member ? 'Edit Member' : 'Add Member';
  $('modal-name').value        = member?.name || '';
  $('modal-delete-btn').classList.toggle('hidden', !member);
  $('modal-file-input').value  = '';

  // Reset avatar preview
  const av = $('modal-avatar');
  av.innerHTML = '';
  if (member?.avatar_url) {
    const img = document.createElement('img');
    img.src = member.avatar_url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    av.appendChild(img);
  } else {
    av.innerHTML = '<span id="modal-avatar-ph" style="font-size:3rem">👤</span>';
  }

  $('modal-member').classList.remove('hidden');
  setTimeout(() => $('modal-name').focus(), 280);
}

function closeModal() {
  $('modal-member').classList.add('hidden');
  activeSlot  = null;
  pendingFile = null;
}

// ════════════════════════════════════════════════════════════════
// MEMBER SCREEN
// ════════════════════════════════════════════════════════════════
function openMemberScreen(slot) {
  const member = members[slot];
  if (!member) return;
  currentMember = member;

  // Avatar
  const heroAv = $('member-hero-avatar');
  heroAv.innerHTML = '';
  if (member.avatar_url) {
    const img = document.createElement('img');
    img.src = member.avatar_url;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    heroAv.appendChild(img);
  } else {
    heroAv.textContent = member.name.charAt(0).toUpperCase();
  }

  $('member-hero-name').textContent = member.name;
  showScreen('screen-member');
}

// ════════════════════════════════════════════════════════════════
// SUPABASE — PLANS
// ════════════════════════════════════════════════════════════════
async function loadPlans(type, memberId) {
  if (!memberId) {
    const { data } = await sb
      .from('allusbasecamp_common_plans')
      .select('*')
      .eq('type', type)
      .order('created_at');
    return data || [];
  } else {
    const { data } = await sb
      .from('allusbasecamp_personal_plans')
      .select('*')
      .eq('type', type)
      .eq('member_id', memberId)
      .order('created_at');
    return data || [];
  }
}

async function insertPlan(type, memberId, content) {
  if (!memberId) {
    const { data, error } = await sb
      .from('allusbasecamp_common_plans')
      .insert({ type, content })
      .select()
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await sb
      .from('allusbasecamp_personal_plans')
      .insert({ type, content, member_id: memberId })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

async function removePlan(id, memberId) {
  const table = memberId
    ? 'allusbasecamp_personal_plans'
    : 'allusbasecamp_common_plans';
  await sb.from(table).delete().eq('id', id);
}

// ── Render plan list ─────────────────────────────────────────────
function renderPlanList(plans) {
  const list = $('plan-list');
  list.innerHTML = '';

  if (!plans.length) {
    list.innerHTML = '<li class="plan-empty-msg">Nothing here yet — add your first entry below!</li>';
    return;
  }

  plans.forEach(plan => {
    const li = document.createElement('li');
    li.className = 'plan-item';
    const date = new Date(plan.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric'
    });
    li.dataset.id = plan.id;
    li.innerHTML = `
      <span class="plan-item-text">${escHtml(plan.content)}</span>
      <span class="plan-item-date">${date}</span>
      <button class="plan-delete-btn" aria-label="Delete" data-id="${plan.id}">✕</button>
    `;
    list.appendChild(li);
  });
}

// ── Plan screen entry point ──────────────────────────────────────
const PLAN_META = {
  vacation: { icon: '✈️', title: 'Plan Vacation' },
  event:    { icon: '🎉', title: 'Go to an Event' },
  dine:     { icon: '🍽️', title: 'Dine Out' },
  meals:    { icon: '🥗', title: 'Plan Meals' },
  exercise: { icon: '🏃', title: 'Exercise' },
  book:     { icon: '📖', title: 'Read Book' },
};

async function openPlanScreen(type, memberId, backScreen) {
  activePlanCtx = { type, memberId, backScreen };
  const meta = PLAN_META[type] || { icon: '📝', title: type };

  $('plan-icon').textContent  = meta.icon;
  $('plan-title').textContent = meta.title;
  $('plan-back-btn').dataset.target = backScreen;
  $('plan-input').value = '';
  $('plan-list').innerHTML =
    '<li class="plan-empty-msg" style="opacity:0.5">Loading…</li>';

  showScreen('screen-plan');

  const plans = await loadPlans(type, memberId);
  renderPlanList(plans);
}

// ── Add plan ─────────────────────────────────────────────────────
async function addPlan() {
  const input   = $('plan-input');
  const content = input.value.trim();
  if (!content || !activePlanCtx) return;

  input.value = '';
  const { type, memberId } = activePlanCtx;

  // Optimistic DOM insert
  const list  = $('plan-list');
  const empty = list.querySelector('.plan-empty-msg');
  if (empty) empty.remove();

  const li = document.createElement('li');
  li.className = 'plan-item';
  li.innerHTML = `
    <span class="plan-item-text">${escHtml(content)}</span>
    <span class="plan-item-date">Just now</span>
    <button class="plan-delete-btn" aria-label="Delete">✕</button>
  `;
  list.appendChild(li);
  list.scrollTop = list.scrollHeight;

  try {
    const saved = await insertPlan(type, memberId, content);
    // Back-fill the real ID on the button so delete works
    li.querySelector('.plan-delete-btn').dataset.id = saved.id;
    li.dataset.id = saved.id;
  } catch (err) {
    console.error('insertPlan:', err);
    li.remove();
    if (!list.children.length) {
      list.innerHTML = '<li class="plan-empty-msg">Nothing here yet — add your first entry below!</li>';
    }
    showToast('Could not save — check connection');
  }
}

// ════════════════════════════════════════════════════════════════
// EVENT BINDING
// ════════════════════════════════════════════════════════════════
function bindEvents() {
  // ── Back buttons (delegated) ──
  document.addEventListener('click', e => {
    const btn = e.target.closest('.back-btn');
    if (btn) {
      const target = btn.dataset.target || 'screen-welcome';
      showScreen(target);
    }
  });

  // ── Common area ──
  $('btn-common-area').addEventListener('click', () => showScreen('screen-common'));

  // ── Tiles (both screens, delegated) ──
  document.addEventListener('click', e => {
    const tile = e.target.closest('.tile');
    if (!tile) return;
    const type    = tile.dataset.type;
    const context = tile.dataset.context;
    if (context === 'common') {
      openPlanScreen(type, null, 'screen-common');
    } else {
      openPlanScreen(type, currentMember?.id || null, 'screen-member');
    }
  });

  // ── Plan add ──
  $('btn-add-plan').addEventListener('click', addPlan);
  $('plan-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlan();
  });

  // ── Plan delete (delegated) ──
  $('plan-list').addEventListener('click', async e => {
    const btn = e.target.closest('.plan-delete-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    const li = btn.closest('li');
    if (li) li.remove();
    if (!$('plan-list').children.length) {
      $('plan-list').innerHTML =
        '<li class="plan-empty-msg">Nothing here yet — add your first entry below!</li>';
    }
    if (id) await removePlan(id, activePlanCtx?.memberId || null);
  });

  // ── Modal: file picker preview ──
  $('modal-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    pendingFile = file;
    const reader = new FileReader();
    reader.onload = ev => {
      const av = $('modal-avatar');
      av.innerHTML = '';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      av.appendChild(img);
    };
    reader.readAsDataURL(file);
  });

  // ── Modal: save ──
  $('modal-save-btn').addEventListener('click', () => {
    const name = $('modal-name').value.trim();
    if (!name) { $('modal-name').focus(); return; }
    saveMember(activeSlot, name, pendingFile);
  });

  // ── Modal: delete member ──
  $('modal-delete-btn').addEventListener('click', () => {
    if (!members[activeSlot]) return;
    deleteMember(activeSlot);
  });

  // ── Modal: close ──
  $('modal-close-btn').addEventListener('click', closeModal);
  $('modal-member').addEventListener('click', e => {
    if (e.target.id === 'modal-member') closeModal();
  });
}

// ════════════════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════════════════
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
async function init() {
  // Show loading screen immediately
  showScreen('screen-loading');

  // Validate Supabase config before making any calls
  if (
    typeof SUPABASE_URL === 'undefined' ||
    SUPABASE_URL.includes('YOUR_PROJECT_ID') ||
    SUPABASE_ANON_KEY.includes('YOUR_ANON') ||
    !SUPABASE_ANON_KEY.startsWith('eyJ')
  ) {
    document.querySelector('#screen-loading p.font-serif').textContent =
      'Configure Supabase';
    document.querySelector('#screen-loading p.text-xs').textContent =
      'Edit supabase-config.js with your project URL and anon key';
    return;
  }

  try {
    // Parallel fetch: tagline + members
    const [taglineText] = await Promise.all([
      loadTagline(),
      loadMembers(),
    ]);

    // Render welcome screen content
    renderTagline(taglineText);
    renderMemberGrid();
    initTaglineEdit();
    bindEvents();

    showScreen('screen-welcome');

  } catch (err) {
    console.error('Init failed:', err);
    showToast('Connection error — check Supabase config');
    // Still show the welcome screen with defaults so the UI isn't stuck
    renderTagline('Together we make\nunforgettable memories');
    renderMemberGrid();
    initTaglineEdit();
    bindEvents();
    showScreen('screen-welcome');
  }
}

document.addEventListener('DOMContentLoaded', init);
