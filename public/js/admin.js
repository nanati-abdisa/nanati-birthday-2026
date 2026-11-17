/* ==========================================================
   NANATI'S BIRTHDAY LOUNGE (admin page)
   ========================================================== */
(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const fmtDate = (d) => { const t = new Date(String(d).replace(' ', 'T') + (String(d).includes('Z') || String(d).includes('T') ? '' : 'Z')); return isNaN(t) ? '' : t.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

  let token = localStorage.getItem('nanati_admin_token') || null;

  // ---------------- helpers ----------------
  function toast(msg, isError) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('error', Boolean(isError));
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function showLogin(message) {
    token = null;
    localStorage.removeItem('nanati_admin_token');
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#loginError').textContent = message || '';
  }

  // JSON request with the admin token; sends you back to login if the session has expired
  async function api(path, options = {}) {
    options.headers = Object.assign({}, options.headers, { Authorization: token || '' });
    const res = await fetch(path, options);
    if (res.status === 401) { showLogin('Your session ended. Please log in again 👑'); throw new Error('Session ended'); }
    return res;
  }
  async function apiJson(path, options) {
    const res = await api(path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = res.status; e.data = data; throw e; }
    return data;
  }
  const jsonBody = (obj) => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

  // Upload with a progress bar (videos can be big)
  function upload(url, method, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open(method, url);
      x.setRequestHeader('Authorization', token || '');
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let d = {}; try { d = JSON.parse(x.responseText); } catch (e) { /* ignore */ }
        if (x.status === 401) { showLogin('Your session ended. Please log in again 👑'); return reject(new Error('Session ended')); }
        if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error(d.error || 'Upload failed (' + x.status + ')'));
      };
      x.onerror = () => reject(new Error('Network problem while uploading'));
      x.send(formData);
    });
  }

  // Reusable edit dialog. fields: [{key,label,type:'text'|'textarea'|'number'|'file',value,accept,required}]
  function editDialog({ title, fields, onSave, saveLabel }) {
    const dlg = $('#editDialog'), form = $('#editForm');
    form.innerHTML = `<h3>${esc(title)}</h3>` + fields.map(f => `
      <div class="field"><label>${esc(f.label)}
        ${f.type === 'textarea' ? `<textarea name="${f.key}">${esc(f.value)}</textarea>`
          : f.type === 'file' ? `<input type="file" name="${f.key}" accept="${f.accept || ''}">`
          : `<input type="${f.type || 'text'}" name="${f.key}" value="${esc(f.value)}" ${f.required ? 'required' : ''}>`}
      </label></div>`).join('') + `
      <div class="form-error" id="editError"></div>
      <div class="row" style="justify-content:flex-end">
        <button type="button" class="btn btn-soft" id="editCancel">Cancel</button>
        <button type="submit" class="btn btn-gold">${esc(saveLabel || 'Save ✨')}</button>
      </div>`;
    $('#editCancel').onclick = () => dlg.close();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'); btn.disabled = true;
      try { await onSave(new FormData(form)); dlg.close(); }
      catch (err) { $('#editError').textContent = err.message; }
      finally { btn.disabled = false; }
    };
    dlg.showModal();
  }

  // ---------------- login / logout ----------------
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginError').textContent = '';
    try {
      const res = await fetch('/api/admin/login', { method: 'POST', ...jsonBody({ username: $('#loginUser').value, password: $('#loginPass').value }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      token = data.token;
      localStorage.setItem('nanati_admin_token', token);
      $('#loginPass').value = '';
      enterApp();
    } catch (err) { $('#loginError').textContent = err.message; }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST', headers: { Authorization: token || '' } }); } catch (e) { /* ignore */ }
    showLogin('You are logged out. See you soon! 💛');
  });

  function enterApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
    showTab(currentTab);
  }

  // ---------------- tabs ----------------
  let currentTab = 'overview';
  const loaders = { overview: loadOverview, wishes: loadWishes, guests: loadGuests, gifts: loadGifts, photos: loadPhotos, videos: loadVideos, music: loadMusic, settings: loadSettings };

  function showTab(name) {
    currentTab = name;
    $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.pane').forEach(p => p.classList.toggle('active', p.id === 'pane-' + name));
    stopRecorderIfAny();
    loaders[name]().catch(err => { if (err.message !== 'Session ended') toast(err.message, true); });
  }
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); });

  const pane = (n) => $('#pane-' + n);
  const header = (title, sub) => `<h2 class="pane-title">${title}</h2><p class="pane-sub">${sub}</p>`;

  // ---------------- OVERVIEW ----------------
  async function loadOverview() {
    const [st, msgs] = await Promise.all([apiJson('/api/admin/stats'), apiJson('/api/messages')]);
    const waiting = msgs.filter(m => !m.admin_reply).length;
    const stat = (em, num, lbl) => `<div class="stat"><div class="em">${em}</div><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
    pane('overview').innerHTML = `
      <div class="hero-banner">
        <h2>Happy Birthday, Nanati! 🎂</h2>
        <p>${msgs.length ? `You have <strong>${msgs.length}</strong> birthday wish${msgs.length === 1 ? '' : 'es'}${waiting ? ` — <strong>${waiting}</strong> waiting for your reply 💌` : ' and you replied to all of them 💛'}` : 'Share your birthday link with friends — their wishes will appear here! 💌'}</p>
      </div>
      <div class="grid">
        ${stat('👥', st.totalParticipants, 'Guests joined')}${stat('🏹', st.completedGames, 'Games played')}
        ${stat('💌', st.totalMessages, 'Wishes')}${stat('❤️', st.likedMessages, 'Liked by you')}
        ${stat('💬', st.repliedMessages, 'Replies sent')}${stat('🎁', st.activeGifts + '/' + st.totalGifts, 'Gifts active')}
        ${stat('📸', st.totalPhotos, 'Photos')}${stat('🎬', st.totalVideos, 'Videos')}
        ${stat('🎵', st.totalMusic, 'Music tracks')}${stat('🎙️', st.totalVoice, 'Voice notes')}
      </div>
      <div class="card" style="margin-top:1.5rem">
        <h3>Latest wishes</h3>
        ${msgs.slice(0, 4).map(m => `<div style="padding:.6rem 0;border-top:1px solid var(--beige)"><strong>${esc(m.name)}</strong> <span class="wish-date">${esc(fmtDate(m.created_at))}</span><div style="overflow-wrap:anywhere">${esc(m.content)}</div></div>`).join('') || '<div class="empty">No wishes yet 🎈</div>'}
        ${msgs.length ? '<div class="row"><button class="btn btn-soft btn-sm" id="goWishes">Open all wishes →</button></div>' : ''}
      </div>`;
    const go = $('#goWishes'); if (go) go.onclick = () => showTab('wishes');
  }

  // ---------------- WISHES & REPLIES ----------------
  async function loadWishes() {
    const msgs = await apiJson('/api/messages');
    pane('wishes').innerHTML = header('Wishes & Replies 💌', 'Read every wish, give it a ❤️, and reply — your reply shows under the wish on your birthday page.') +
      (msgs.length ? `<div class="stack">${msgs.map(m => `
        <article class="card wish" data-id="${m.id}">
          <div class="wish-head">
            <div><span class="wish-name">${esc(m.name)}</span> <span class="wish-date">${esc(fmtDate(m.created_at))}</span></div>
            <div>${m.gift_name ? `<span class="chip">${m.gift_image ? `<img src="${esc(m.gift_image)}" alt="">` : ''}🎁 ${esc(m.gift_name)}</span>` : ''}
            <button class="heart" data-act="like" title="Like / unlike">${m.is_liked ? '❤️' : '🤍'}</button></div>
          </div>
          <div class="wish-body">${esc(m.content)}</div>
          <div class="reply-box">
            <label>YOUR REPLY<textarea data-reply placeholder="Write a sweet reply...">${esc(m.admin_reply || '')}</textarea></label>
            <div class="row">
              <button class="btn btn-gold btn-sm" data-act="reply">${m.admin_reply ? 'Update reply' : 'Send reply'} 💛</button>
              ${m.admin_reply ? '<button class="btn btn-soft btn-sm" data-act="unreply">Remove reply</button>' : ''}
              <button class="btn btn-danger btn-sm" data-act="delete" style="margin-left:auto">🗑️ Delete wish</button>
            </div>
          </div>
        </article>`).join('')}</div>` : '<div class="empty">No wishes yet. Share your birthday link and they will show up here! 🎈</div>');
  }

  pane('wishes').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const card = btn.closest('.wish'), id = card.dataset.id, act = btn.dataset.act;
    try {
      if (act === 'like') { await apiJson(`/api/messages/${id}/like`, { method: 'PATCH' }); }
      else if (act === 'reply') {
        const text = $('[data-reply]', card).value.trim();
        if (!text) return toast('Write something first 💬', true);
        await apiJson(`/api/messages/${id}/reply`, { method: 'POST', ...jsonBody({ reply: text }) }); toast('Reply sent 💛');
      }
      else if (act === 'unreply') { await apiJson(`/api/messages/${id}/reply`, { method: 'DELETE' }); toast('Reply removed'); }
      else if (act === 'delete') { if (!confirm('Delete this wish for good?')) return; await apiJson(`/api/messages/${id}`, { method: 'DELETE' }); toast('Wish deleted'); }
      await loadWishes();
    } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
  });

  // ---------------- GUESTS ----------------
  async function loadGuests() {
    const list = await apiJson('/api/participants');
    pane('guests').innerHTML = header('Guests 👥', 'Everyone who joined the Wishing Balloon Game, and the gift mission they popped.') +
      (list.length ? `<div class="card"><div class="table-wrap"><table>
        <thead><tr><th>Guest</th><th>Gift mission</th><th>Wishes</th><th>Joined</th></tr></thead>
        <tbody>${list.map(p => `<tr>
          <td><strong>${esc(p.name)}</strong></td>
          <td>${p.gift_name ? `<span class="chip">${p.gift_image ? `<img src="${esc(p.gift_image)}" alt="">` : ''}🎁 ${esc(p.gift_name)}</span>` : '<span class="wish-date">Hasn\'t popped a balloon yet</span>'}</td>
          <td>${p.wish_count || 0}</td><td class="wish-date">${esc(fmtDate(p.created_at))}</td></tr>`).join('')}</tbody></table></div></div>`
        : '<div class="empty">No guests yet 🎈</div>');
  }

  // ---------------- GIFTS ----------------
  async function loadGifts() {
    const gifts = await apiJson('/api/gifts');
    pane('gifts').innerHTML = header('Gifts 🎁', 'The missions hidden inside the balloons. Turn one off if it is no longer available.') + `
      <div class="card"><h3>Add a gift</h3>
        <form id="giftForm" class="form-grid">
          <label>GIFT NAME<input type="text" name="name" maxlength="120" required placeholder="e.g. Perfume"></label>
          <label>DESCRIPTION / FUNNY TASK<input type="text" name="description" maxlength="300" placeholder="Optional"></label>
          <label>PICTURE<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif" required></label>
          <button class="btn btn-gold" type="submit">Add gift 🎁</button>
        </form></div>
      <div class="card"><h3>Current gifts (${gifts.length})</h3><div class="table-wrap"><table>
        <thead><tr><th></th><th>Name</th><th>Description</th><th>Status</th><th></th></tr></thead>
        <tbody>${gifts.map(g => `<tr data-id="${g.id}">
          <td><img class="thumb" src="${esc(g.image_url)}" alt=""></td><td><strong>${esc(g.name)}</strong></td>
          <td style="max-width:260px;overflow-wrap:anywhere">${esc(g.description || '')}</td>
          <td><button class="btn btn-soft btn-sm" data-act="toggle">${g.is_enabled ? '✅ Active' : '⏸️ Off'}</button></td>
          <td><div class="actions"><button class="btn btn-soft btn-sm" data-act="edit" data-name="${esc(g.name)}" data-desc="${esc(g.description || '')}">Edit</button><button class="btn btn-danger btn-sm" data-act="delete">Delete</button></div></td></tr>`).join('')}</tbody></table></div></div>`;
  }

  pane('gifts').addEventListener('submit', async (e) => {
    if (e.target.id !== 'giftForm') return;
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]'); btn.disabled = true;
    try { await apiJson('/api/gifts', { method: 'POST', body: new FormData(e.target) }); toast('Gift added 🎁'); await loadGifts(); }
    catch (err) { if (err.message !== 'Session ended') toast(err.message, true); } finally { btn.disabled = false; }
  });

  pane('gifts').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('tr').dataset.id, act = btn.dataset.act;
    try {
      if (act === 'toggle') { await apiJson(`/api/gifts/${id}/toggle`, { method: 'PATCH' }); await loadGifts(); }
      else if (act === 'edit') {
        editDialog({ title: 'Edit gift', fields: [
          { key: 'name', label: 'GIFT NAME', value: btn.dataset.name, required: true },
          { key: 'description', label: 'DESCRIPTION / FUNNY TASK', type: 'textarea', value: btn.dataset.desc },
          { key: 'image', label: 'NEW PICTURE (OPTIONAL)', type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif' }
        ], onSave: async (fd) => { if (!fd.get('image') || !fd.get('image').size) fd.delete('image'); await apiJson(`/api/gifts/${id}`, { method: 'PUT', body: fd }); toast('Gift updated ✨'); await loadGifts(); } });
      }
      else if (act === 'delete') {
        if (!confirm('Delete this gift?')) return;
        try { await apiJson(`/api/gifts/${id}`, { method: 'DELETE' }); }
        catch (err) {
          if (err.status === 409 && confirm(err.message + '\n\nDelete it anyway? Those guests will be able to play again.')) await apiJson(`/api/gifts/${id}?force=true`, { method: 'DELETE' });
          else if (err.status !== 409) throw err; else return;
        }
        toast('Gift deleted'); await loadGifts();
      }
    } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
  });

  // ---------------- PHOTOS ----------------
  async function loadPhotos() {
    const photos = await apiJson('/api/gallery');
    pane('photos').innerHTML = header('Photos 📸', 'These appear in “View More Photos” on your birthday page, in this order.') + `
      <div class="card"><h3>Add photos</h3>
        <form id="photoForm" class="form-grid">
          <label>PHOTOS (you can pick several)<input type="file" name="photo" id="photoFiles" accept="image/jpeg,image/png,image/webp,image/gif" multiple required></label>
          <label>CAPTION (OPTIONAL)<input type="text" id="photoCaption" maxlength="200" placeholder="e.g. Birthday dinner ❤️"></label>
          <button class="btn btn-gold" type="submit">Upload 📸</button>
        </form><progress id="photoProg" max="1" value="0" hidden></progress><p class="hint">JPG, PNG, WEBP or GIF · up to 8 MB each.</p></div>
      <div style="height:1.25rem"></div>
      ${photos.length ? `<div class="grid">${photos.map(p => `
        <div class="media-card" data-id="${p.id}">
          <img class="thumb-big" src="${esc(p.image_url)}" alt="" loading="lazy">
          <div class="media-body"><div class="media-title">${esc(p.description || 'No caption')}</div><div class="media-meta">Position ${p.sort_order}</div>
            <div class="row"><button class="btn btn-soft btn-sm" data-act="edit" data-desc="${esc(p.description || '')}" data-order="${p.sort_order}">Edit</button><button class="btn btn-danger btn-sm" data-act="delete">Delete</button></div></div>
        </div>`).join('')}</div>` : '<div class="empty">No photos yet 📷</div>'}`;
  }

  pane('photos').addEventListener('submit', async (e) => {
    if (e.target.id !== 'photoForm') return;
    e.preventDefault();
    const files = Array.from($('#photoFiles').files); if (!files.length) return;
    const btn = e.target.querySelector('[type=submit]'), prog = $('#photoProg'); btn.disabled = true; prog.hidden = false;
    try {
      for (let i = 0; i < files.length; i++) {
        const fd = new FormData(); fd.append('photo', files[i]); fd.append('description', $('#photoCaption').value);
        await upload('/api/gallery', 'POST', fd, (p) => { prog.value = (i + p) / files.length; });
      }
      toast(files.length > 1 ? `${files.length} photos added 📸` : 'Photo added 📸'); await loadPhotos();
    } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); } finally { btn.disabled = false; prog.hidden = true; }
  });

  pane('photos').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const id = btn.closest('.media-card').dataset.id;
    try {
      if (btn.dataset.act === 'edit') {
        editDialog({ title: 'Edit photo', fields: [
          { key: 'description', label: 'CAPTION', value: btn.dataset.desc },
          { key: 'sort_order', label: 'ORDER (SMALLER NUMBER SHOWS FIRST)', type: 'number', value: btn.dataset.order },
          { key: 'photo', label: 'REPLACE PICTURE (OPTIONAL)', type: 'file', accept: 'image/jpeg,image/png,image/webp,image/gif' }
        ], onSave: async (fd) => { if (!fd.get('photo') || !fd.get('photo').size) fd.delete('photo'); await apiJson(`/api/gallery/${id}`, { method: 'PUT', body: fd }); toast('Photo updated ✨'); await loadPhotos(); } });
      } else if (btn.dataset.act === 'delete') {
        if (!confirm('Delete this photo?')) return;
        await apiJson(`/api/gallery/${id}`, { method: 'DELETE' }); toast('Photo deleted'); await loadPhotos();
      }
    } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
  });

  // ---------------- shared media list (videos / music / voice) ----------------
  function mediaCards(items, kind) {
    if (!items.length) return `<div class="empty">${kind === 'video' ? 'No videos yet 🎬' : kind === 'music' ? 'No music yet 🎵' : 'No voice notes yet 🎙️'}</div>`;
    return `<div class="${kind === 'video' ? 'video-list' : 'grid'}">${items.map(m => `
      <div class="media-card" data-id="${m.id}" data-kind="${kind}">
        ${kind === 'video' ? `<video controls playsinline preload="metadata" src="${esc(m.url)}"></video>` : ''}
        <div class="media-body">
          <div class="media-title">${kind === 'music' ? '🎵' : kind === 'voice' ? '🎙️' : '🎬'} ${esc(m.title || 'Untitled')}</div>
          ${kind !== 'video' ? `<audio controls preload="none" src="${esc(m.url)}"></audio>` : ''}
          <div class="media-meta">Position ${m.sort_order} · ${esc(fmtDate(m.created_at))}</div>
          <div class="row"><button class="btn btn-soft btn-sm" data-act="edit" data-title="${esc(m.title || '')}" data-order="${m.sort_order}">Edit</button><button class="btn btn-danger btn-sm" data-act="delete">Delete</button></div>
        </div>
      </div>`).join('')}</div>`;
  }

  function uploadForm(id, kind, accept, label, hint) {
    return `<form class="form-grid" id="${id}" data-kind="${kind}">
        <label>TITLE (OPTIONAL)<input type="text" name="title" maxlength="200" placeholder="e.g. Thank you all ❤️"></label>
        <label>${label}<input type="file" name="file" accept="${accept}" required></label>
        <button class="btn btn-gold" type="submit">Upload ✨</button>
      </form><progress max="1" value="0" hidden></progress><p class="hint">${hint}</p>`;
  }

  async function handleMediaUpload(form, onDone) {
    const prog = form.nextElementSibling, btn = form.querySelector('[type=submit]');
    const fd = new FormData(form); fd.append('kind', form.dataset.kind);
    btn.disabled = true; prog.hidden = false; prog.value = 0;
    try { await upload('/api/media', 'POST', fd, (p) => { prog.value = p; }); toast('Uploaded ✨'); await onDone(); }
    catch (err) { if (err.message !== 'Session ended') toast(err.message, true); } finally { btn.disabled = false; prog.hidden = true; }
  }

  function mediaListActions(paneEl, reload) {
    paneEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.media-card [data-act]'); if (!btn) return;
      const id = btn.closest('.media-card').dataset.id;
      try {
        if (btn.dataset.act === 'edit') {
          editDialog({ title: 'Edit', fields: [
            { key: 'title', label: 'TITLE', value: btn.dataset.title },
            { key: 'sort_order', label: 'ORDER (SMALLER NUMBER SHOWS FIRST)', type: 'number', value: btn.dataset.order }
          ], onSave: async (fd) => { await apiJson(`/api/media/${id}`, { method: 'PUT', ...jsonBody({ title: fd.get('title'), sort_order: fd.get('sort_order') }) }); toast('Saved ✨'); await reload(); } });
        } else if (btn.dataset.act === 'delete') {
          if (!confirm('Delete this for good?')) return;
          await apiJson(`/api/media/${id}`, { method: 'DELETE' }); toast('Deleted'); await reload();
        }
      } catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
    });
  }

  // ---------------- VIDEOS ----------------
  async function loadVideos() {
    const items = await apiJson('/api/media?kind=video');
    pane('videos').innerHTML = header('Short Videos 🎬', 'Show up in “A Little Birthday Surprise” on your birthday page.') +
      `<div class="card"><h3>Add a video</h3>${uploadForm('videoForm', 'video', 'video/mp4,video/webm,video/quicktime', 'VIDEO FILE', 'MP4 works best (phone videos are fine) · short videos up to 40 MB.')}</div><div style="height:1.25rem"></div>` + mediaCards(items, 'video');
  }
  pane('videos').addEventListener('submit', (e) => { if (e.target.id === 'videoForm') { e.preventDefault(); handleMediaUpload(e.target, loadVideos); } });
  mediaListActions(pane('videos'), () => loadVideos());

  // ---------------- MUSIC & VOICE (with recorder) ----------------
  async function loadMusic() {
    const [music, voice] = await Promise.all([apiJson('/api/media?kind=music'), apiJson('/api/media?kind=voice')]);
    pane('music').innerHTML = header('Music & Voice 🎵', 'Music plays on your birthday page when a guest taps “Music”. Voice notes appear as playable messages from you.') + `
      <div class="card"><h3>🎵 Birthday music</h3>${uploadForm('musicForm', 'music', 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/webm', 'MUSIC FILE', 'MP3, M4A, WAV or OGG · up to 15 MB. Several tracks play one after another. With no music uploaded, a soft music-box “Happy Birthday” plays.')}</div>
      <div style="height:1.25rem"></div>${mediaCards(music, 'music')}
      <div style="height:2rem"></div>
      <div class="card"><h3>🎙️ Record a voice message</h3>
        <div class="recorder" id="recorder">
          <div id="recStatus" class="hint" style="margin:0">Tap record and say something sweet to your friends 💛</div>
          <div class="row" style="margin:0"><button class="btn btn-gold" id="recStart" type="button">🎙️ Start recording</button><button class="btn btn-soft" id="recStop" type="button" hidden>⏹️ Stop</button></div>
          <div id="recResult" hidden>
            <audio id="recPreview" controls style="width:100%"></audio>
            <label style="margin-top:.8rem">TITLE (OPTIONAL)<input type="text" id="recTitle" maxlength="200" placeholder="e.g. Thank you, my loves ❤️"></label>
            <div class="row"><button class="btn btn-gold" id="recSave" type="button">Save voice note 💾</button><button class="btn btn-soft" id="recDiscard" type="button">Discard</button></div>
          </div>
        </div></div>
      <div style="height:1.25rem"></div>
      <div class="card"><h3>…or upload a voice note</h3>${uploadForm('voiceForm', 'voice', 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/webm', 'AUDIO FILE', 'Voice notes from WhatsApp (.ogg / .m4a) work too.')}</div>
      <div style="height:1.25rem"></div>${mediaCards(voice, 'voice')}`;
    initRecorder();
  }
  pane('music').addEventListener('submit', (e) => { if (e.target.id === 'musicForm' || e.target.id === 'voiceForm') { e.preventDefault(); handleMediaUpload(e.target, loadMusic); } });
  mediaListActions(pane('music'), () => loadMusic());

  let rec = null, recStream = null, recChunks = [], recBlob = null, recTimer = null;
  function stopRecorderIfAny() {
    clearInterval(recTimer);
    if (rec && rec.state !== 'inactive') { rec.onstop = null; try { rec.stop(); } catch (e) { /* ignore */ } }
    if (recStream) recStream.getTracks().forEach(t => t.stop());
    rec = null; recStream = null; recChunks = []; recBlob = null;
  }

  function initRecorder() {
    const status = $('#recStatus'), start = $('#recStart'), stop = $('#recStop'), result = $('#recResult'), preview = $('#recPreview');
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      status.textContent = 'Recording needs a secure (https) link and a modern browser. You can still upload a voice note below.';
      start.disabled = true; return;
    }
    start.onclick = async () => {
      try {
        recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) { status.textContent = 'I could not use the microphone. Please allow microphone access and try again.'; return; }
      recChunks = []; rec = new MediaRecorder(recStream);
      rec.ondataavailable = (ev) => { if (ev.data.size) recChunks.push(ev.data); };
      rec.onstop = () => {
        clearInterval(recTimer);
        recBlob = new Blob(recChunks, { type: rec.mimeType || 'audio/webm' });
        recStream.getTracks().forEach(t => t.stop());
        preview.src = URL.createObjectURL(recBlob);
        result.hidden = false; stop.hidden = true; start.hidden = false;
        status.textContent = 'Listen to it, then save 💛';
      };
      rec.start(); result.hidden = true; start.hidden = true; stop.hidden = false;
      const t0 = Date.now();
      recTimer = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); status.innerHTML = `<span class="rec-dot"></span>Recording… ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s >= 300) stop.click(); }, 250);
    };
    stop.onclick = () => { if (rec && rec.state !== 'inactive') rec.stop(); };
    $('#recDiscard').onclick = () => { recBlob = null; result.hidden = true; status.textContent = 'Tap record and say something sweet to your friends 💛'; };
    $('#recSave').onclick = async () => {
      if (!recBlob) return;
      const btn = $('#recSave'); btn.disabled = true;
      const fd = new FormData();
      const ext = /mp4/.test(recBlob.type) ? 'm4a' : /ogg/.test(recBlob.type) ? 'ogg' : 'webm';
      fd.append('kind', 'voice'); fd.append('title', $('#recTitle').value);
      fd.append('file', recBlob, 'voice-note.' + ext);
      try { await upload('/api/media', 'POST', fd); toast('Voice note saved 🎙️'); await loadMusic(); }
      catch (err) { if (err.message !== 'Session ended') toast(err.message, true); btn.disabled = false; }
    };
  }

  // ---------------- SETTINGS ----------------
  async function loadSettings() {
    pane('settings').innerHTML = header('Settings ⚙️', 'Keep your lounge private.') + `
      <div class="card"><h3>🔒 Change password</h3>
        <form id="pwForm" class="form-grid">
          <label>CURRENT PASSWORD<input type="password" name="currentPassword" autocomplete="current-password" required></label>
          <label>NEW PASSWORD (8+ CHARACTERS)<input type="password" name="newPassword" minlength="8" autocomplete="new-password" required></label>
          <button class="btn btn-gold" type="submit">Update 🔒</button>
        </form></div>
      <div class="card"><h3>🔗 Your links</h3>
        <p style="margin:.2rem 0 .8rem">Share this one with your friends:</p>
        <div class="row" style="margin-top:0"><input type="text" readonly id="shareLink" value="${esc(location.origin + '/')}" style="flex:1;min-width:220px"><button class="btn btn-gold" id="copyLink" type="button">Copy 📋</button></div>
        <p class="hint">This lounge (${esc(location.origin)}/admin.html) is only for you — don’t share it.</p></div>`;
    $('#copyLink').onclick = async () => { try { await navigator.clipboard.writeText($('#shareLink').value); toast('Link copied 💛'); } catch (e) { $('#shareLink').select(); toast('Press Ctrl+C to copy'); } };
  }
  pane('settings').addEventListener('submit', async (e) => {
    if (e.target.id !== 'pwForm') return;
    e.preventDefault();
    const fd = new FormData(e.target);
    try { await apiJson('/api/admin/password', { method: 'POST', ...jsonBody({ currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword') }) }); e.target.reset(); toast('Password updated 🔒'); }
    catch (err) { if (err.message !== 'Session ended') toast(err.message, true); }
  });

  // ---------------- start ----------------
  (async function init() {
    if (!token) return;
    try {
      const r = await fetch('/api/admin/check', { headers: { Authorization: token } });
      const d = await r.json();
      if (d.authenticated) enterApp(); else showLogin();
    } catch (e) { showLogin(); }
  })();
})();
