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
      'sub.lobbyOpp': '모두 준비하면 시작', 'sub.lobbyCode': '방 코드 {code} 를 친구에게 알려주세요', 'sub.times': '기억 {m}초 / 선택 {p}초',
      'sub.swaps': '섞기 {n}번', 'sub.memorize': '{m}초 뒤 카드가 뒤집힙니다. 위치를 외우세요!', 'sub.revealShuffle': '이제 카드가 섞입니다. 눈을 떼지 마세요!',
      'sub.reveal': '공유 카드 5장이 깔립니다', 'sub.shuffle': '좋은 카드가 어디로 가는지 따라가세요', 'sub.pick': '위치를 떠올려 고르세요 · 상대와 같은 카드도 가능',
      'sub.pot': '팟 {n}',
      'act.ready': '준비', 'act.unready': '준비 취소', 'act.memorized': '다 외웠어요', 'act.lock': '선택 확정', 'act.final': '최종 결과 보기',
      'act.nextRound': '다음 라운드', 'act.exit': '나가기', 'act.rematch': '다시 하기',
      'hint.oppMemorizing': '상대가 외우는 중', 'hint.focus': '집중하세요…', 'hint.shuffle': '카드에서 눈을 떼지 마세요',
      'hint.oppPicking': '상대의 선택을 기다리는 중', 'hint.tapToPick': '카드를 눌러 선택', 'hint.waitOpp': '상대를 기다리는 중',
      'go.draw': '무승부', 'go.win': '최종 승리!', 'go.lose': '패배', 'go.bust': '칩이 모두 떨어진 플레이어가 나와 게임이 끝났습니다',
      'go.rounds': '{n}라운드 종료 · 칩이 많은 쪽이 승리', 'go.waitOpp': '상대의 준비를 기다리는 중…', 'go.oppGone': '상대가 나갔습니다', 'go.oppWants': '상대가 재대결을 원합니다!',
      'game.nut.desc': '공유 카드와 16장이 모두 공개! 가장 강한 2장을 누가 먼저 찾을까? 족보가 같으면 빠른 사람이 승리.',
      'game.nut.meta': '2~6인 · 약 4분',
      'setup.players': '인원', people: '{n}명',
      'badge.out': '탈락', secs: '{n}초', 'hint.out': '칩이 떨어져 탈락했어요. 관전 중…',
      'lvl.easy': '하', 'lvl.normal': '중', 'lvl.hard': '상',
      'bot.add': '봇 추가', 'bot.remove': '봇 내보내기', 'sys.botJoined': '봇 {name}({lvlName})이 들어왔어요.',
      'ph.nutPick': '가장 강한 2장을 찾아라!', 'sub.nutPick': '족보가 같으면 먼저 확정한 사람이 승리', 'sub.nutTime': '제한 {p}초',
      'game.indian': '인디언 포커', 'game.indian.desc': '내 카드만 안 보여요! 다른 사람 카드와 베팅으로 내 숫자를 추리하세요. 10 들고 다이하면 벌칙.',
      'game.indian.meta': '2~6인 · 약 6분', 'setup.turn': '한 턴 시간',
      'badge.nextRound': '다음 판 참가', 'hint.pending': '중간 참여! 다음 라운드부터 함께해요. 지금은 구경하세요 👀',
      'watch.on': '관전 중', 'watch.sit': '자리 앉기', 'watch.sitNext': '다음 라운드부터 참가', 'watch.tooLate': '중간 참여는 {n}라운드까지만 가능해요', 'watch.full': '자리가 꽉 찼어요. 자리가 나면 앉을 수 있어요',
      'rooms.playingRound': '{n}라운드 진행 중', 'rooms.lateOk': '중간 참여 가능', 'rooms.lateJoin': '중간 참여', 'rooms.watch': '관전하기',
      'online.watching': '{game} 관전 중', 'invite.watchOnly': '관전으로 입장',
      'sys.lateJoined': '{name}님이 중간 참여했어요 (다음 라운드부터)', 'sys.watching': '{name}님이 관전을 시작했어요', 'srv.roomClosed': '방이 닫혔어요',
      'plaza.hint': '방향키/WASD로 걷기 · 발판 위에 잠시 서 있으면 입장 · 화면을 눌러 이동', 'plaza.rank': '랭킹', 'plaza.me': '마이페이지', 'plaza.howto': '게임 방법', 'plaza.portal': '{name}님의 방', 'plaza.noRooms': '열린 방이 생기면 여기에 포털이 나타나요', 'plaza.needName': '먼저 닉네임을 입력하세요',
      'online.title': '접속 중', 'online.count': '{n}명', 'online.empty': '지금은 나 혼자예요. 친구에게 주소를 보내 보세요!', 'online.lobby': '로비', 'online.waiting': '{game} 대기 중', 'online.playing': '{game} 게임 중', 'online.me': '나', 'online.join': '같이 하기',
      'rooms.title': '열린 방', 'rooms.count': '{n}개', 'rooms.empty': '아직 열린 방이 없어요. 위에서 게임을 골라 방을 만들어 보세요!',
      'rooms.waiting': '대기 중', 'rooms.playing': '게임 중', 'rooms.full': '꽉 참', 'rooms.host': '{name}님의 방',
      'rooms.players': '{n}/{max}명', 'rooms.bots': '봇 {n}',
      'invite.enter': '입장하기', 'invite.title': '{name}님의 {game} 방에 초대받았어요!', 'invite.needName': '닉네임을 입력하고 입장하세요',
      'ip.check': '체크', 'ip.callN': '콜 {n}', 'ip.raiseTo': '레이즈 {n}', 'ip.allin': '올인', 'ip.fold': '다이',
      'ip.thinking': '고민 중', 'ip.value': '카드 {n}', 'ip.penalty': '10 다이 벌칙 -{n}', 'ip.dealer': '딜러',
      'ip.lobbyRules': '1~10 카드 두 벌(20장) · 내 카드만 안 보여요 · 높은 숫자가 승리, 같으면 나눠요 · 10을 들고 다이하면 벌칙 {n}',
      'ip.toBeat': '현재 베팅', 'ip.deck': '남은 카드', 'ip.reshuffled': '새로 섞음', 'ip.discards': '지나간 카드', 'ip.noDiscards': '아직 없음',
      'ip.whyAllFold': '모두 다이해서 이겼어요', 'ip.whyOthersWin': '모두 다이해서 {name}님이 가져갔어요', 'ip.whyTie': '{n}끼리 같아서 나눠 가져요',
      'ip.whyMine': '내 카드는 {n}였어요', 'ip.yourTurn': '내 차례!', 'ip.turnOf': '{name}님 차례', 'ip.turnTime': '한 턴 {p}초',
      'ip.toCall': '콜하려면 {n} 필요', 'ip.betHint': '내 카드는 나만 못 봐요 · 상대 베팅으로 추리하세요', 'ip.myCard': '내 카드: {n}',
      'ip.foldedWait': '다이했어요. 결과를 기다리는 중…', 'ip.waitTurn': '{name}님이 고민 중', 'ip.raiseBtn': '+{n}', 'ip.toN': '→ {n}', 'ip.callBtn': '콜 {n}',
      'nav.rank': '랭킹', 'nav.me': '마이페이지', 'rank.title': '랭킹',
      'rank.empty': '아직 기록이 없어요. 게임을 끝까지 플레이하면 랭킹에 올라가요!', 'rank.record': '{g}전 {w}승 ({p}%)',
      'rank.bestCard': '최고 카드 {n}', 'rank.unranked': '아직 순위 없음', 'rank.ptsUnit': '점',
      'rank.note': '게임이 끝날 때 등수에 따라 랭킹 포인트가 오르내려요(시작 1,000점). 봇하고만 한 게임은 절반만 반영되고, 게임 중에 나가면 꼴찌로 기록돼요.',
      'me.title': '마이페이지', 'me.photo': '프로필 사진', 'me.upload': '사진 올리기', 'me.name': '닉네임', 'me.save': '저장', 'me.saved': '저장했어요',
      'me.stats': '게임별 기록', 'me.games': '판수', 'me.wins': '우승', 'me.winrate': '승률', 'me.rounds': '라운드 승', 'me.chips': '딴 칩', 'me.best': '최고 기록',
      'me.recent': '최근 경기', 'me.none': '아직 기록 없음', 'me.place': '{n}위',
      'me.transfer': '계정 이전 코드', 'me.transferHint': '이 코드를 다른 기기에서 입력하면 같은 프로필과 기록으로 이어서 할 수 있어요. 다른 사람에게는 알려주지 마세요!',
      'me.show': '보기', 'me.copy': '복사', 'me.copied': '이전 코드를 복사했어요', 'me.import': '다른 기기의 코드 붙여넣기', 'me.importBtn': '불러오기',
      'me.imported': '프로필을 불러왔어요!', 'me.badCode': '코드가 올바르지 않아요',
      'srv.badImage': '이미지가 너무 크거나 지원하지 않는 형식이에요', 'srv.badAvatar': '없는 프로필 사진이에요', 'srv.noProfile': '프로필을 찾을 수 없어요',
      'go.rating': '랭킹 포인트 {d} → {r}점',
      'sp.split': '무승부! 팟을 나눠요', 'sp.youWin': '내가 이겼다!', 'sp.wins': '{name} 승리!', 'sp.allFold': '모두 다이!',
      'sp.indianWin': '카드 {n}', 'sp.yours': '내 패', 'sp.tap': '탭하면 닫혀요',
      'why.folded': '다이해서 이번 판은 빠졌어요',
      'bet.yourTurn': '베팅! 내 차례', 'bet.hint': '고른 카드가 확실히 기억나요? 자신 있으면 레이즈!', 'bet.on': '베팅 ON',
      'setup.betting': '베팅 라운드', 'setup.bettingHint': '카드를 고른 뒤 자신감으로 베팅', 'bet.onLabel': '켜기', 'bet.offLabel': '끄기',
      'why.slower': '같은 족보지만 {name}님이 {n}초 더 빨랐어요', 'why.noLock': '같은 족보지만 시간 안에 확정하지 않아서 졌어요',
      'why.faster': '같은 족보! {n}초 더 빨라서 이겼어요', 'why.fasterNoLock': '같은 족보! 먼저 확정해서 이겼어요',
      'why.kicker': '둘 다 {hand}지만 나머지 카드(키커)에서 졌어요', 'why.kickerWin': '둘 다 {hand}, 나머지 카드(키커)로 이겼어요',
      'sub.count': '{n}/{max}명', 'go.readyCount': '준비 {n}/{max}',
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
      'sub.lobbyOpp': 'Starts when everyone is ready', 'sub.lobbyCode': 'Share room code {code} with a friend', 'sub.times': 'Memorize {m}s / Pick {p}s',
      'sub.swaps': '{n} shuffles', 'sub.memorize': 'Cards flip in {m}s. Remember where they are!', 'sub.revealShuffle': 'The cards shuffle next. Keep your eyes on them!',
      'sub.reveal': '5 community cards are coming', 'sub.shuffle': 'Track where the good cards go', 'sub.pick': 'Pick by position · picking the same card as your opponent is OK',
      'sub.pot': 'Pot {n}',
      'act.ready': 'Ready', 'act.unready': 'Cancel ready', 'act.memorized': "I've got it", 'act.lock': 'Lock in', 'act.final': 'See final results',
      'act.nextRound': 'Next round', 'act.exit': 'Leave', 'act.rematch': 'Rematch',
      'hint.oppMemorizing': 'Opponent is memorizing', 'hint.focus': 'Focus…', 'hint.shuffle': "Don't take your eyes off the cards",
      'hint.oppPicking': "Waiting for your opponent's pick", 'hint.tapToPick': 'Tap cards to pick', 'hint.waitOpp': 'Waiting for your opponent',
      'go.draw': 'Draw', 'go.win': 'Victory!', 'go.lose': 'Defeat', 'go.bust': 'A player ran out of chips',
      'go.rounds': '{n} rounds done · most chips wins', 'go.waitOpp': 'Waiting for your opponent…', 'go.oppGone': 'Your opponent left', 'go.oppWants': 'Your opponent wants a rematch!',
      'game.nut.desc': 'The board and all 16 cards are face up! Who finds the strongest 2 first? Equal hands go to the faster player.',
      'game.nut.meta': '2–6 players · ~4 min',
      'setup.players': 'Players', people: '{n}',
      'badge.out': 'Out', secs: '{n}s', 'hint.out': "You're out of chips. Spectating…",
      'lvl.easy': 'Easy', 'lvl.normal': 'Normal', 'lvl.hard': 'Hard',
      'bot.add': 'Add bot', 'bot.remove': 'Remove bot', 'sys.botJoined': 'Bot {name} ({lvlName}) joined.',
      'ph.nutPick': 'Find the strongest 2!', 'sub.nutPick': 'Equal hands go to whoever locked in first', 'sub.nutTime': '{p}s limit',
      'game.indian': 'Indian Poker', 'game.indian.desc': "You can't see your own card! Read the others' cards and bets to guess yours. Folding a 10 costs a penalty.",
      'game.indian.meta': '2–6 players · ~6 min', 'setup.turn': 'Turn time',
      'badge.nextRound': 'Joins next round', 'hint.pending': "You joined mid-game! You'll play from the next round. Enjoy the show 👀",
      'watch.on': 'Spectating', 'watch.sit': 'Take a seat', 'watch.sitNext': 'Join from next round', 'watch.tooLate': 'Late joining is only open until round {n}', 'watch.full': 'All seats are taken. You can sit when one opens',
      'rooms.playingRound': 'Round {n} in play', 'rooms.lateOk': 'late join open', 'rooms.lateJoin': 'Join now', 'rooms.watch': 'Watch',
      'online.watching': 'Watching {game}', 'invite.watchOnly': 'Join as spectator',
      'sys.lateJoined': '{name} joined mid-game (plays from next round)', 'sys.watching': '{name} is watching', 'srv.roomClosed': 'The room was closed',
      'plaza.hint': 'Arrow keys/WASD to walk · stand on a pad to enter · tap to move', 'plaza.rank': 'Ranking', 'plaza.me': 'My page', 'plaza.howto': 'How to play', 'plaza.portal': "{name}'s room", 'plaza.noRooms': 'Portals to open rooms appear here', 'plaza.needName': 'Enter a nickname first',
      'online.title': 'Online now', 'online.count': '{n}', 'online.empty': "It's just you right now. Send your friends the link!", 'online.lobby': 'In lobby', 'online.waiting': 'Waiting · {game}', 'online.playing': 'Playing {game}', 'online.me': 'me', 'online.join': 'Join',
      'rooms.title': 'Open rooms', 'rooms.count': '{n}', 'rooms.empty': 'No open rooms yet. Pick a game above and create one!',
      'rooms.waiting': 'Waiting', 'rooms.playing': 'In game', 'rooms.full': 'Full', 'rooms.host': "{name}'s room",
      'rooms.players': '{n}/{max} players', 'rooms.bots': '{n} bots',
      'invite.enter': 'Join', 'invite.title': "You're invited to {name}'s {game} room!", 'invite.needName': 'Enter a nickname to join',
      'ip.check': 'Check', 'ip.callN': 'Call {n}', 'ip.raiseTo': 'Raise to {n}', 'ip.allin': 'All in', 'ip.fold': 'Fold',
      'ip.thinking': 'Thinking', 'ip.value': 'Card {n}', 'ip.penalty': 'Folded a 10 −{n}', 'ip.dealer': 'Dealer',
      'ip.lobbyRules': "Two sets of 1–10 (20 cards) · you can't see your own card · highest wins, ties split · folding a 10 costs {n}",
      'ip.toBeat': 'Current bet', 'ip.deck': 'Cards left', 'ip.reshuffled': 'reshuffled', 'ip.discards': 'Past cards', 'ip.noDiscards': 'none yet',
      'ip.whyAllFold': 'Everyone else folded', 'ip.whyOthersWin': 'Everyone folded to {name}', 'ip.whyTie': 'Tied {n}s split the pot',
      'ip.whyMine': 'Your card was {n}', 'ip.yourTurn': 'Your turn!', 'ip.turnOf': "{name}'s turn", 'ip.turnTime': '{p}s per turn',
      'ip.toCall': '{n} to call', 'ip.betHint': "Only you can't see your card · read the others' bets", 'ip.myCard': 'Your card: {n}',
      'ip.foldedWait': 'You folded. Waiting for the result…', 'ip.waitTurn': '{name} is thinking', 'ip.raiseBtn': '+{n}', 'ip.toN': '→ {n}', 'ip.callBtn': 'Call {n}',
      'nav.rank': 'Ranking', 'nav.me': 'My page', 'rank.title': 'Ranking',
      'rank.empty': 'No records yet. Finish a game to get on the board!', 'rank.record': '{g} games · {w} wins ({p}%)',
      'rank.bestCard': 'Best card {n}', 'rank.unranked': 'Not ranked yet', 'rank.ptsUnit': 'pts',
      'rank.note': 'Ranking points rise or fall by your finishing place when a game ends (start: 1,000). Games against bots only count half, and leaving mid-game counts as last place.',
      'me.title': 'My page', 'me.photo': 'Profile picture', 'me.upload': 'Upload photo', 'me.name': 'Nickname', 'me.save': 'Save', 'me.saved': 'Saved',
      'me.stats': 'Records by game', 'me.games': 'Games', 'me.wins': 'Wins', 'me.winrate': 'Win rate', 'me.rounds': 'Rounds won', 'me.chips': 'Chips won', 'me.best': 'Best',
      'me.recent': 'Recent games', 'me.none': 'No games yet', 'me.place': '#{n}',
      'me.transfer': 'Account transfer code', 'me.transferHint': 'Enter this code on another device to continue with the same profile and records. Keep it to yourself!',
      'me.show': 'Show', 'me.copy': 'Copy', 'me.copied': 'Transfer code copied', 'me.import': 'Paste a code from another device', 'me.importBtn': 'Load',
      'me.imported': 'Profile loaded!', 'me.badCode': "That code isn't valid",
      'srv.badImage': 'That image is too large or not a supported format', 'srv.badAvatar': 'Unknown profile picture', 'srv.noProfile': 'Profile not found',
      'go.rating': 'Ranking points {d} → {r}',
      'sp.split': 'Split pot!', 'sp.youWin': 'You win!', 'sp.wins': '{name} wins!', 'sp.allFold': 'Everyone folded!',
      'sp.indianWin': 'Card {n}', 'sp.yours': 'Your hand', 'sp.tap': 'Tap to close',
      'why.folded': 'You folded this round',
      'bet.yourTurn': 'Your bet!', 'bet.hint': 'Sure you remember your cards? Raise if you\'re confident!', 'bet.on': 'Betting ON',
      'setup.betting': 'Betting round', 'setup.bettingHint': 'Bet on your memory after picking', 'bet.onLabel': 'On', 'bet.offLabel': 'Off',
      'why.slower': 'Same hand, but {name} locked in {n}s faster', 'why.noLock': "Same hand, but you didn't lock in before time ran out",
      'why.faster': 'Same hand! You won by locking in {n}s faster', 'why.fasterNoLock': 'Same hand! You won by locking in first',
      'why.kicker': 'Both {hand}, but you lost on the kicker', 'why.kickerWin': 'Both {hand}, and you won on the kicker',
      'sub.count': '{n}/{max} players', 'go.readyCount': 'Ready {n}/{max}',
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
    msg: (m) => (m && m.code ? t(m.code, { ...m, lvlName: m.level ? t(`lvl.${m.level}`) : '' }) : ''),
  };
})();
const t = I18N.t;
window.I18N = I18N;
