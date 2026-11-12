// Korean / English strings. t('key', {vars}) → text in the current language.
const I18N = (() => {
  const D = {
    ko: {
      'doc.desc': '친구들과 함께하는 포커 룰 미니게임',
      tagline: '친구들과 함께하는 포커 룰 미니게임',
      'nick.label': '닉네임', 'nick.ph': '닉네임을 입력하세요',
      'games.title': '게임 선택', 'games.sub': '방을 만들고 친구를 초대하세요',
      'game.memory': '기억 포커', 'game.shuffle': '셔플 메모리', 'game.nut': '너트 레이스', 'game.outs': '아웃츠 헌터',
      'game.memory.desc': '16장의 위치를 외우고, 뒤집힌 카드 중 2장을 골라 최강의 족보를 만드세요.',
      'game.shuffle.desc': '기억 포커 2탄! 뒤집힌 카드가 야바위처럼 섞여요. 눈으로 따라가서 2장을 고르세요.',
      'game.memory.meta': '2인 · 약 5분', 'game.shuffle.meta': '2인 · 약 6분',
      'game.soon': '준비 중인 게임입니다.', 'cta.create': '방 만들기',
      'tut.q': '처음이신가요?', 'tut.go': '게임 방법 보기 →',
      'join.ph': '방 코드', 'join.btn': '참가하기',
      leave: '나가기', 'invite.copy': '초대 링크 복사', howto: '게임 방법', sound: '소리 켜기/끄기',
      'net.reconnecting': '서버에 다시 연결하는 중…',
      'chat.title': '채팅', 'chat.ph': '메시지 입력', 'chat.open': '채팅 열기', 'chat.close': '채팅 닫기', 'chat.stickers': '이모티콘', 'chat.send': '보내기',
      'setup.title': '방 설정', players2: '2인', 'setup.memorize': '기억 시간', 'setup.pick': '선택 시간', sec: '초',
      'setup.swaps': '섞는 횟수', 'setup.swapsHint': '많을수록 어려워요', times: '{n}번', 'setup.speed': '섞는 속도',
      'speed.slow': '느리게', 'speed.normal': '보통', 'speed.fast': '빠르게', cancel: '취소',
      prev: '이전', next: '다음', gotit: '알겠어요!', close: '닫기',
      'err.nick': '닉네임을 입력하세요', 'err.soon': '준비 중인 게임입니다', 'err.code': '4자리 방 코드를 입력하세요',
      'err.joinFail': '입장에 실패했습니다', 'err.roomClosed': '방이 종료되었습니다',
      'srv.notFound': '방을 찾을 수 없습니다.', 'srv.full': '방이 가득 찼습니다.', 'srv.inProgress': '이미 게임이 진행 중입니다.',
      'srv.noGame': '없는 게임입니다.', 'srv.kicked': '다른 창에서 같은 자리로 접속했습니다.', 'srv.chatFast': '메시지를 너무 빨리 보내고 있어요.',
      'srv.oppLeft': '{name}님이 나가서 게임이 종료되었습니다.', 'sys.joined': '{name}님이 입장했습니다.', 'sys.left': '{name}님이 나갔습니다.',
      'confirm.leave': '게임 중에 나가면 게임이 종료됩니다. 나갈까요?',
      'invite.copied': '초대 링크를 복사했습니다', 'invite.code': '방 코드: {code}',
      'invite.local': '복사했지만 localhost 링크는 내 PC에서만 열립니다. 배포 주소나 내 IP 주소로 접속해서 초대하세요.',
      'pick.max': '이미 2장을 골랐어요. 선택한 카드를 눌러 취소하세요.',
      'seat.waiting': '상대를 기다리는 중', me: '나', meSuffix: ' (나)',
      'badge.off': '연결 끊김', 'badge.ready': '준비 완료', 'badge.wait': '대기 중', 'badge.memorized': '기억 완료', 'badge.memorizing': '기억 중…',
      'badge.locked': '선택 확정', 'badge.picking': '선택 중 {n}/2',
      'ph.lobbyWait': '상대를 기다리는 중', 'ph.lobbyReady': '준비하면 시작합니다', 'ph.memorize': '카드를 기억하세요!', 'ph.reveal': '카드가 뒤집힙니다',
      'ph.shuffle': '카드를 섞는 중!', 'ph.pick': '카드 2장을 고르세요', 'ph.showdown': '쇼다운', 'ph.gameover': '게임 종료',
      'sub.lobbyOpp': '두 명 모두 준비하면 시작', 'sub.lobbyCode': '방 코드 {code} 를 친구에게 알려주세요', 'sub.times': '기억 {m}초 / 선택 {p}초',
      'sub.swaps': '섞기 {n}번', 'sub.memorize': '{m}초 뒤 카드가 뒤집힙니다. 위치를 외우세요!', 'sub.revealShuffle': '이제 카드가 섞입니다. 눈을 떼지 마세요!',
      'sub.reveal': '공유 카드 5장이 깔립니다', 'sub.shuffle': '좋은 카드가 어디로 가는지 따라가세요', 'sub.pick': '위치를 떠올려 고르세요 · 상대와 같은 카드도 가능',
      'sub.pot': '팟 {n}',
      'act.ready': '준비', 'act.unready': '준비 취소', 'act.memorized': '다 외웠어요', 'act.lock': '선택 확정', 'act.final': '최종 결과 보기',
      'act.nextRound': '다음 라운드', 'act.exit': '나가기', 'act.rematch': '다시 하기',
      'hint.oppMemorizing': '상대가 외우는 중', 'hint.focus': '집중하세요…', 'hint.shuffle': '카드에서 눈을 떼지 마세요',
      'hint.oppPicking': '상대의 선택을 기다리는 중', 'hint.tapToPick': '카드를 눌러 선택', 'hint.waitOpp': '상대를 기다리는 중',
      'go.draw': '무승부', 'go.win': '최종 승리!', 'go.lose': '패배', 'go.bust': '칩이 모두 떨어진 플레이어가 나와 게임이 끝났습니다',
      'go.rounds': '{n}라운드 종료 · 칩이 많은 쪽이 승리', 'go.waitOpp': '상대의 준비를 기다리는 중…', 'go.oppGone': '상대가 나갔습니다', 'go.oppWants': '상대가 재대결을 원합니다!',
      'hand.0': '{a} 하이카드', 'hand.1': '{a} 원페어', 'hand.2': '{a}·{b} 투페어', 'hand.3': '{a} 트리플', 'hand.4': '{a} 하이 스트레이트',
      'hand.5': '{a} 하이 플러시', 'hand.6': '{a} 풀하우스 ({b})', 'hand.7': '{a} 포카드', 'hand.8': '{a} 하이 스트레이트 플러시', 'hand.royal': '로열 플러시',
    },
    en: {
      'doc.desc': 'Poker-rule minigames to play with friends',
      tagline: 'Poker-rule minigames to play with friends',
      'nick.label': 'Nickname', 'nick.ph': 'Enter a nickname',
      'games.title': 'Choose a game', 'games.sub': 'Create a room and invite a friend',
      'game.memory': 'Memory Poker', 'game.shuffle': 'Shuffle Memory', 'game.nut': 'Nut Race', 'game.outs': 'Outs Hunter',
      'game.memory.desc': 'Memorize where 16 cards sit, then pick 2 face-down cards to build the best hand.',
      'game.shuffle.desc': 'Memory Poker, part 2! The face-down cards get shuffled like a shell game. Track them and pick 2.',
      'game.memory.meta': '2 players · ~5 min', 'game.shuffle.meta': '2 players · ~6 min',
      'game.soon': 'Coming soon.', 'cta.create': 'Create room',
      'tut.q': 'First time?', 'tut.go': 'How to play →',
      'join.ph': 'Room code', 'join.btn': 'Join',
      leave: 'Leave', 'invite.copy': 'Copy invite link', howto: 'How to play', sound: 'Sound on/off',
      'net.reconnecting': 'Reconnecting to the server…',
      'chat.title': 'Chat', 'chat.ph': 'Type a message', 'chat.open': 'Open chat', 'chat.close': 'Close chat', 'chat.stickers': 'Stickers', 'chat.send': 'Send',
      'setup.title': 'Room settings', players2: '2 players', 'setup.memorize': 'Memorize time', 'setup.pick': 'Pick time', sec: 's',
      'setup.swaps': 'Shuffles', 'setup.swapsHint': 'More is harder', times: '{n}×', 'setup.speed': 'Shuffle speed',
      'speed.slow': 'Slow', 'speed.normal': 'Normal', 'speed.fast': 'Fast', cancel: 'Cancel',
      prev: 'Back', next: 'Next', gotit: 'Got it!', close: 'Close',
      'err.nick': 'Enter a nickname', 'err.soon': 'This game is coming soon', 'err.code': 'Enter the 4-character room code',
      'err.joinFail': 'Could not join the room', 'err.roomClosed': 'The room has closed',
      'srv.notFound': 'Room not found.', 'srv.full': 'The room is full.', 'srv.inProgress': 'A game is already in progress.',
      'srv.noGame': 'Unknown game.', 'srv.kicked': 'You opened this seat in another window.', 'srv.chatFast': "You're sending messages too fast.",
      'srv.oppLeft': '{name} left, so the game ended.', 'sys.joined': '{name} joined.', 'sys.left': '{name} left.',
      'confirm.leave': 'Leaving now will end the game. Leave anyway?',
      'invite.copied': 'Invite link copied', 'invite.code': 'Room code: {code}',
      'invite.local': 'Copied, but localhost links only open on this PC. Invite friends from the deployed address or your IP address.',
      'pick.max': 'You already picked 2. Tap a picked card to undo it.',
      'seat.waiting': 'Waiting for an opponent', me: 'Me', meSuffix: ' (you)',
      'badge.off': 'Disconnected', 'badge.ready': 'Ready', 'badge.wait': 'Not ready', 'badge.memorized': 'Memorized', 'badge.memorizing': 'Memorizing…',
      'badge.locked': 'Locked in', 'badge.picking': 'Picking {n}/2',
      'ph.lobbyWait': 'Waiting for an opponent', 'ph.lobbyReady': 'Ready up to start', 'ph.memorize': 'Memorize the cards!', 'ph.reveal': 'Cards are flipping',
      'ph.shuffle': 'Shuffling!', 'ph.pick': 'Pick 2 cards', 'ph.showdown': 'Showdown', 'ph.gameover': 'Game over',
      'sub.lobbyOpp': 'Starts when both players are ready', 'sub.lobbyCode': 'Share room code {code} with a friend', 'sub.times': 'Memorize {m}s / Pick {p}s',
      'sub.swaps': '{n} shuffles', 'sub.memorize': 'Cards flip in {m}s. Remember where they are!', 'sub.revealShuffle': 'The cards shuffle next. Keep your eyes on them!',
      'sub.reveal': '5 community cards are coming', 'sub.shuffle': 'Track where the good cards go', 'sub.pick': 'Pick by position · picking the same card as your opponent is OK',
      'sub.pot': 'Pot {n}',
      'act.ready': 'Ready', 'act.unready': 'Cancel ready', 'act.memorized': "I've got it", 'act.lock': 'Lock in', 'act.final': 'See final results',
      'act.nextRound': 'Next round', 'act.exit': 'Leave', 'act.rematch': 'Rematch',
      'hint.oppMemorizing': 'Opponent is memorizing', 'hint.focus': 'Focus…', 'hint.shuffle': "Don't take your eyes off the cards",
      'hint.oppPicking': "Waiting for your opponent's pick", 'hint.tapToPick': 'Tap cards to pick', 'hint.waitOpp': 'Waiting for your opponent',
      'go.draw': 'Draw', 'go.win': 'Victory!', 'go.lose': 'Defeat', 'go.bust': 'A player ran out of chips',
      'go.rounds': '{n} rounds done · most chips wins', 'go.waitOpp': 'Waiting for your opponent…', 'go.oppGone': 'Your opponent left', 'go.oppWants': 'Your opponent wants a rematch!',
      'hand.0': '{s}-high', 'hand.1': 'Pair of {p}', 'hand.2': '{p} and {q}', 'hand.3': 'Three {p}', 'hand.4': '{s}-high straight',
      'hand.5': '{s}-high flush', 'hand.6': '{p} full of {q}', 'hand.7': 'Four {p}', 'hand.8': '{s}-high straight flush', 'hand.royal': 'Royal flush',
    },
  };

  const listeners = [];
  let lang = null;
  try { lang = localStorage.getItem('lang'); } catch {}
  if (lang !== 'ko' && lang !== 'en') lang = /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';

  function t(key, vars = {}) {
    const s = D[lang][key] ?? D.ko[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
  }

  const RANK = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
  const EN_RANK = { 2: ['Two', 'Twos'], 3: ['Three', 'Threes'], 4: ['Four', 'Fours'], 5: ['Five', 'Fives'], 6: ['Six', 'Sixes'], 7: ['Seven', 'Sevens'], 8: ['Eight', 'Eights'], 9: ['Nine', 'Nines'], 10: ['Ten', 'Tens'], 11: ['Jack', 'Jacks'], 12: ['Queen', 'Queens'], 13: ['King', 'Kings'], 14: ['Ace', 'Aces'] };
  // Hand description from the server's comparable score array.
  function hand(score) {
    if (!score) return '';
    const [cat, a, b] = score;
    if (cat === 8 && a === 14) return t('hand.royal');
    const r = (n) => RANK[n] || String(n);
    // English uses rank words: "Ace-high", "Pair of Kings".
    const one = (n) => EN_RANK[n][0];
    const many = (n) => EN_RANK[n][1];
    return t(`hand.${cat}`, { a: r(a), b: r(b), s: one(a), p: many(a), q: b ? many(b) : '' });
  }

  // Static markup: data-i18n (text), data-i18n-html, data-i18n-ph (placeholder), data-i18n-label (title + aria-label).
  function apply(root = document) {
    document.documentElement.lang = lang;
    root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
    root.querySelectorAll('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml)));
    root.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
    root.querySelectorAll('[data-i18n-label]').forEach((el) => {
      el.title = t(el.dataset.i18nLabel);
      el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    });
    root.querySelectorAll('[data-i18n-times]').forEach((el) => (el.textContent = t('times', { n: el.dataset.i18nTimes })));
    document.querySelectorAll('.lang-toggle').forEach((b) => {
      b.textContent = lang === 'ko' ? 'EN' : '한국어';
      b.setAttribute('aria-label', lang === 'ko' ? 'Switch to English' : '한국어로 바꾸기');
    });
    const meta = document.querySelector('meta[name=description]');
    if (meta) meta.content = t('doc.desc');
  }

  function set(next) {
    if (next === lang) return;
    lang = next;
    try { localStorage.setItem('lang', lang); } catch {}
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('.lang-toggle')) {
      window.SFX && SFX.click();
      set(lang === 'ko' ? 'en' : 'ko');
    }
  });

  return {
    t, hand, apply, set,
    get lang() { return lang; },
    onChange: (fn) => listeners.push(fn),
    // Server sends {code, ...params}; turn it into text.
    msg: (m) => (m && m.code ? t(m.code, m) : ''),
  };
})();
const t = I18N.t;
window.I18N = I18N;
