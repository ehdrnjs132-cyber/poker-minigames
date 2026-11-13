// Sword duel arena (Phaser 3, loaded on demand). The two duelists fight in a
// side view: move, jump, swing, block. Each client simulates its own fighter
// and streams it; the server validates hits and owns HP. Everyone else sees a
// small banner with both HP bars.
(() => {
  const { socket, esc } = window.HA;
  const t = (k, v) => I18N.t(k, v);
  const $ = (s) => document.querySelector(s);
  const state = () => window.currentState?.();
  const PHASER_URL = 'https://cdn.jsdelivr.net/npm/phaser@3.80.1/dist/phaser.min.js';

  let phaserLoading = null;
  function loadPhaser() {
    if (window.Phaser) return Promise.resolve();
    if (!phaserLoading) {
      phaserLoading = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = PHASER_URL;
        s.onload = res;
        s.onerror = () => { phaserLoading = null; rej(new Error('phaser')); };
        document.head.appendChild(s);
      });
    }
    return phaserLoading;
  }

  // ---------------------------------------------------------------- DOM shell
  const stage = document.createElement('div');
  stage.className = 'duel-stage';
  stage.innerHTML = `
    <div class="ds-hud">
      <div class="ds-side me"><b id="dsNameMe"></b><div class="ds-bar"><i id="dsHpMe"></i></div></div>
      <div class="ds-timer" id="dsTimer">45</div>
      <div class="ds-side opp"><b id="dsNameOpp"></b><div class="ds-bar"><i id="dsHpOpp"></i></div></div>
    </div>
    <div class="ds-canvas" id="duelCanvas"></div>
    <div class="ds-msg" id="dsMsg"></div>
    <div class="ds-help" id="dsHelp"></div>
    <div class="ds-pad">
      <div class="ds-move"><button data-k="left">◀</button><button data-k="right">▶</button></div>
      <div class="ds-acts"><button data-k="block">🛡️</button><button data-k="jump">⤒</button><button data-k="attack" class="atk">⚔️</button></div>
    </div>`;
  document.body.appendChild(stage);

  const banner = document.createElement('div');
  banner.className = 'duel-banner';
  document.body.appendChild(banner);

  // touch pad -> input flags
  const pad = { left: false, right: false, jump: false, block: false, attack: false };
  stage.querySelectorAll('.ds-pad [data-k]').forEach((b) => {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); pad[k] = true; b.classList.add('on'); };
    const off = () => { pad[k] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });

  let game = null;
  let scene = null;
  let cfg = null;
  let offset = 0;
  const now = () => Date.now() + offset;

  function hpPct(v) { return `${Math.max(0, v) / (cfg?.hp || 100) * 100}%`; }

  // ---------------------------------------------------------------- avatar textures
  function avatarCanvas(p, size = 96) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const paint = (img) => {
      g.clearRect(0, 0, size, size);
      g.save();
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      g.closePath();
      g.fillStyle = HA.colorFor(p.id);
      g.fill();
      g.clip();
      if (img) g.drawImage(img, 0, 0, size, size);
      else {
        g.fillStyle = '#fff';
        g.font = `900 ${size * 0.45}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(p.bot ? '🤖' : (p.name || '?')[0], size / 2, size / 2 + 2);
      }
      g.restore();
      g.lineWidth = 5;
      g.strokeStyle = '#fff';
      g.beginPath();
      g.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
      g.stroke();
    };
    paint(null);
    let src = null;
    if (p.avatar === 'img' && p.uid) src = `/avatar/${p.uid}?v=${p.avatarV || 0}`;
    else if (p.avatar && /^p\d+$/.test(p.avatar)) {
      let svg = Stickers.avatar(p.avatar);
      if (!/width=/.test(svg)) svg = svg.replace('<svg', `<svg width="${size}" height="${size}"`);
      if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    }
    const ready = new Promise((res) => {
      if (!src) return res();
      const img = new Image();
      img.onload = () => { paint(img); res(); };
      img.onerror = () => res();
      img.src = src;
    });
    return { canvas: c, ready };
  }

  // ---------------------------------------------------------------- the scene
  function makeScene(P) {
    return class DuelScene extends P.Scene {
      constructor() { super('duel'); }

      create() {
        scene = this;
        const W = 960, H = 540, G = cfg.arena.ground;
        this.G = G;
        // sky + moon + hills + castle + ground
        const sky = this.add.graphics();
        sky.fillGradientStyle(0x2a1660, 0x2a1660, 0x0b1a48, 0x0b1a48, 1);
        sky.fillRect(0, 0, W, H);
        const stars = this.add.graphics();
        for (let i = 0; i < 70; i++) { stars.fillStyle(0xffffff, Math.random() * 0.7 + 0.2); stars.fillCircle(Math.random() * W, Math.random() * 300, Math.random() * 1.8 + 0.4); }
        this.add.circle(790, 110, 52, 0xfff2c4).setAlpha(0.95);
        this.add.circle(770, 96, 52, 0x2a1660).setAlpha(0.18);
        const hills = this.add.graphics();
        hills.fillStyle(0x1d1450, 1);
        hills.fillTriangle(-50, G, 180, 250, 420, G); hills.fillTriangle(260, G, 520, 210, 780, G); hills.fillTriangle(600, G, 860, 270, 1100, G);
        const castle = this.add.graphics();
        castle.fillStyle(0x130d38, 1);
        castle.fillRect(380, 300, 200, 170); castle.fillRect(360, 250, 50, 220); castle.fillRect(550, 250, 50, 220);
        for (let i = 0; i < 5; i++) castle.fillRect(380 + i * 44, 286, 24, 16);
        castle.fillStyle(0xffd34d, 0.8); castle.fillRect(470, 360, 20, 30); castle.fillRect(372, 280, 10, 14); castle.fillRect(570, 280, 10, 14);
        const ground = this.add.graphics();
        ground.fillStyle(0x3b2a1a, 1); ground.fillRect(0, G, W, H - G);
        ground.fillStyle(0x2fa363, 1); ground.fillRect(0, G - 4, W, 10);
        ground.fillStyle(0x4a3522, 1);
        for (let x = 0; x < W; x += 48) ground.fillRect(x + 8, G + 22, 28, 6);
        // torches
        for (const x of [70, 890]) {
          this.add.rectangle(x, G - 40, 8, 80, 0x6b450c);
          const f = this.add.circle(x, G - 86, 13, 0xff9a1a);
          const f2 = this.add.circle(x, G - 90, 7, 0xffe28a);
          this.tweens.add({ targets: [f, f2], scale: { from: 0.85, to: 1.15 }, alpha: { from: 0.75, to: 1 }, yoyo: true, repeat: -1, duration: 180 + Math.random() * 120 });
        }
        // spark texture for hit particles
        const sg = this.make.graphics({ x: 0, y: 0, add: false });
        sg.fillStyle(0xffffff, 1); sg.fillCircle(5, 5, 5);
        sg.generateTexture('spark', 10, 10);
        sg.destroy();
        this.sparks = this.add.particles(0, 0, 'spark', {
          speed: { min: 120, max: 380 }, angle: { min: 0, max: 360 }, scale: { start: 0.9, end: 0 },
          lifespan: 420, tint: [0xffffff, 0xffd34d, 0xff7a1a], emitting: false,
        });
        this.sparks.setDepth(20);

        const S = state();
        const meId = S.me;
        const oppId = cfg.a === meId ? cfg.b : cfg.a;
        this.meId = meId;
        this.oppId = oppId;
        const pOf = (id) => S.players.find((p) => p.id === id) || { id, name: cfg.names[id] };
        this.me = this.makeFighter(pOf(meId), cfg.a === meId ? 220 : 740, 0xffd34d);
        this.opp = this.makeFighter(pOf(oppId), cfg.a === meId ? 740 : 220, 0xff5a6a);
        this.opp.target = { x: this.opp.x, y: G };

        // my physics body
        this.hero = this.physics.add.image(this.me.x, G - 55, '__DEFAULT').setVisible(false);
        this.hero.body.setSize(44, 110, true);
        this.hero.setCollideWorldBounds(true);
        this.physics.world.setBounds(cfg.arena.minX, 0, cfg.arena.maxX - cfg.arena.minX, G);
        this.keys = this.input.keyboard.addKeys('LEFT,RIGHT,UP,DOWN,A,D,W,S,J,K,SPACE,SHIFT');
        this.input.keyboard.addCapture('LEFT,RIGHT,UP,DOWN,SPACE');
        this.lastAtk = 0;
        this.lastSend = 0;
        this.knock = 0;
        this.actUntil = 0;
        this.countText = this.add.text(W / 2, 220, '', { fontFamily: 'Black Han Sans, sans-serif', fontSize: '96px', color: '#ffe28a', stroke: '#3a2306', strokeThickness: 10 }).setOrigin(0.5).setDepth(30);
      }

      makeFighter(p, x, glow) {
        const G = this.G;
        const c = this.add.container(x, G);
        c.setDepth(10);
        const shadow = this.add.ellipse(0, 0, 70, 14, 0x000000, 0.35);
        const legL = this.add.rectangle(-11, -14, 12, 28, 0x1a1a2e).setOrigin(0.5, 0.5);
        const legR = this.add.rectangle(11, -14, 12, 28, 0x1a1a2e).setOrigin(0.5, 0.5);
        const col = P.Display.Color.HexStringToColor(HA.colorFor(p.id)).color;
        const body = this.add.graphics();
        body.fillStyle(col, 1); body.fillRoundedRect(-24, -74, 48, 48, 14);
        body.lineStyle(3, 0x000000, 0.35); body.strokeRoundedRect(-24, -74, 48, 48, 14);
        const key = `av-${p.id}`;
        const { canvas, ready } = avatarCanvas(p);
        if (this.textures.exists(key)) this.textures.remove(key);
        const tex = this.textures.addCanvas(key, canvas);
        ready.then(() => tex.refresh());
        const head = this.add.image(0, -104, key).setDisplaySize(68, 68);
        // sword: pivot at the hand
        const sword = this.add.container(20, -50);
        const blade = this.add.rectangle(0, -44, 9, 74, 0xdfe6f2).setStrokeStyle(2, 0x8a95ad);
        const shine = this.add.rectangle(-2, -46, 2, 64, 0xffffff, 0.8);
        const tip = this.add.triangle(0, -88, -4.5, 8, 4.5, 8, 0, -6, 0xdfe6f2);
        const guard = this.add.rectangle(0, -6, 28, 7, 0xf5c451).setStrokeStyle(2, 0x6b450c);
        const hilt = this.add.rectangle(0, 6, 7, 16, 0x7a4a1a);
        sword.add([blade, shine, tip, guard, hilt]);
        sword.angle = 35;
        const ring = this.add.ellipse(0, 0, 80, 18).setStrokeStyle(3, glow, 0.9);
        const name = this.add.text(0, -150, p.name || '', { fontFamily: 'Noto Sans KR, sans-serif', fontSize: '18px', fontStyle: '900', color: '#ffffff', stroke: '#000000', strokeThickness: 4 }).setOrigin(0.5);
        c.add([ring, shadow, legL, legR, body, head, sword, name]);
        Object.assign(c, { sword, head, body, legL, legR, nameText: name, face: 1, act: 'idle', pid: p.id });
        return c;
      }

      swingAnim(f) {
        if (f.swinging) return;
        f.swinging = true;
        this.tweens.killTweensOf(f.sword);
        f.sword.angle = -120;
        this.tweens.add({ targets: f.sword, angle: 95, duration: 140, ease: 'Cubic.easeOut', onComplete: () => {
          this.tweens.add({ targets: f.sword, angle: 35, duration: 180, ease: 'Sine.easeInOut', onComplete: () => { f.swinging = false; } });
        } });
        // slash arc
        const arc = this.add.graphics().setDepth(15);
        arc.lineStyle(6, 0xffffff, 0.75);
        arc.beginPath();
        arc.arc(f.x + 22 * f.face, f.y - 60, 70, f.face > 0 ? -1.9 : Math.PI + 1.9, f.face > 0 ? 0.9 : Math.PI - 0.9, f.face < 0);
        arc.strokePath();
        this.tweens.add({ targets: arc, alpha: 0, duration: 220, onComplete: () => arc.destroy() });
      }

      poseFighter(f, act, face, dtFactor) {
        f.face = face;
        f.scaleX = face;
        f.nameText.scaleX = face; // keep the name readable
        if (act === 'block' && !f.swinging) f.sword.angle = -8;
        else if (!f.swinging && f.sword.angle === -8) f.sword.angle = 35;
        const walking = act === 'run';
        const tt = this.time.now / 90;
        f.legL.y = -14 + (walking ? Math.sin(tt) * 4 : 0);
        f.legR.y = -14 + (walking ? -Math.sin(tt) * 4 : 0);
        f.head.y = -104 + (walking ? Math.abs(Math.sin(tt)) * -3 : 0);
        if (dtFactor) {} // reserved
      }

      flash(f) {
        f.head.setTint(0xff5a6a);
        this.time.delayedCall(140, () => f.head.clearTint());
      }

      floatText(x, y, text, color) {
        const tx = this.add.text(x, y, text, { fontFamily: 'Black Han Sans, sans-serif', fontSize: '34px', color, stroke: '#000000', strokeThickness: 6 }).setOrigin(0.5).setDepth(25);
        this.tweens.add({ targets: tx, y: y - 60, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => tx.destroy() });
      }

      onHp(m) {
        const victim = m.to === this.meId ? this.me : this.opp;
        this.sparks.explode(m.blocked ? 8 : 18, victim.x - 14 * m.dir, victim.y - 70);
        this.flash(victim);
        this.floatText(victim.x, victim.y - 150, m.blocked ? t('duel.blocked') : `-${m.dmg}${m.crit ? '!' : ''}`, m.blocked ? '#9fd8ff' : m.crit ? '#ffd34d' : '#ff6b7a');
        if (m.to === this.meId) {
          this.cameras.main.shake(m.blocked ? 90 : 180, m.blocked ? 0.004 : 0.012);
          if (!m.blocked) { this.knock = 420 * m.dir; this.actUntil = this.time.now + 160; this.myAct = 'hurt'; }
        }
        window.SFX && (m.blocked ? SFX.chips() : SFX.lose());
      }

      peer(st) {
        this.opp.target = { x: st.x, y: st.y };
        if (st.act === 'attack' && this.opp.act !== 'attack') { this.swingAnim(this.opp); window.SFX && SFX.swoosh(); }
        this.opp.act = st.act;
        this.opp.faceT = st.face;
      }

      update(time, delta) {
        const dt = delta / 1000;
        const k = this.keys;
        const fight = now() >= cfg.startAt && !this.over;
        // countdown text
        const left = Math.ceil((cfg.startAt - now()) / 1000);
        if (!this.over) this.countText.setText(left > 0 ? String(left) : (now() - cfg.startAt < 700 ? 'FIGHT!' : ''));
        const tl = Math.max(0, Math.ceil((cfg.endsAt - now()) / 1000));
        $('#dsTimer').textContent = tl;

        const b = this.hero;
        const onGround = b.body.blocked.down || b.y >= this.G - 56;
        const left_ = k.LEFT.isDown || k.A.isDown || pad.left;
        const right_ = k.RIGHT.isDown || k.D.isDown || pad.right;
        const block = fight && (k.DOWN.isDown || k.S.isDown || k.SHIFT.isDown || pad.block);
        const jump = k.UP.isDown || k.W.isDown || k.K.isDown || pad.jump;
        const attack = P.Input.Keyboard.JustDown(k.SPACE) || P.Input.Keyboard.JustDown(k.J) || (pad.attack && !this.padAtk);
        this.padAtk = pad.attack;

        let vx = 0;
        if (fight) {
          vx = ((right_ ? 1 : 0) - (left_ ? 1 : 0)) * (block ? 120 : 300);
          if (jump && onGround) b.setVelocityY(-660);
        }
        if (Math.abs(this.knock) > 10) { vx = this.knock; this.knock *= 0.85; } else this.knock = 0;
        b.setVelocityX(vx);
        b.setGravityY(0);

        // face the opponent
        const face = this.opp.x >= this.me.x ? 1 : -1;
        let act = !onGround ? 'jump' : Math.abs(vx) > 5 ? 'run' : 'idle';
        if (block) act = 'block';
        if (time < this.actUntil) act = this.myAct;
        if (fight && attack && time - this.lastAtk > 380 && !block) {
          this.lastAtk = time;
          this.myAct = 'attack';
          this.actUntil = time + 220;
          act = 'attack';
          this.swingAnim(this.me);
          window.SFX && SFX.swoosh();
          // judge the hit mid-swing
          this.time.delayedCall(90, () => {
            const dx = this.opp.x - this.me.x, dy = this.opp.y - this.me.y;
            if (Math.abs(dx) < 100 && Math.abs(dy) < 78 && (Math.sign(dx) === this.me.face || Math.abs(dx) < 25)) socket.emit('duel:hit');
          });
        }
        this.me.x = b.x;
        this.me.y = b.y + 55;
        this.poseFighter(this.me, act, face);

        // opponent: glide to the reported spot
        const o = this.opp;
        o.x += (o.target.x - o.x) * Math.min(1, dt * 14);
        o.y += (o.target.y - o.y) * Math.min(1, dt * 14);
        this.poseFighter(o, o.act, o.faceT || (this.me.x >= o.x ? 1 : -1));

        if (time - this.lastSend > 50) {
          this.lastSend = time;
          socket.emit('duel:state', { x: Math.round(this.me.x), y: Math.round(this.me.y), face, act });
        }
      }
    };
  }

  // ---------------------------------------------------------------- lifecycle
  function startArena() {
    const S = state();
    const meId = S.me;
    const oppId = cfg.a === meId ? cfg.b : cfg.a;
    $('#dsNameMe').textContent = cfg.names[meId];
    $('#dsNameOpp').textContent = cfg.names[oppId];
    $('#dsHpMe').style.width = $('#dsHpOpp').style.width = '100%';
    $('#dsMsg').className = 'ds-msg';
    $('#dsMsg').innerHTML = '';
    $('#dsHelp').textContent = matchMedia('(pointer: coarse)').matches ? t('duel.helpTouch') : t('duel.helpKeys');
    stage.classList.add('show');
    document.body.classList.add('dueling');
    loadPhaser().then(() => {
      if (!cfg) return;
      game = new Phaser.Game({
        type: Phaser.AUTO, parent: 'duelCanvas', width: 960, height: 540, backgroundColor: '#140c34',
        physics: { default: 'arcade', arcade: { gravity: { y: 1600 }, debug: false } },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene: makeScene(Phaser),
      });
    }).catch(() => window.HA.toast(t('duel.engineFail'), 4000));
  }

  function showBanner() {
    banner.innerHTML = `<b>⚔️ ${esc(cfg.names[cfg.a])}</b><div class="db-bars"><div class="ds-bar"><i id="dbA"></i></div><span>VS</span><div class="ds-bar"><i id="dbB"></i></div></div><b>${esc(cfg.names[cfg.b])}</b><small>${t('duel.paused')}</small>`;
    banner.classList.add('show');
  }

  socket.on('duel:start', (c) => {
    cfg = c;
    offset = c.now - Date.now();
    const S = state();
    showBanner();
    if (S && (S.me === c.a || S.me === c.b) && !S.spectator) startArena();
    window.SFX && SFX.spotlight();
  });

  socket.on('duel:peer', (st) => scene?.peer(st));

  socket.on('duel:hp', (m) => {
    if (!cfg) return;
    const S = state();
    const meId = S?.me;
    if (stage.classList.contains('show')) {
      const oppId = cfg.a === meId ? cfg.b : cfg.a;
      $('#dsHpMe').style.width = hpPct(m.hp[meId]);
      $('#dsHpOpp').style.width = hpPct(m.hp[oppId]);
      scene?.onHp(m);
    }
    const a = $('#dbA'), b = $('#dbB');
    if (a) a.style.width = hpPct(m.hp[cfg.a]);
    if (b) b.style.width = hpPct(m.hp[cfg.b]);
  });

  socket.on('duel:end', (res) => {
    const S = state();
    const meId = S?.me;
    const mine = cfg && (cfg.a === meId || cfg.b === meId);
    const msg = $('#dsMsg');
    if (mine && stage.classList.contains('show')) {
      if (scene) scene.over = true;
      const won = res.winner === meId;
      msg.className = `ds-msg show ${won ? 'win' : res.winner ? 'lose' : 'draw'}`;
      msg.innerHTML = won ? `<b>${t('duel.win')}</b><span>${t('duel.coupon')}</span>` : res.winner ? `<b>${t('duel.lose')}</b>` : `<b>${t('duel.draw')}</b>`;
      window.SFX && (won ? SFX.fanfare() : SFX.lose());
    }
    banner.innerHTML = res.winner ? `<b>🏆 ${esc(cfg?.names[res.winner] || '')}</b><small>${t('duel.bannerWin')}</small>` : `<b>${t('duel.draw')}</b>`;
    setTimeout(() => {
      stage.classList.remove('show');
      banner.classList.remove('show');
      document.body.classList.remove('dueling');
      if (game) { game.destroy(true); game = null; }
      scene = null;
      cfg = null;
    }, 2500);
  });

  // Left the room mid-duel: tear everything down.
  setInterval(() => {
    if (!cfg) return;
    if (!document.getElementById('room').classList.contains('active')) {
      stage.classList.remove('show');
      banner.classList.remove('show');
      document.body.classList.remove('dueling');
      if (game) { game.destroy(true); game = null; }
      scene = null;
      cfg = null;
    }
  }, 1000);
})();
