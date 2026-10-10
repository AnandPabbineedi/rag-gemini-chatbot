const API_BASE_URL = 'https://rag-backend-cgik.onrender.com/api';
const MAX_SIZE = 5 * 1024 * 1024;

// A per-browser session id keeps each visitor's documents separate
const SESSION_KEY = 'rag-session-id';
const DOCS_KEY = 'rag-docs';
let sessionId = localStorage.getItem(SESSION_KEY);
if (!sessionId) {
  sessionId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  localStorage.setItem(SESSION_KEY, sessionId);
}

const $ = (id) => document.getElementById(id);
const drop = $('drop'), fileInput = $('fileInput'), docList = $('docList'), docsHead = $('docsHead');
const thread = $('thread'), empty = $('empty'), composer = $('composer'), question = $('question'), sendBtn = $('sendBtn');

let docs = [];
try { docs = JSON.parse(localStorage.getItem(DOCS_KEY)) || []; } catch { docs = []; }
const saveDocs = () => localStorage.setItem(DOCS_KEY, JSON.stringify(docs.filter(d => d.status === 'ready')));

const headers = (extra = {}) => ({ 'x-session-id': sessionId, ...extra });
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtSize = (b) => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;

function renderDocs() {
  docsHead.hidden = docs.length === 0;
  docList.innerHTML = docs.map((d, i) => {
    const meta = d.status === 'uploading' ? (d.slowNote ? 'Reading… the server may be waking up' : 'Reading…')
      : d.status === 'error' ? escapeHtml(d.error)
      : `${d.chunks} ${d.chunks === 1 ? 'passage' : 'passages'} indexed`;
    return `<li class="doc is-${d.status}">
      <span class="doc-icon" aria-hidden="true">${d.name.toLowerCase().endsWith('.pdf') ? 'PDF' : 'TXT'}</span>
      <span class="doc-body"><span class="doc-name">${escapeHtml(d.name)}</span><span class="doc-meta">${meta}</span></span>
      ${d.status === 'error' ? `<button type="button" class="text-btn" data-dismiss="${i}">Dismiss</button>` : ''}
    </li>`;
  }).join('');
}

docList.addEventListener('click', (e) => {
  const i = e.target.dataset.dismiss;
  if (i !== undefined) { docs.splice(Number(i), 1); renderDocs(); }
});

async function uploadFile(file) {
  const doc = { name: file.name, status: 'uploading' };
  docs.push(doc);
  renderDocs();

  const ok = /\.(pdf|txt)$/i.test(file.name);
  if (!ok || file.size > MAX_SIZE) {
    Object.assign(doc, { status: 'error', error: ok ? 'Larger than 5 MB' : 'Only PDF and TXT files work' });
    return renderDocs();
  }

  const slow = setTimeout(() => {
    if (doc.status === 'uploading') { doc.slowNote = true; renderDocs(); }
  }, 8000);

  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE_URL}/upload`, { method: 'POST', body: form, headers: headers() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    Object.assign(doc, { status: 'ready', chunks: data.chunksCreated });
    saveDocs();
  } catch (err) {
    Object.assign(doc, { status: 'error', error: err.message === 'Failed to fetch' ? "Couldn't reach the server" : err.message });
  } finally {
    clearTimeout(slow);
    renderDocs();
  }
}

function handleFiles(list) {
  [...list].forEach(uploadFile);
  fileInput.value = '';
}

fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-drag'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-drag'); }));
drop.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));

$('clearBtn').addEventListener('click', async () => {
  try { await fetch(`${API_BASE_URL}/session`, { method: 'DELETE', headers: headers() }); } catch {}
  docs = [];
  saveDocs();
  renderDocs();
});

// Chat
function addMessage(role, html) {
  empty.hidden = true;
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.innerHTML = html;
  thread.appendChild(el);
  thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  return el;
}

function sourcesHtml(sources) {
  if (!sources || !sources.length) return '';
  const items = sources.map((s) => `
    <li class="source">
      <p class="excerpt"><mark>${escapeHtml(s.excerpt)}${s.excerpt.length >= 280 ? '…' : ''}</mark></p>
      <p class="source-meta">${escapeHtml(s.fileName || 'Document')} <span>match ${Math.round((s.score || 0) * 100)}%</span></p>
    </li>`).join('');
  return `<details class="sources"><summary>Based on ${sources.length} ${sources.length === 1 ? 'passage' : 'passages'}</summary><ol>${items}</ol></details>`;
}

async function ask(q) {
  addMessage('user', `<p>${escapeHtml(q)}</p>`);
  const pending = addMessage('bot is-pending', `<p class="thinking">Reading your documents…</p>`);
  const slow = setTimeout(() => {
    pending.querySelector('.thinking').textContent = 'Still working. The server may be waking up, which can take up to a minute.';
  }, 7000);
  sendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE_URL}/ask`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Something went wrong');

    if (/^Upload a document first/.test(data.answer || '') && docs.length) {
      // Server restarted and lost the documents
      docs = []; saveDocs(); renderDocs();
      data.answer = 'The server restarted and your documents were cleared. Add them again to keep asking.';
    }
    const body = DOMPurify.sanitize(marked.parse(data.answer || "I don't know."));
    pending.className = 'msg bot';
    pending.innerHTML = `<div class="answer">${body}</div>${sourcesHtml(data.sources)}`;
  } catch (err) {
    pending.className = 'msg bot is-error';
    pending.innerHTML = `<p>${escapeHtml(err.message === 'Failed to fetch' ? "Couldn't reach the server. Check your connection and try again." : err.message)}</p>`;
  } finally {
    clearTimeout(slow);
    sendBtn.disabled = false;
    thread.scrollTo({ top: thread.scrollHeight, behavior: 'smooth' });
  }
}

composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const q = question.value.trim();
  if (!q || sendBtn.disabled) return;
  question.value = '';
  question.style.height = '';
  ask(q);
});

question.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composer.requestSubmit(); }
});
question.addEventListener('input', () => {
  question.style.height = 'auto';
  question.style.height = Math.min(question.scrollHeight, 160) + 'px';
});

renderDocs();
