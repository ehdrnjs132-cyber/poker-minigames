// Optional step-by-step "how to play" for 기억 포커, with small animated demos.
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

  const STEPS = [
    {
      title: '① 카드 위치를 외우세요',
      text: '테이블에 카드 16장이 앞면으로 공개됩니다. 제한 시간(방 설정, 기본 30초) 동안 <b>어떤 카드가 어느 자리에 있는지</b> 외우세요. 둘 다 "다 외웠어요"를 누르면 바로 넘어갑니다.',
      html: () => `<div class="tut-felt"><span class="tut-timer">30</span>${gridHTML(false)}</div>`,
      play() {
        let n = 30;
        const t = stage.querySelector('.tut-timer');
        const tick = () => { if (n > 25) { n--; t.textContent = n; later(700, tick); } };
        later(700, tick);
      },
    },
    {
      title: '② 카드가 뒤집힙니다',
      text: '시간이 끝나면 모든 카드가 <b>뒷면</b>으로 뒤집힙니다. 이제부터는 기억만이 무기예요!',
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
      title: '③ 공유 카드 5장',
      text: '두 사람이 <b>함께 쓰는 공유 카드 5장</b>이 깔립니다. 이 5장과 잘 어울릴 카드가 어디 있었는지 떠올려 보세요.',
      html: () => `<div class="tut-felt">${boardHTML(() => 'deal-in')}${gridHTML(true)}</div>`,
      play() {
        stageCards('.tut-board .card').forEach((c, i) => c.style.setProperty('--dd', `${i * 130}ms`));
        window.SFX && SFX.deal();
      },
    },
    {
      title: '④ 위치를 보고 2장 선택',
      text: '뒤집힌 카드 중 <b>2장을 눌러 고르고 "선택 확정"</b>을 누르세요. 상대가 뭘 골랐는지는 쇼다운 전까지 보이지 않아요. 상대와 <b>같은 카드를 골라도 괜찮고</b>, 시간 안에 못 고르면 랜덤으로 정해집니다.',
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
      title: '⑤ 쇼다운!',
      text: '고른 카드가 공개됩니다. <b>내 2장 + 공유 5장 = 7장 중 가장 좋은 5장</b>으로 승부해요. 이 예시는 K♥·9♣를 골라 <b>K 풀하우스</b>! 이긴 사람이 팟(앤티 합계)을 가져가고, 족보가 같으면 나눠 가집니다.',
      html: () => `<div class="tut-felt">
          ${boardHTML((c) => (BEST.includes(c) ? 'hl' : 'dim'))}
          <div class="tut-hand">${PICKS.map((i) => card(GRID[i], { down: true, cls: 'mine' })).join('')}</div>
          <div class="tut-badge">K 풀하우스</div>
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
      title: '⑥ 칩과 라운드',
      text: '시작 칩은 <b>1,000</b>. 라운드마다 <b>앤티(참가비)</b>를 내고 시작하며, 앤티는 50 → 300까지 점점 올라갑니다. <b>10라운드</b>가 끝났을 때 칩이 많은 쪽이 이기고, 한쪽 칩이 0이 되면 바로 게임이 끝나요.',
      html: () => `<div class="tut-felt tut-chips">
          <div class="tut-seat"><span>나</span><b data-n="1000">1,000</b></div>
          <div class="tut-pot"><span class="chip-icon"></span><b>0</b></div>
          <div class="tut-seat opp"><span>상대</span><b data-n="1000">1,000</b></div>
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
      title: '⑦ 족보 순위',
      text: '위에 있을수록 강한 족보예요. 같은 족보면 더 높은 숫자가 이깁니다. (A가 가장 높고, A-2-3-4-5 스트레이트도 인정)',
      html: () => `<div class="tut-ranks">${RANKS.map(([n, ex, d], i) =>
        `<div><em>${i + 1}</em><b>${n}</b><span class="ex">${ex}</span><span class="ds">${d}</span></div>`).join('')}</div>`,
      play() {},
    },
  ];

  function render() {
    timers.forEach(clearTimeout);
    timers = [];
    const s = STEPS[step];
    $('#tutStep').textContent = `${step + 1} / ${STEPS.length}`;
    $('#tutTitle').textContent = s.title;
    $('#tutText').innerHTML = s.text;
    stage.innerHTML = s.html();
    $('#tutDots').innerHTML = STEPS.map((_, i) => `<button class="${i === step ? 'on' : ''}" data-i="${i}" aria-label="${i + 1}단계"></button>`).join('');
    $('#tutPrev').disabled = step === 0;
    $('#tutNext').textContent = step === STEPS.length - 1 ? '알겠어요!' : '다음';
    void stage.offsetWidth;
    s.play();
  }

  function go(i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    render();
  }

  function open(at = 0) {
    el.classList.add('show');
    go(at);
  }

  function close() {
    timers.forEach(clearTimeout);
    timers = [];
    el.classList.remove('show');
  }

  $('#tutPrev').addEventListener('click', () => go(step - 1));
  $('#tutNext').addEventListener('click', () => (step === STEPS.length - 1 ? close() : go(step + 1)));
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
    if (e.target.closest('[data-tutorial]')) {
      window.SFX && SFX.click();
      open();
    }
  });

  return { open, close };
})();
