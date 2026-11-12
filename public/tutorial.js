// Optional step-by-step "how to play" (Korean / English), with small animated demos.
const Tutorial = (() => {
  const $ = (s) => document.querySelector(s);
  const el = $('#tutorial');
  const stage = $('#tutStage');
  let step = 0;
  let timers = [];

  // One consistent example: picking K♥ + 9♣ with this board makes a full house.
  const GRID = ['7d', 'Kh', '2s', 'Qc', '5h', 'Js', '9c', '3d'];
  const BOARD = ['Ks', '9h', '4d', 'Kd', '2c'];
  const PICKS = [1, 6];
  const BEST = ['Kh', '9c', 'Ks', 'Kd', '9h'];

  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const card = (code, opts) => window.cardHTML(code, '', opts);
  const gridHTML = (down, extra = () => '') =>
    `<div class="tut-grid">${GRID.map((c, i) => card(c, { down, cls: extra(i) })).join('')}</div>`;
  const boardHTML = (cls = () => '') => `<div class="tut-board">${BOARD.map((c, i) => card(c, { cls: cls(c, i) })).join('')}</div>`;
  const stageCards = (sel) => [...stage.querySelectorAll(sel)];
  const L = (v) => (typeof v === 'string' ? v : v[I18N.lang] || v.ko);
  const RANKS = [
    ['로열 플러시', 'A♠ K♠ Q♠ J♠ 10♠', '같은 무늬 A부터 10까지'],
    ['스트레이트 플러시', '9♥ 8♥ 7♥ 6♥ 5♥', '같은 무늬 연속 5장'],
    ['포카드', 'Q Q Q Q', '같은 숫자 4장'],
    ['풀하우스', 'K K K 9 9', '트리플 + 원페어'],
    ['플러시', '♦ ♦ ♦ ♦ ♦', '같은 무늬 5장'],
    ['스트레이트', '8 7 6 5 4', '연속된 숫자 5장'],
    ['트리플', '7 7 7', '같은 숫자 3장'],
    ['투페어', 'J J 4 4', '페어 2개'],
    ['원페어', 'A A', '같은 숫자 2장'],
    ['하이카드', 'A', '가장 높은 카드'],
  ];
  const RANKS_EN = [
    ['Royal flush', 'A♠ K♠ Q♠ J♠ 10♠', 'A to 10, same suit'],
    ['Straight flush', '9♥ 8♥ 7♥ 6♥ 5♥', '5 in a row, same suit'],
    ['Four of a kind', 'Q Q Q Q', '4 of the same rank'],
    ['Full house', 'K K K 9 9', 'Three of a kind + a pair'],
    ['Flush', '♦ ♦ ♦ ♦ ♦', '5 of the same suit'],
    ['Straight', '8 7 6 5 4', '5 ranks in a row'],
    ['Three of a kind', '7 7 7', '3 of the same rank'],
    ['Two pair', 'J J 4 4', 'Two different pairs'],
    ['One pair', 'A A', '2 of the same rank'],
    ['High card', 'A', 'Highest single card'],
  ];

  const STEPS = [
    {
      title: { ko: "카드 위치를 외우세요", en: "Memorize the card positions" },
      text: { ko: "테이블에 카드 16장이 앞면으로 공개됩니다. 제한 시간(방 설정, 기본 30초) 동안 <b>어떤 카드가 어느 자리에 있는지</b> 외우세요. 둘 다 \"다 외웠어요\"를 누르면 바로 넘어갑니다.", en: "All 16 cards are dealt face up. During the time limit (set per room, 30s by default), remember <b>which card sits in which spot</b>. If both players press \"I've got it\", the game moves on right away." },
      html: () => `<div class="tut-felt"><span class="tut-timer">30</span>${gridHTML(false)}</div>`,
      play() {
        let n = 30;
        const t = stage.querySelector('.tut-timer');
        const tick = () => { if (n > 25) { n--; t.textContent = n; later(700, tick); } };
        later(700, tick);
      },
    },
    {
      title: { ko: "카드가 뒤집힙니다", en: "The cards flip over" },
      text: { ko: "시간이 끝나면 모든 카드가 <b>뒷면</b>으로 뒤집힙니다. 이제부터는 기억만이 무기예요!", en: "When time runs out, every card flips <b>face down</b>. From here on, memory is your only weapon!" },
      html: () => `<div class="tut-felt">${gridHTML(false)}</div>`,
      play() {
        stageCards('.tut-grid .card').forEach((c, i) => {
          c.style.setProperty('--d', `${i * 70}ms`);
          later(700, () => c.classList.add('down'));
        });
        later(700, () => window.SFX && SFX.flipWave(8, 0.07));
      },
    },
    {
      only: 'shuffle',
      title: { ko: "카드가 섞여요! (셔플 메모리)", en: "The cards shuffle! (Shuffle Memory)" },
      text: { ko: "뒤집힌 카드들이 <b>두 장씩 자리를 바꾸며</b> 섞입니다. 노란 테두리 카드(K♥)처럼 <b>좋은 카드가 어디로 가는지 눈으로 따라가세요.</b> 섞는 횟수와 속도는 방을 만들 때 정할 수 있어요.", en: "The face-down cards <b>swap places two at a time</b>. Like the card with the yellow border (K♥), <b>keep your eyes on where the good cards go.</b> You choose how many shuffles and how fast when you create the room." },
      html: () => `<div class="tut-felt">${gridHTML(true, (i) => (i === 1 ? 'track' : ''))}</div>`,
      play() {
        const grid = stage.querySelector('.tut-grid');
        const swaps = [[1, 6], [3, 4], [6, 2], [0, 5]];
        let k = 0;
        const step = () => {
          if (k >= swaps.length) return;
          const [a, b] = swaps[k++];
          const cards = [...grid.children];
          const A = cards[a], B = cards[b];
          const ra = A.getBoundingClientRect(), rb = B.getBoundingClientRect();
          const dx = rb.left - ra.left, dy = rb.top - ra.top;
          for (const [el, x, y] of [[A, dx, dy], [B, -dx, -dy]]) {
            el.style.transition = 'transform .55s cubic-bezier(.55,0,.25,1)';
            el.style.transform = `translate(${x}px, ${y}px)`;
            el.style.zIndex = '2';
          }
          window.SFX && SFX.swoosh();
          later(560, () => {
            for (const el of [A, B]) { el.style.transition = 'none'; el.style.transform = ''; el.style.zIndex = ''; }
            const tmp = document.createElement('div');
            grid.insertBefore(tmp, A); grid.insertBefore(A, B); grid.insertBefore(B, tmp); tmp.remove();
            later(260, step);
          });
        };
        later(700, step);
      },
    },
    {
      title: { ko: "공유 카드 5장", en: "5 community cards" },
      text: { ko: "두 사람이 <b>함께 쓰는 공유 카드 5장</b>이 깔립니다. 이 5장과 잘 어울릴 카드가 어디 있었는지 떠올려 보세요.", en: "<b>5 community cards</b> shared by both players are dealt. Think back to where the cards that go well with them were." },
      html: () => `<div class="tut-felt">${boardHTML(() => 'deal-in')}${gridHTML(true)}</div>`,
      play() {
        stageCards('.tut-board .card').forEach((c, i) => c.style.setProperty('--dd', `${i * 130}ms`));
        window.SFX && SFX.deal();
      },
    },
    {
      title: { ko: "위치를 보고 2장 선택", en: "Pick 2 cards by position" },
      text: { ko: "뒤집힌 카드 중 <b>2장을 눌러 고르고 \"선택 확정\"</b>을 누르세요. 상대가 뭘 골랐는지는 쇼다운 전까지 보이지 않아요. 상대와 <b>같은 카드를 골라도 괜찮고</b>, 시간 안에 못 고르면 랜덤으로 정해집니다.", en: "Tap <b>2 face-down cards, then press \"Lock in\"</b>. You can't see your opponent's picks until the showdown. <b>Picking the same card as your opponent is fine</b>, and if time runs out your picks are random." },
      html: () => `<div class="tut-felt">${boardHTML()}${gridHTML(true)}<div class="tut-pointer"></div></div>`,
      play() {
        const cards = stageCards('.tut-grid .card');
        const ptr = stage.querySelector('.tut-pointer');
        PICKS.forEach((idx, k) => {
          later(600 + k * 1000, () => {
            const r = cards[idx].getBoundingClientRect();
            const s = stage.getBoundingClientRect();
            ptr.style.transform = `translate(${r.left - s.left + r.width / 2}px, ${r.top - s.top + r.height * 0.6}px)`;
            ptr.classList.add('show');
          });
          later(1000 + k * 1000, () => {
            cards[idx].classList.add('mine');
            window.SFX && SFX.select();
          });
        });
        later(2600, () => ptr.classList.remove('show'));
      },
    },
    {
      title: { ko: "쇼다운!", en: "Showdown!" },
      text: { ko: "고른 카드가 공개됩니다. <b>내 2장 + 공유 5장 = 7장 중 가장 좋은 5장</b>으로 승부해요. 이 예시는 K♥·9♣를 골라 <b>K 풀하우스</b>! 이긴 사람이 팟(앤티 합계)을 가져가고, 족보가 같으면 나눠 가집니다.", en: "The picked cards are revealed. You play the <b>best 5 of 7: your 2 + the 5 community cards</b>. In this example, picking K♥ and 9♣ makes <b>Kings full of 9s</b>! The winner takes the pot (both antes); ties split it." },
      html: () => `<div class="tut-felt">
          ${boardHTML((c) => (BEST.includes(c) ? 'hl' : 'dim'))}
          <div class="tut-hand">${PICKS.map((i) => card(GRID[i], { down: true, cls: 'mine' })).join('')}</div>
          <div class="tut-badge">${L({ ko: 'K 풀하우스', en: 'Kings full!' })}</div>
        </div>`,
      play() {
        stageCards('.tut-hand .card').forEach((c, i) => {
          c.style.setProperty('--d', `${i * 200}ms`);
          later(500, () => c.classList.remove('down'));
        });
        later(500, () => window.SFX && (SFX.flip(0), SFX.flip(0.2)));
        later(1300, () => {
          stageCards('.tut-hand .card').forEach((c) => c.classList.add('hl'));
          stage.querySelector('.tut-badge').classList.add('show');
          window.SFX && SFX.win();
        });
      },
    },
    {
      title: { ko: "칩과 라운드", en: "Chips and rounds" },
      text: { ko: "시작 칩은 <b>1,000</b>. 라운드마다 <b>앤티(참가비)</b>를 내고 시작하며, 앤티는 50 → 300까지 점점 올라갑니다. <b>10라운드</b>가 끝났을 때 칩이 많은 쪽이 이기고, 한쪽 칩이 0이 되면 바로 게임이 끝나요.", en: "You start with <b>1,000</b> chips. Each round begins with an <b>ante</b> (entry fee) that rises from 50 to 300. After <b>10 rounds</b>, the player with more chips wins. If anyone hits 0 chips, the game ends immediately." },
      html: () => `<div class="tut-felt tut-chips">
          <div class="tut-seat"><span>${t('me')}</span><b data-n="1000">1,000</b></div>
          <div class="tut-pot"><span class="chip-icon"></span><b>0</b></div>
          <div class="tut-seat opp"><span>${L({ ko: '상대', en: 'Opponent' })}</span><b data-n="1000">1,000</b></div>
        </div>
        <div class="tut-antes">${[50, 50, 100, 100, 150, 150, 200, 200, 300, 300].map((a, i) => `<span><em>R${i + 1}</em>${a}</span>`).join('')}</div>`,
      play() {
        const seats = stageCards('.tut-seat b');
        const pot = stage.querySelector('.tut-pot b');
        later(700, () => {
          seats.forEach((s) => (s.textContent = '950'));
          pot.textContent = '100';
          window.SFX && SFX.chips();
        });
        later(1700, () => {
          seats[0].innerHTML = '1,050 <i>+50</i>';
          pot.textContent = '0';
          window.SFX && SFX.chips();
        });
      },
    },
    {
      title: { ko: "족보 순위", en: "Hand rankings" },
      text: { ko: "위에 있을수록 강한 족보예요. 같은 족보면 더 높은 숫자가 이깁니다. (A가 가장 높고, A-2-3-4-5 스트레이트도 인정)", en: "Higher on the list beats lower. With the same hand, higher cards win. (Ace is highest, and A-2-3-4-5 counts as a straight.)" },
      html: () => `<div class="tut-ranks">${(I18N.lang === 'en' ? RANKS_EN : RANKS).map(([n, ex, d], i) =>
        `<div><em>${i + 1}</em><b>${n}</b><span class="ex">${ex}</span><span class="ds">${d}</span></div>`).join('')}</div>`,
      play() {},
    },
  ];

  let steps = STEPS;

  function render() {
    timers.forEach(clearTimeout);
    timers = [];
    const s = steps[step];
    $('#tutStep').textContent = `${step + 1} / ${steps.length}`;
    $('#tutTitle').textContent = L(s.title);
    $('#tutText').innerHTML = L(s.text);
    stage.innerHTML = s.html();
    $('#tutDots').innerHTML = steps.map((_, i) => `<button class="${i === step ? 'on' : ''}" data-i="${i}" aria-label="${I18N.lang === 'en' ? `Step ${i + 1}` : `${i + 1}단계`}"></button>`).join('');
    $('#tutPrev').disabled = step === 0;
    $('#tutNext').textContent = step === steps.length - 1 ? t('gotit') : t('next');
    void stage.offsetWidth;
    s.play();
  }

  function go(i) {
    step = Math.max(0, Math.min(steps.length - 1, i));
    render();
  }

  function open(gameId = 'memory', at = 0) {
    steps = STEPS.filter((s) => !s.only || s.only === gameId);
    el.classList.add('show');
    go(at);
  }

  function close() {
    timers.forEach(clearTimeout);
    timers = [];
    el.classList.remove('show');
  }

  $('#tutPrev').addEventListener('click', () => go(step - 1));
  $('#tutNext').addEventListener('click', () => (step === steps.length - 1 ? close() : go(step + 1)));
  $('#tutClose').addEventListener('click', close);
  $('#tutDots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) go(Number(b.dataset.i));
  });
  el.addEventListener('click', (e) => e.target === el && close());
  document.addEventListener('keydown', (e) => {
    if (!el.classList.contains('show')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(step + 1);
    else if (e.key === 'ArrowLeft') go(step - 1);
  });
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tutorial]');
    if (btn) {
      window.SFX && SFX.click();
      open(btn.dataset.tutorial || window.currentGameId || 'memory');
    }
  });

  I18N.onChange(() => el.classList.contains('show') && render());

  return { open, close };
})();

window.Tutorial = Tutorial;
