/* ==========================================================
   NANATI'S BIRTHDAY CELEBRATION APP
   Messages, Gallery Lightbox, Admin Controls & Interactive UI
   ========================================================== */

(function () {
  const adminToken = null; // admin lives on /admin.html now
  let galleryPhotos = [];
  let currentLightboxIndex = 0;
  let musicAudioCtx = null;
  let isMusicPlaying = false;
  let musicInterval = null;

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initMusicPlayer();
    initShareButton();
    initCandleWidget();
    initSuggestedWishes();
    initMessageForm();
    loadMessages();
    loadGallery();
    initLightbox();
    loadMedia();
  });

  // ---------------- NAVIGATION & SMOOTH SCROLL ----------------
  function initNavigation() {
    const toggleBtn = document.getElementById('mobileMenuToggle');
    const navLinks = document.getElementById('navLinks');

    if (toggleBtn && navLinks) {
      toggleBtn.addEventListener('click', () => {
        navLinks.classList.toggle('open');
      });
    }

    // Close mobile nav on link click
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        if (navLinks) navLinks.classList.remove('open');
      });
    });

    // Active Section Spy on Scroll
    window.addEventListener('scroll', () => {
      const sections = document.querySelectorAll('section[id]');
      const scrollY = window.pageYOffset;

      sections.forEach(current => {
        const sectionHeight = current.offsetHeight;
        const sectionTop = current.offsetTop - 120;
        const sectionId = current.getAttribute('id');
        const link = document.querySelector(`.nav-link[href="#${sectionId}"]`);

        if (link) {
          if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
          }
        }
      });
    });
  }

  // ---------------- MUSIC BOX MELODY (WEB AUDIO SYNTH) ----------------
  function initMusicPlayer() {
    const musicBtn = document.getElementById('navMusicToggle');
    if (!musicBtn) return;

    // "Happy Birthday" melody note frequencies
    const notes = [
      { f: 261.63, d: 0.35 }, { f: 261.63, d: 0.15 }, { f: 293.66, d: 0.5 }, { f: 261.63, d: 0.5 }, { f: 349.23, d: 0.5 }, { f: 329.63, d: 1.0 },
      { f: 261.63, d: 0.35 }, { f: 261.63, d: 0.15 }, { f: 293.66, d: 0.5 }, { f: 261.63, d: 0.5 }, { f: 392.00, d: 0.5 }, { f: 349.23, d: 1.0 },
      { f: 261.63, d: 0.35 }, { f: 261.63, d: 0.15 }, { f: 523.25, d: 0.5 }, { f: 440.00, d: 0.5 }, { f: 349.23, d: 0.5 }, { f: 329.63, d: 0.5 }, { f: 293.66, d: 0.8 },
      { f: 466.16, d: 0.35 }, { f: 466.16, d: 0.15 }, { f: 440.00, d: 0.5 }, { f: 349.23, d: 0.5 }, { f: 392.00, d: 0.5 }, { f: 349.23, d: 1.2 }
    ];

    function playMelody() {
      if (!isMusicPlaying) return;
      if (!musicAudioCtx) musicAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (musicAudioCtx.state === 'suspended') musicAudioCtx.resume();

      let timeOffset = musicAudioCtx.currentTime + 0.1;

      notes.forEach(note => {
        const osc = musicAudioCtx.createOscillator();
        const gain = musicAudioCtx.createGain();

        // Music Box Bell timbre (Triangle + Sine harmonic)
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, timeOffset);

        gain.gain.setValueAtTime(0, timeOffset);
        gain.gain.linearRampToValueAtTime(0.18, timeOffset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, timeOffset + note.d * 0.9);

        osc.connect(gain);
        gain.connect(musicAudioCtx.destination);

        osc.start(timeOffset);
        osc.stop(timeOffset + note.d);

        timeOffset += note.d * 0.95;
      });
    }

    musicBtn.addEventListener('click', () => {
      isMusicPlaying = !isMusicPlaying;
      if (isMusicPlaying) {
        musicBtn.innerHTML = '🎶 Music: On';
        musicBtn.style.background = 'var(--color-champagne-gold)';
        musicBtn.style.color = 'var(--color-deep-brown)';
        if (musicTracks.length) {
          playTrack(0);
        } else {
          playMelody();
          musicInterval = setInterval(playMelody, 16000);
        }
      } else {
        musicBtn.innerHTML = '🎵 Music: Off';
        musicBtn.style.background = '';
        musicBtn.style.color = '';
        if (musicInterval) clearInterval(musicInterval);
        stopTracks();
      }
    });
  }

  // Music Nanati uploaded from her admin page (plays one after another, looping)
  let musicTracks = [];
  let trackAudio = null;
  function playTrack(i) {
    if (!isMusicPlaying || !musicTracks.length) return;
    const idx = i % musicTracks.length;
    if (!trackAudio) trackAudio = new Audio();
    trackAudio.src = musicTracks[idx].url;
    trackAudio.volume = 0.6;
    trackAudio.onended = () => playTrack(idx + 1);
    trackAudio.onerror = () => playTrack(idx + 1);
    trackAudio.play().catch(() => {});
  }
  function stopTracks() {
    if (trackAudio) { trackAudio.onended = null; trackAudio.pause(); }
  }

  // ---------------- VIDEOS, VOICE NOTES & MUSIC FROM THE ADMIN PAGE ----------------
  async function loadMedia() {
    try {
      const res = await fetch('/api/media');
      const items = await res.json();
      musicTracks = items.filter(m => m.kind === 'music');
      const videos = items.filter(m => m.kind === 'video');
      const voices = items.filter(m => m.kind === 'voice');

      const section = document.getElementById('media-section');
      if (!section) return;
      section.style.display = (videos.length || voices.length) ? 'block' : 'none';

      document.getElementById('mediaVideos').innerHTML = videos.map(v => `
        <figure class="media-video-card">
          <video controls playsinline preload="metadata" src="${escapeHtml(v.url)}"></video>
          ${v.title ? `<figcaption>${escapeHtml(v.title)}</figcaption>` : ''}
        </figure>`).join('');

      document.getElementById('mediaVoices').innerHTML = voices.map(v => `
        <div class="media-voice-card">
          <div class="media-voice-title">🎙️ ${escapeHtml(v.title || 'A voice note from Nanati')}</div>
          <audio controls preload="none" src="${escapeHtml(v.url)}"></audio>
        </div>`).join('');
    } catch (e) {
      console.error('Media load error:', e);
    }
  }

  // ---------------- SHARE BUTTON ----------------
  function initShareButton() {
    const shareBtn = document.getElementById('navShareBtn');
    if (!shareBtn) return;

    shareBtn.addEventListener('click', async () => {
      const shareUrl = window.location.origin + '/';
      try {
        await navigator.clipboard.writeText(shareUrl);
        showNotification('Celebration link copied! Share with friends & family ❤️');
      } catch (e) {
        // Clipboard blocked (e.g. plain http) - let the person copy it by hand
        prompt('Copy Nanati\'s Birthday celebration link:', shareUrl);
      }
    });
  }

  // ---------------- INTERACTIVE CANDLE WIDGET ----------------
  function initCandleWidget() {
    const candleBox = document.getElementById('candleWidget');
    const flame = document.getElementById('candleFlame');
    const title = document.getElementById('candleStatusTitle');
    const subtitle = document.getElementById('candleStatusSubtitle');

    if (!candleBox || !flame) return;

    let isBlownOut = false;

    candleBox.addEventListener('click', () => {
      if (!isBlownOut) {
        // Blow out candle
        isBlownOut = true;
        flame.classList.add('out');
        title.textContent = '✨ Wish Made!';
        subtitle.textContent = "May all of Nanati's dreams and wishes come true this year! ❤️ (Click to relight)";
        triggerConfetti();
        showNotification('✨ Wish sent to the birthday girl!');
      } else {
        // Relight
        isBlownOut = false;
        flame.classList.remove('out');
        title.textContent = 'Blow Out the Candle! 🕯️';
        subtitle.textContent = 'Click or tap to blow out the flame and send Nanati a wish!';
      }
    });
  }

  // ---------------- SUGGESTED BIRTHDAY WISHES ----------------
  function initSuggestedWishes() {
    const chips = document.querySelectorAll('.wish-chip');
    const textarea = document.getElementById('messageContentInput');

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        if (textarea) {
          textarea.value = chip.getAttribute('data-wish');
          textarea.focus();
        }
      });
    });
  }

  // ---------------- BIRTHDAY MESSAGES ----------------
  async function loadMessages() {
    const listContainer = document.getElementById('messagesList');
    if (!listContainer) return;

    try {
      const res = await fetch('/api/messages');
      const messages = await res.json();

      if (messages.length === 0) {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 2.5rem; background: #FFFDF8; border-radius: 16px; border: 1px dashed #D6B77A;">
            <p style="font-size: 1.1rem; color: #7A5B4C;">Be the very first to send Nanati a wonderful birthday wish! 💌</p>
          </div>
        `;
        return;
      }

      listContainer.innerHTML = messages.map(msg => renderMessageCard(msg)).join('');
      attachMessageCardListeners();
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  function renderMessageCard(msg) {
    const isLiked = msg.is_liked === 1;
    const hasReply = msg.admin_reply && msg.admin_reply.trim().length > 0;
    const isAdmin = Boolean(adminToken);

    let giftButtonHtml = '';
    if (msg.gift_name) {
      giftButtonHtml = `
        <button class="gift-show-btn" data-msg-id="${msg.id}">
          🎁 Show
        </button>
      `;
    }

    let giftRevealHtml = '';
    if (msg.gift_name) {
      giftRevealHtml = `
        <div class="card-gift-reveal" id="gift-reveal-${msg.id}">
          <img src="${escapeHtml(msg.gift_image || '/images/gifts/socks.svg')}" class="card-gift-img" alt="${escapeHtml(msg.gift_name)}">
          <div class="card-gift-details">
            <span class="card-gift-tag">Nanati's Birthday Assignment</span>
            <span class="card-gift-name">${escapeHtml(msg.gift_name)}</span>
          </div>
        </div>
      `;
    }

    let replyHtml = '';
    if (hasReply) {
      replyHtml = `
        <div class="nanati-reply-box">
          <div class="reply-header">
            <span>Nanati's reply:</span>
            ${isAdmin ? `<button class="btn-sm btn-outline delete-reply-btn" data-msg-id="${msg.id}" style="padding: 0.15rem 0.5rem; font-size: 0.75rem;">Delete Reply</button>` : ''}
          </div>
          <div class="reply-content">"${escapeHtml(msg.admin_reply)}" ❤️</div>
        </div>
      `;
    }

    let adminActionsHtml = '';
    if (isAdmin) {
      adminActionsHtml = `
        <div class="admin-card-actions">
          <button class="btn-sm btn-primary reply-modal-btn" data-msg-id="${msg.id}" data-name="${escapeHtml(msg.name)}">
            ✍️ ${hasReply ? 'Edit Reply' : 'Reply as Nanati'}
          </button>
          <button class="btn-sm btn-secondary delete-msg-btn" data-msg-id="${msg.id}">
            🗑️ Delete Message
          </button>
        </div>
      `;
    }

    return `
      <div class="message-card" id="msg-card-${msg.id}">
        <!-- Top Row -->
        <div class="message-card-top">
          <div class="participant-name-badge">${escapeHtml(msg.name)}</div>
          ${giftButtonHtml}
        </div>

        <!-- Revealed Gift (Hidden by default) -->
        ${giftRevealHtml}

        <!-- Message Body -->
        <div class="message-card-body">
          ${escapeHtml(msg.content)}
        </div>

        <!-- Like Section -->
        <div class="message-card-like">
          <span class="heart-icon ${isLiked ? 'liked' : ''} ${isAdmin ? 'heart-btn-admin' : ''}" data-msg-id="${msg.id}">
            ${isLiked ? '❤️' : '♡'}
          </span>
          <span>${isLiked ? 'Liked by Nanati' : (isAdmin ? 'Click to Like as Nanati' : '')}</span>
        </div>

        <!-- Nanati's Reply -->
        ${replyHtml}

        <!-- Admin Only Actions -->
        ${adminActionsHtml}
      </div>
    `;
  }

  function attachMessageCardListeners() {
    // 🎁 Show Gift Toggle
    document.querySelectorAll('.gift-show-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const msgId = btn.getAttribute('data-msg-id');
        const revealBox = document.getElementById(`gift-reveal-${msgId}`);
        if (revealBox) {
          const isShown = revealBox.classList.contains('show');
          if (isShown) {
            revealBox.classList.remove('show');
            btn.innerHTML = '🎁 Show';
          } else {
            revealBox.classList.add('show');
            btn.innerHTML = '🎁 Hide';
          }
        }
      });
    });

  }

  // Submit Birthday Message
  function initMessageForm() {
    const form = document.getElementById('birthdayMessageForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('messageAuthorInput');
      const contentInput = document.getElementById('messageContentInput');

      const name = nameInput.value.trim();
      const content = contentInput.value.trim();

      if (!name || !content) {
        alert('Please provide both your name and your birthday wish!');
        return;
      }

      // The server finds this guest's gift from their game session
      const player = window.NanatiGame ? window.NanatiGame.getCurrentPlayer() : null;

      try {
        const res = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            content: content,
            sessionId: player ? player.sessionId : null
          })
        });

        if (res.ok) {
          contentInput.value = '';
          triggerConfetti();
          showNotification('Thank you for your beautiful birthday wish! ❤️');
          loadMessages();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to submit message');
        }
      } catch (err) {
        console.error(err);
        alert('Could not submit birthday wish. Please try again.');
      }
    });
  }

  // ---------------- PHOTO GALLERY (VIEW MORE PHOTOS) ----------------
  async function loadGallery() {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) return;

    try {
      const res = await fetch('/api/gallery');
      galleryPhotos = await res.json();

      galleryGrid.innerHTML = galleryPhotos.map((photo, idx) => `
        <div class="gallery-item" data-index="${idx}">
          <img src="${escapeHtml(photo.image_url)}" class="gallery-img" alt="Nanati Birthday Photo" loading="lazy">
          <div class="gallery-overlay">
            <div class="gallery-caption">${escapeHtml(photo.description || 'Birthday celebration ✨')}</div>
          </div>
        </div>
      `).join('');

      // Click to open lightbox
      document.querySelectorAll('.gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.getAttribute('data-index'), 10);
          openLightbox(idx);
        });
      });
    } catch (e) {
      console.error('Gallery load error:', e);
    }
  }

  // Lightbox Viewer
  function initLightbox() {
    const modal = document.getElementById('lightboxModal');
    const closeBtn = document.getElementById('lightboxCloseBtn');
    const prevBtn = document.getElementById('lightboxPrevBtn');
    const nextBtn = document.getElementById('lightboxNextBtn');

    if (closeBtn) closeBtn.addEventListener('click', closeLightbox);

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeLightbox();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (galleryPhotos.length === 0) return;
        currentLightboxIndex = (currentLightboxIndex - 1 + galleryPhotos.length) % galleryPhotos.length;
        updateLightboxContent();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        if (galleryPhotos.length === 0) return;
        currentLightboxIndex = (currentLightboxIndex + 1) % galleryPhotos.length;
        updateLightboxContent();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (!modal || !modal.classList.contains('active')) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevBtn && prevBtn.click();
      if (e.key === 'ArrowRight') nextBtn && nextBtn.click();
    });
  }

  function openLightbox(index) {
    currentLightboxIndex = index;
    const modal = document.getElementById('lightboxModal');
    if (modal) {
      modal.classList.add('active');
      updateLightboxContent();
    }
  }

  function closeLightbox() {
    const modal = document.getElementById('lightboxModal');
    if (modal) modal.classList.remove('active');
  }

  function updateLightboxContent() {
    const photo = galleryPhotos[currentLightboxIndex];
    if (!photo) return;
    const img = document.getElementById('lightboxImg');
    const caption = document.getElementById('lightboxCaption');
    if (img) img.src = photo.image_url;
    if (caption) caption.textContent = photo.description || 'Nanati Birthday Portrait';
  }

  // Notification Toast
  function showNotification(text) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '30px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    toast.style.backgroundColor = '#542D1E';
    toast.style.color = '#FFFDF8';
    toast.style.padding = '1rem 2rem';
    toast.style.borderRadius = '9999px';
    toast.style.border = '2px solid #D6B77A';
    toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
    toast.style.fontSize = '1.05rem';
    toast.style.fontWeight = 'bold';
    toast.style.zIndex = '9999';
    toast.style.opacity = '0';
    toast.style.transition = 'all 0.4s ease';
    toast.textContent = text;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // Celebration Confetti Cannon
  function triggerConfetti() {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9998';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#D6B77A', '#F0D59A', '#542D1E', '#B8875A', '#E8D8C3', '#FFFDF8'];
    const confettiPieces = [];

    for (let i = 0; i < 90; i++) {
      confettiPieces.push({
        x: canvas.width / 2,
        y: canvas.height * 0.75,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 15 - 8,
        size: Math.random() * 8 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.35,
        opacity: 1
      });
    }

    let frame = 0;
    function animate() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      confettiPieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98;
        p.rotation += p.rotSpeed;
        p.opacity -= 0.008;

        if (p.opacity > 0) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = Math.max(0, p.opacity);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx.restore();
        }
      });

      frame++;
      if (alive && frame < 200) {
        requestAnimationFrame(animate);
      } else {
        canvas.remove();
      }
    }
    requestAnimationFrame(animate);
  }

  // Utility escape HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Expose
  window.NanatiApp = {
    loadMessages,
    loadGallery
  };
})();
