# Holdem Arcade — 포커 룰 미니게임

친구들과 실시간으로 즐기는 포커 룰 변형 미니게임 모음. Node.js + Express + Socket.IO, 빌드 과정 없는 순수 HTML/CSS/JS 클라이언트.

## 게임 1: 기억 포커 (2인)

0. 방을 만들 때 **기억 시간**(5~90초, 기본 30)과 **선택 시간**(5~60초, 기본 20)을 정함. 마지막 설정은 브라우저에 기억됨
1. 두 플레이어 모두 **준비**하면 시작 (시작 칩 1,000)
2. 라운드마다 앤티를 냄 (50 → 50 → 100 → 100 → 150 → 150 → 200 → 200 → 300 → 300)
3. 카드 16장이 **기억 시간** 동안 공개됨 → 둘 다 "다 외웠어요"를 누르면 바로 넘어감
4. 카드가 뒤집혀 뒷면에 **A~P** 알파벳 표시
5. 공유 카드 **5장** 공개
6. **선택 시간** 안에 알파벳 2장을 비공개로 선택 (상대와 같은 알파벳 선택 가능, 시간 초과 시 랜덤)
7. 쇼다운: 내 2장 + 공유 5장 중 베스트 5장으로 승부, 승자가 팟 획득 (동점이면 분배)
8. 10라운드 종료 또는 한쪽 칩 소진 시 게임 종료 → **다시 하기**로 재대결

서버가 카드 정보를 관리합니다. 카드가 뒤집힌 뒤에는 클라이언트로 카드 값을 보내지 않고, 쇼다운 전까지 상대 선택도 숨기기 때문에 개발자도구로 엿볼 수 없습니다.

## 로컬 실행

```bash
npm install
npm start          # http://localhost:3000  (PORT 환경변수로 변경 가능)
npm test           # 족보 판정 테스트
```

같은 PC에서 테스트할 때는 브라우저 탭 2개를 열면 됩니다. 탭마다 별도 플레이어로 인식되고, 새로고침해도 같은 자리로 재접속됩니다.

## Render 배포

1. 이 폴더를 GitHub 저장소로 push
2. Render 대시보드 → **New → Blueprint** → 저장소 선택 (`render.yaml` 자동 인식)
   - 또는 **New → Web Service**: Build `npm install`, Start `npm start`, Health check `/healthz`
3. 배포된 URL을 친구에게 공유 → 방 만들기 → 상단 방 코드를 눌러 초대 링크 복사

참고:
- 무료 플랜은 15분간 접속이 없으면 잠들고, 첫 접속 때 깨어나는 데 30초 정도 걸립니다.
- 방 정보는 서버 메모리에만 있으므로 재배포/재시작 시 진행 중인 방은 사라집니다. 인스턴스는 1개로 유지하세요.

## 구조

```
server/
  index.js              방 생성/참가/재접속, Socket.IO 라우팅 (게임 공통)
  cards.js              덱, 셔플 (crypto 난수)
  handEval.js           7장 중 베스트 5장 족보 판정
  games/memoryPoker.js  기억 포커 상태 머신 (서버 권한)
public/
  index.html, style.css 로비 + 테이블 UI
  app.js                렌더링, 애니메이션, 입력
  sfx.js                WebAudio 합성 효과음 (파일 없음)
  bg.js                 배경 파티클
test/handEval.test.js
```

### 새 미니게임 추가하기

`server/games/`에 아래 인터페이스를 가진 클래스를 만들고 `server/index.js`의 `GAMES`에 등록합니다.

- `static meta = { id, name, minPlayers, maxPlayers }`
- `onJoin(player)`, `onLeave(playerId, name)`, `canJoin()`
- `onAction(playerId, action)`: 클라이언트가 `socket.emit('action', {...})`로 보낸 입력 처리
- `viewFor(playerId)`: 해당 플레이어에게 보여도 되는 상태만 반환
- `dispose()`: 타이머 정리

그다음 로비의 `data-game` 카드와 클라이언트 렌더러를 추가하면 됩니다.
