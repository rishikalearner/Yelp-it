// ─── SUPABASE CONFIG ───────────────────────────────────────────────
// Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://ulvaqnwlvrwllpnmovcr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsdmFxbndsdnJ3bGxwbm1vdmNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyODAzNjUsImV4cCI6MjA5Mjg1NjM2NX0.UA1qH9HEVP51mfdCgRc6zbfpGOEHG8KGX9MrjOa6zAk';

const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── STATE ─────────────────────────────────────────────────────────
let currentUser = null;

// ─── INIT ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) setUser(session.user);

  sb.auth.onAuthStateChange((_event, session) => {
    setUser(session?.user || null);
  });

  loadThoughts();
  subscribeToThoughts();
});

// ─── AUTH STATE ────────────────────────────────────────────────────
function setUser(user) {
  currentUser = user;
  if (user) {
    document.getElementById('navRight').classList.add('hidden');
    document.getElementById('navUser').classList.remove('hidden');
    document.getElementById('navEmail').textContent = user.email;
    document.getElementById('postSection').classList.remove('hidden');
  } else {
    document.getElementById('navRight').classList.remove('hidden');
    document.getElementById('navUser').classList.add('hidden');
    document.getElementById('postSection').classList.add('hidden');
  }
  // Re-render thoughts so delete buttons appear/disappear
  loadThoughts();
}

// ─── AUTH ──────────────────────────────────────────────────────────
async function signup() {
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const errEl = document.getElementById('signupError');

  if (!email || !password) return showError(errEl, 'Please fill in all fields.');
  if (password.length < 6) return showError(errEl, 'Password must be at least 6 characters.');

  const { error } = await sb.auth.signUp({ email, password });
  if (error) return showError(errEl, error.message);

  hideModal('signupModal');
  showToast('Account created! Check your email to confirm.');
}

async function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  if (!email || !password) return showError(errEl, 'Please fill in all fields.');

  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return showError(errEl, error.message);

  hideModal('loginModal');
  showToast('Welcome back!');
}

async function logout() {
  await sb.auth.signOut();
  showToast('Logged out.');
}

function confirmDeleteAccount() {
  document.getElementById('deleteError').classList.add('hidden');
  showModal('deleteModal');
}

async function deleteAccount() {
  const errEl = document.getElementById('deleteError');

  // Delete user's thoughts first
  if (currentUser) {
    await sb.from('thoughts').delete().eq('user_id', currentUser.id);
  }

  // Call the delete-account edge function or use admin API via RPC
  const { error } = await sb.rpc('delete_user');
  if (error) return showError(errEl, 'Could not delete account: ' + error.message);

  await sb.auth.signOut();
  hideModal('deleteModal');
  showToast('Account deleted. Goodbye!');
}

// ─── THOUGHTS ──────────────────────────────────────────────────────
async function loadThoughts() {
  const list = document.getElementById('thoughtsList');
  list.innerHTML = '<div class="loading">Loading thoughts...</div>';

  const { data, error } = await sb
    .from('thoughts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<div class="loading">Could not load thoughts. Check your Supabase config.</div>';
    return;
  }

  renderThoughts(data);
}

function renderThoughts(thoughts) {
  const list = document.getElementById('thoughtsList');
  const countEl = document.getElementById('thoughtCount');

  countEl.textContent = thoughts.length + (thoughts.length === 1 ? ' thought' : ' thoughts');

  if (!thoughts.length) {
    list.innerHTML = `
      <div class="empty-state">
        <p>No thoughts yet.</p>
        <small>Be the first to say something.</small>
      </div>`;
    return;
  }

  list.innerHTML = thoughts.map(t => thoughtCard(t)).join('');
}

function thoughtCard(t) {
  const author = t.pen_name ? t.pen_name : 'Anonymous';
  const time = timeAgo(t.created_at);
  const isOwner = currentUser && currentUser.id === t.user_id;
  const deleteBtn = isOwner
    ? `<button class="delete-thought" onclick="deleteThought('${t.id}')">delete</button>`
    : '';

  return `
    <div class="thought-card" id="thought-${t.id}">
      <p class="thought-body">${escapeHtml(t.content)}</p>
      <div class="thought-meta">
        <span class="thought-author">— ${escapeHtml(author)}</span>
        <span class="thought-time">${time}</span>
        ${deleteBtn}
      </div>
    </div>`;
}

async function postThought() {
  const content = document.getElementById('thoughtInput').value.trim();
  const penName = document.getElementById('penName').value.trim();
  const errEl = document.getElementById('postError');

  if (!content) return showError(errEl, 'Write something first!');
  if (!currentUser) return showError(errEl, 'You must be logged in to post.');

  const { error } = await sb.from('thoughts').insert({
    content,
    pen_name: penName || null,
    user_id: currentUser.id,
  });

  if (error) return showError(errEl, error.message);

  document.getElementById('thoughtInput').value = '';
  document.getElementById('penName').value = '';
  errEl.classList.add('hidden');
  showToast('Thought posted!');
}

async function deleteThought(id) {
  const { error } = await sb.from('thoughts').delete().eq('id', id);
  if (!error) {
    const el = document.getElementById('thought-' + id);
    if (el) el.remove();
    showToast('Thought deleted.');
    // Update count
    const count = document.querySelectorAll('.thought-card').length;
    document.getElementById('thoughtCount').textContent = count + (count === 1 ? ' thought' : ' thoughts');
    if (count === 0) {
      document.getElementById('thoughtsList').innerHTML = `
        <div class="empty-state">
          <p>No thoughts yet.</p>
          <small>Be the first to say something.</small>
        </div>`;
    }
  }
}

// Realtime subscription — new thoughts appear instantly
function subscribeToThoughts() {
  sb.channel('thoughts-channel')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thoughts' }, payload => {
      const list = document.getElementById('thoughtsList');
      // Remove empty state if present
      const empty = list.querySelector('.empty-state');
      if (empty) empty.remove();
      // Prepend new card
      list.insertAdjacentHTML('afterbegin', thoughtCard(payload.new));
      // Update count
      const count = document.querySelectorAll('.thought-card').length;
      document.getElementById('thoughtCount').textContent = count + (count === 1 ? ' thought' : ' thoughts');
    })
    .subscribe();
}

// ─── MODAL HELPERS ─────────────────────────────────────────────────
function showModal(id) {
  document.getElementById(id).classList.remove('hidden');
}
function hideModal(id) {
  document.getElementById(id).classList.add('hidden');
}
function switchModal(from, to) {
  hideModal(from);
  showModal(to);
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

// ─── TOAST ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

// ─── UTILS ─────────────────────────────────────────────────────────
function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}
