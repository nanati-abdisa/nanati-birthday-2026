/* ==========================================================
   THE WISHING BALLOON GAME 🎈🏹
   Interactive Canvas Physics, Arrow Mechanics, Audio & Reveal
   ========================================================== */

(function () {
  let canvas, ctx;
  let animationFrameId = null;
  let isMuted = false;
  let audioCtx = null;

  // Game state
  let currentPlayer = {
    id: null,
    name: '',
    sessionId: localStorage.getItem('nanati_session_id') || ('sess_' + Date.now() + '_' + Math.random().toString(36).substring(2))
  };
  localStorage.setItem('nanati_session_id', currentPlayer.sessionId);

  let revealedGift = null;
  let isGameOver = false;

  // Arrow & Bow state
  const bow = {
    x: 60,
    y: 260,
    angle: 0,
    isAiming: false,
    power: 16
  };

  const arrows = [];
  const balloons = [];
  const particles = [];

  // Luxury Color Palette for Balloons
  const BALLOON_PALETTE = [
    { main: '#542D1E', highlight: '#844B35', border: '#3B2118', text: '#F8F1E7' }, // Chocolate Brown
    { main: '#D6B77A', highlight: '#F5E4B8', border: '#B8875A', text: '#3B2118' }, // Champagne Gold
    { main: '#B8875A', highlight: '#D8AB80', border: '#7A5B4C', text: '#FFFDF8' }, // Soft Caramel
    { main: '#E8D8C3', highlight: '#FFFDF8', border: '#D6B77A', text: '#542D1E' }, // Warm Beige
    { main: '#F8F1E7', highlight: '#FFFFFF', border: '#E8D8C3', text: '#3B2118' }  // Soft Cream
  ];

  // Web Audio Synth for Pop Sound
  function playPopSound() {
    if (isMuted) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();

      // White noise buffer for crisp pop
      const bufferSize = audioCtx.sampleRate * 0.08;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, audioCtx.currentTime);
      filter.Q.setValueAtTime(3, audioCtx.currentTime);

      gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.07);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      whiteNoise.start();
      whiteNoise.stop(audioCtx.currentTime + 0.08);

      // Low thump
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.06);

      const oscGain = audioCtx.createGain();
      oscGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
      oscGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.06);

      osc.connect(oscGain);
      oscGain.connect(audioCtx.destination);

      osc.start();
      osc.stop(audioCtx.currentTime + 0.07);
    } catch (e) {
      console.warn('Audio not available:', e);
    }
  }

  function playCelebrationFanfare() {
    if (isMuted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      notes.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const startTime = audioCtx.currentTime + (idx * 0.12);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.45);
      });
    } catch (e) {}
  }

  // Balloon Class
  class Balloon {
    constructor(x, y, radius, colorTheme, speedY, swaySpeed, swayWidth) {
      this.x = x;
      this.y = y;
      this.baseX = x;
      this.radius = radius;
      this.color = colorTheme;
      this.speedY = speedY;
      this.swaySpeed = swaySpeed;
      this.swayWidth = swayWidth;
      this.swayAngle = Math.random() * Math.PI * 2;
      this.isPopped = false;
      this.scale = 1;
      this.opacity = 1;
    }

    update() {
      if (this.isPopped) {
        this.scale += 0.08;
        this.opacity -= 0.1;
        return;
      }
      this.y -= this.speedY;
      this.swayAngle += this.swaySpeed;
      this.x = this.baseX + Math.sin(this.swayAngle) * this.swayWidth;

      // Wrap around bottom if floats off top
      if (this.y < -this.radius * 2) {
        this.y = canvas.height + this.radius + Math.random() * 50;
        this.baseX = 120 + Math.random() * Math.max(60, canvas.width - 180);
      }
    }

    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.opacity);
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale);

      // Ribbon / String
      ctx.beginPath();
      ctx.moveTo(0, this.radius * 1.2);
      ctx.bezierCurveTo(
        Math.sin(this.swayAngle) * 10, this.radius * 1.6,
        -Math.sin(this.swayAngle) * 10, this.radius * 2.0,
        Math.sin(this.swayAngle) * 5, this.radius * 2.5
      );
      ctx.strokeStyle = '#D6B77A';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Balloon Oval shape
      ctx.beginPath();
      ctx.moveTo(0, -this.radius * 1.15);
      ctx.bezierCurveTo(
        this.radius * 1.1, -this.radius * 1.15,
        this.radius * 1.05, this.radius * 0.8,
        0, this.radius * 1.2
      );
      ctx.bezierCurveTo(
        -this.radius * 1.05, this.radius * 0.8,
        -this.radius * 1.1, -this.radius * 1.15,
        0, -this.radius * 1.15
      );
      ctx.closePath();

      // Realistic Radial Gradient & Sheen
      const grad = ctx.createRadialGradient(
        -this.radius * 0.3, -this.radius * 0.4, this.radius * 0.1,
        0, 0, this.radius * 1.2
      );
      grad.addColorStop(0, this.color.highlight);
      grad.addColorStop(0.5, this.color.main);
      grad.addColorStop(1, this.color.border);

      ctx.fillStyle = grad;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;
      ctx.fill();

      // Glossy Reflection Highlight
      ctx.shadowColor = 'transparent';
      ctx.beginPath();
      ctx.ellipse(-this.radius * 0.35, -this.radius * 0.45, this.radius * 0.22, this.radius * 0.12, Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.fill();

      // Balloon Knot
      ctx.beginPath();
      ctx.moveTo(-4, this.radius * 1.18);
      ctx.lineTo(4, this.radius * 1.18);
      ctx.lineTo(6, this.radius * 1.28);
      ctx.lineTo(-6, this.radius * 1.28);
      ctx.closePath();
      ctx.fillStyle = this.color.border;
      ctx.fill();

      ctx.restore();
    }
  }

  // Arrow Class
  class Arrow {
    constructor(x, y, angle, speed) {
      this.x = x;
      this.y = y;
      this.angle = angle;
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.length = 50;
      this.isActive = true;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      // Slight gravity
      this.vy += 0.08;
      this.angle = Math.atan2(this.vy, this.vx);

      if (this.x > canvas.width + 50 || this.y > canvas.height + 50 || this.y < -50) {
        this.isActive = false;
      }
    }

    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Arrow Shaft (Champagne Gold / Wood)
      ctx.beginPath();
      ctx.moveTo(-this.length, 0);
      ctx.lineTo(0, 0);
      ctx.strokeStyle = '#D6B77A';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Arrow Head (Metallic Diamond)
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -6);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-6, 6);
      ctx.closePath();
      ctx.fillStyle = '#FFFDF8';
      ctx.strokeStyle = '#B8875A';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();

      // Arrow Feathers (Tail)
      ctx.beginPath();
      ctx.moveTo(-this.length, 0);
      ctx.lineTo(-this.length - 8, -5);
      ctx.lineTo(-this.length + 5, 0);
      ctx.lineTo(-this.length - 8, 5);
      ctx.closePath();
      ctx.fillStyle = '#E8D8C3';
      ctx.fill();

      ctx.restore();
    }
  }

  // Particle explosion on pop
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.vx = (Math.random() - 0.5) * 12;
      this.vy = (Math.random() - 0.5) * 12;
      this.radius = Math.random() * 4 + 2;
      this.color = color;
      this.alpha = 1;
      this.gravity = 0.2;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += this.gravity;
      this.alpha -= 0.025;
    }

    draw() {
      if (this.alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.alpha);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Spawn initial balloons
  function initBalloons() {
    balloons.length = 0;
    const count = 9;
    for (let i = 0; i < count; i++) {
      const radius = 30 + Math.random() * 18;
      const x = 120 + Math.random() * Math.max(60, canvas.width - 190);
      const y = Math.random() * canvas.height;
      const palette = BALLOON_PALETTE[i % BALLOON_PALETTE.length];
      const speedY = 0.8 + Math.random() * 1.2;
      const swaySpeed = 0.02 + Math.random() * 0.02;
      const swayWidth = 15 + Math.random() * 25;
      balloons.push(new Balloon(x, y, radius, palette, speedY, swaySpeed, swayWidth));
    }
  }

  // Draw Bow
  function drawBow() {
    ctx.save();
    ctx.translate(bow.x, bow.y);
    ctx.rotate(bow.angle);

    // Bow Arc
    ctx.beginPath();
    ctx.arc(-20, 0, 50, -Math.PI / 2.5, Math.PI / 2.5);
    ctx.strokeStyle = '#B8875A';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Bow String
    ctx.beginPath();
    const topY = -Math.sin(Math.PI / 2.5) * 50;
    const botY = Math.sin(Math.PI / 2.5) * 50;
    const topX = -20 + Math.cos(Math.PI / 2.5) * 50;
    const botX = -20 + Math.cos(Math.PI / 2.5) * 50;

    ctx.moveTo(topX, topY);
    ctx.lineTo(topX - 10, 0); // nocked string
    ctx.lineTo(botX, botY);
    ctx.strokeStyle = '#FFFDF8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Arrow ready on bow
    if (!isGameOver) {
      ctx.beginPath();
      ctx.moveTo(-25, 0);
      ctx.lineTo(25, 0);
      ctx.strokeStyle = '#D6B77A';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(20, -5);
      ctx.lineTo(22, 0);
      ctx.lineTo(20, 5);
      ctx.closePath();
      ctx.fillStyle = '#FFFDF8';
      ctx.fill();
    }

    ctx.restore();
  }

  // Shoot arrow towards aimed angle
  function shootArrow() {
    if (isGameOver) return;
    const arrow = new Arrow(bow.x, bow.y, bow.angle, bow.power);
    arrows.push(arrow);
  }

  // Check collision between Arrow and Balloons
  function checkCollisions() {
    if (isGameOver) return;
    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      if (!a.isActive) continue;

      for (let j = 0; j < balloons.length; j++) {
        const b = balloons[j];
        if (b.isPopped) continue;

        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < b.radius + 10) {
          // HIT!
          b.isPopped = true;
          a.isActive = false;

          playPopSound();

          // Spawn burst particles
          for (let p = 0; p < 25; p++) {
            particles.push(new Particle(b.x, b.y, b.color.highlight));
            particles.push(new Particle(b.x, b.y, '#D6B77A'));
          }

          // Trigger Gift Reveal!
          onBalloonPopped(b);
          break;
        }
      }
    }
  }

  // Handle successful pop & gift assignment
  async function onBalloonPopped(balloon) {
    isGameOver = true;

    try {
      // Call backend to assign gift to participant
      const response = await fetch('/api/game/assign-gift', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentPlayer.sessionId })
      });

      const data = await response.json();
      if (response.ok && data.gift) {
        revealedGift = data.gift;
        if (data.participant) {
          currentPlayer.id = data.participant.id;
        }
        publishActiveParticipant();
        triggerGiftRevealModal(revealedGift);
      } else {
        failGame(data.error || 'Something went wrong. Please try again!');
      }
    } catch (err) {
      console.error('Error assigning gift:', err);
      failGame('Could not reach the server. Please check your connection and try again!');
    }
  }

  // Let the player try again if the gift could not be assigned
  function failGame(message) {
    alert(message);
    isGameOver = false;
    // Replace the popped balloon so the arena never runs empty
    const spent = balloons.filter(b => b.isPopped);
    spent.forEach(b => {
      b.isPopped = false;
      b.scale = 1;
      b.opacity = 1;
      b.y = canvas.height + b.radius;
    });
  }

  // Share the player's identity + gift with the message form
  function publishActiveParticipant() {
    window.activeParticipant = {
      id: currentPlayer.id,
      name: currentPlayer.name,
      giftId: revealedGift ? revealedGift.id : null
    };
  }

  // Reveal Modal & Giftbox Animation
  function triggerGiftRevealModal(gift) {
    const backdrop = document.getElementById('giftModalBackdrop');
    const giftBoxWrap = document.getElementById('giftboxAnim');
    const giftImg = document.getElementById('revealedGiftImg');
    const giftTitle = document.getElementById('revealedGiftTitle');
    const giftDesc = document.getElementById('revealedGiftDesc');
    const playerNameDisplay = document.getElementById('modalPlayerName');

    if (playerNameDisplay) {
      playerNameDisplay.textContent = currentPlayer.name;
    }

    if (giftImg) giftImg.src = gift.image_url;
    if (giftTitle) giftTitle.textContent = gift.name;
    if (giftDesc) giftDesc.textContent = gift.description || 'Your special birthday assignment for Nanati ❤️';

    // Show modal backdrop (reset the box so it can animate again when re-opened)
    if (giftBoxWrap) giftBoxWrap.classList.remove('opened');
    backdrop.style.display = 'flex';
    setTimeout(() => {
      backdrop.classList.add('active');
    }, 50);

    // Animate gift box opening after 400ms
    setTimeout(() => {
      if (giftBoxWrap) giftBoxWrap.classList.add('opened');
      playCelebrationFanfare();
    }, 600);
  }

  // Main Render Loop
  function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and draw balloons
    for (let i = 0; i < balloons.length; i++) {
      balloons[i].update();
      balloons[i].draw();
    }

    // Update and draw arrows
    for (let i = arrows.length - 1; i >= 0; i--) {
      arrows[i].update();
      arrows[i].draw();
      if (!arrows[i].isActive) {
        arrows.splice(i, 1);
      }
    }

    // Update and draw particles
    for (let i = particles.length - 1; i >= 0; i--) {
      particles[i].update();
      particles[i].draw();
      if (particles[i].alpha <= 0) {
        particles.splice(i, 1);
      }
    }

    // Draw Bow
    drawBow();

    // Check collisions
    checkCollisions();

    animationFrameId = requestAnimationFrame(gameLoop);
  }

  // Resize canvas to match CSS layout
  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return; // hidden - keep last good size
    canvas.width = rect.width;
    canvas.height = rect.height;
    bow.y = canvas.height / 2;
  }

  // Aiming Controls
  function handleAim(clientX, clientY) {
    if (isGameOver || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    bow.angle = Math.atan2(mouseY - bow.y, mouseX - bow.x);
  }

  // Setup Event Listeners
  function initGame() {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Aim with mouse
    canvas.addEventListener('mousemove', (e) => {
      handleAim(e.clientX, e.clientY);
    });

    // Shoot on click
    canvas.addEventListener('click', (e) => {
      handleAim(e.clientX, e.clientY);
      shootArrow();
    });

    // Touch controls for mobile
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        handleAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        handleAim(e.touches[0].clientX, e.touches[0].clientY);
      }
    });

    const mobileShootBtn = document.getElementById('mobileShootBtn');
    if (mobileShootBtn) {
      mobileShootBtn.addEventListener('click', () => {
        shootArrow();
      });
    }

    // Audio Mute Toggle
    const muteBtn = document.getElementById('audioToggleBtn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        muteBtn.innerHTML = isMuted ? '🔇 Unmute' : '🔊 Sound On';
      });
    }

    // Stage 1 -> Stage 2 ("Start the Celebration!" -> Enter Name)
    const startGameIntroBtn = document.getElementById('startGameIntroBtn');
    if (startGameIntroBtn) {
      startGameIntroBtn.addEventListener('click', () => {
        document.getElementById('gameIntroView').style.display = 'none';
        document.getElementById('gameNameView').style.display = 'block';
        const nameInput = document.getElementById('participantNameInput');
        if (nameInput) nameInput.focus();
      });
    }

    // Stage 2 -> Stage 3 (Enter Name -> Continue to Game Arena)
    const submitNameBtn = document.getElementById('submitNameBtn');
    const nameInput = document.getElementById('participantNameInput');

    async function proceedToArena() {
      const name = nameInput.value.trim();
      if (!name) {
        alert('Please enter your name to join Nanati\'s birthday celebration!');
        return;
      }

      currentPlayer.name = name;

      try {
        const res = await fetch('/api/participants/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: currentPlayer.name,
            sessionId: currentPlayer.sessionId
          })
        });
        const part = await res.json();
        if (!res.ok) {
          alert(part.error || 'Could not join the celebration. Please try again!');
          return;
        }
        currentPlayer.id = part.id;

        // Already played in this browser? Their gift is locked in - don't replay.
        if (part.gift) {
          revealedGift = part.gift;
          publishActiveParticipant();
          showReturningView();
          return;
        }
      } catch (e) {
        alert('Could not reach the server. Please check your connection and try again!');
        return;
      }

      // Update player label in arena
      const arenaPlayerName = document.getElementById('arenaPlayerName');
      if (arenaPlayerName) arenaPlayerName.textContent = currentPlayer.name;

      // Pre-fill message form with participant's name
      const msgNameInput = document.getElementById('messageAuthorInput');
      if (msgNameInput) msgNameInput.value = currentPlayer.name;

      // Hide name view, show arena
      document.getElementById('gameNameView').style.display = 'none';
      document.getElementById('gameArenaView').style.display = 'block';

      resizeCanvas();
      initBalloons();
      if (!animationFrameId) {
        gameLoop();
      }
    }

    if (submitNameBtn) submitNameBtn.addEventListener('click', proceedToArena);
    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') proceedToArena();
      });
    }

    // Returning player buttons
    const seeGiftBtn = document.getElementById('returningSeeGiftBtn');
    if (seeGiftBtn) {
      seeGiftBtn.addEventListener('click', () => {
        if (revealedGift) triggerGiftRevealModal(revealedGift);
      });
    }
    const returningWishBtn = document.getElementById('returningWishBtn');
    if (returningWishBtn) {
      returningWishBtn.addEventListener('click', () => {
        const msgSection = document.getElementById('messages-section');
        if (msgSection) msgSection.scrollIntoView({ behavior: 'smooth' });
      });
    }

    restoreSession();

    // Modal Completion Button: "Send My Birthday Wish 💌"
    const goToWishBtn = document.getElementById('goToWishBtn');
    if (goToWishBtn) {
      goToWishBtn.addEventListener('click', () => {
        const backdrop = document.getElementById('giftModalBackdrop');
        backdrop.classList.remove('active');
        backdrop.style.display = 'none';

        // Pre-fill message author name
        const authorInput = document.getElementById('messageAuthorInput');
        if (authorInput && currentPlayer.name) {
          authorInput.value = currentPlayer.name;
        }

        // Store active participant info for message submission
        publishActiveParticipant();
        showReturningView();

        // Smooth scroll to Section 3: Birthday Messages
        const msgSection = document.getElementById('messages-section');
        if (msgSection) {
          msgSection.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  }

  // ---------------- RETURNING PLAYER ----------------
  function hideAllGameViews() {
    ['gameIntroView', 'gameNameView', 'gameArenaView', 'gameReturningView'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
  }

  function showReturningView() {
    if (!revealedGift) return;
    hideAllGameViews();
    if (animationFrameId) { cancelAnimationFrame(animationFrameId); animationFrameId = null; }

    const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText('returningName', currentPlayer.name || 'Friend');
    setText('returningGiftName', revealedGift.name);
    const img = document.getElementById('returningGiftImg');
    if (img) img.src = revealedGift.image_url;

    const view = document.getElementById('gameReturningView');
    if (view) view.style.display = 'block';

    const msgNameInput = document.getElementById('messageAuthorInput');
    if (msgNameInput && currentPlayer.name && !msgNameInput.value) msgNameInput.value = currentPlayer.name;
  }

  // On page load: if this browser already played, restore name + gift
  async function restoreSession() {
    try {
      const res = await fetch('/api/participants/me?sessionId=' + encodeURIComponent(currentPlayer.sessionId));
      const data = await res.json();
      if (data.participant && data.gift) {
        currentPlayer.id = data.participant.id;
        currentPlayer.name = data.participant.name;
        revealedGift = data.gift;
        publishActiveParticipant();
        showReturningView();
      }
    } catch (e) {
      // Offline / server not ready - the normal game flow still works
    }
  }

  // Export
  window.NanatiGame = {
    init: initGame,
    getCurrentPlayer: () => currentPlayer,
    getRevealedGift: () => revealedGift
  };

  document.addEventListener('DOMContentLoaded', initGame);
})();
