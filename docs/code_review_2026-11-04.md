# 코드 리뷰 2026-11-04

범위: `src/` 35개 파일(TS 34개 + `style.css`, 6,581줄) 전부, 커밋 f3881b3 기준. 방법: 모든 줄을 읽었고, 판정·카운트인·카메라·best 경계는 scratchpad 에서 `bun` 으로 `src/` 모듈을 직접 불러 재현했다(저장소에 남긴 파일 없음). 직접 확인하지 못한 것은 '의심' 으로 표시했다. 기존 시험(`test/`, `tools/*.test.ts`)이 덮는지는 항목마다 적었다.

## 높음

- `src/main.ts:474` · 누르기를 판정하기 전에 `play.advance(songTime)` 를 부르지 않는다. 놓침 처리는 rAF 의 `nextFrame`(`src/main.ts:600-601`)에서만 일어나므로, 프레임 사이에 들어온 누르기는 이미 창을 지난 앞 노트에 대해 판정돼 버려진다. · 노트 [1.0, 1.2], 마지막 rAF 가 songTime 1.13 에서 `advance` 함, 다음 rAF 전에 1.15 에 누름 → `press(1.15)` 가 노트 0(오차 +150ms)과 비교돼 null. 노트 1 기준이면 −50ms perfect 였다. 그 다음 advance 가 노트 0 을 pressed miss 로 셈(재현: `PlayState` 직접 호출로 확인, `advance(1.15)` 를 먼저 부르면 perfect). 노트 간격이 0.28s+한 프레임 이하인 곳에서 놓친 뒤 첫 누르기가 사라지며, 프레임이 느릴수록 넓어진다. 시험 없음. · `press` 안에서 `screen.play.advance(songTime)` 를 먼저 부르고 그 놓침 이벤트도 `record` 한다.
- `src/main.ts:600` · 반대 방향도 같다. rAF 는 `performance.now()` 시각으로 놓침을 확정하는데, 그보다 이른 `event.timeStamp` 를 가진 누르기가 그 뒤에 배달되면 창 안에 눌렀어도 이미 miss 다. · 노트 [1.0, 1.5], rAF `advance(1.145)` → 노트 0 miss, 그 뒤 배달된 키 이벤트 timeStamp 환산 1.135 → `press(1.135)` 가 노트 1 과 비교돼 null(재현 확인). 창 끝 몇 ms 안의 늦은 누르기가 무작위로 miss 가 된다. 시험 없음. · rAF 에서는 `advance(songTime - 여유)`(예: 한 프레임 혹은 30ms)로 놓침을 늦게 확정하거나, 방금 놓친 노트를 누르기 timeStamp 기준으로 다시 판정할 수 있게 한다.
- `src/best.ts:28` · `localStorage.setItem` 예외(QuotaExceededError, 차단된 저장소)를 잡지 않는다. 호출 위치는 rAF 안(`src/main.ts:625`)이고 `tick`(`src/main.ts:689-692`)은 `draw` 뒤에 `requestAnimationFrame` 을 부르므로, 예외가 나면 다음 프레임이 예약되지 않아 곡 끝에서 화면이 멈춘다. `screen` 은 아직 "playing" 이라 결과 화면도 버튼도 안 나온다. · 저장소가 가득 찬 상태에서 곡을 끝까지 침 → `recordBest` 가 QuotaExceededError 를 던짐(재현 확인) → 화면 정지. `recordPlay` 는 같은 상황을 잡는데(`src/playlog.ts:66-71`) best 는 안 잡는다. 시험 없음(`test/best.test.ts` 는 성공하는 가짜 저장소만 씀). · `saveBests` 를 try/catch 로 감싸 DOMException 은 경고만 남기고, `tick` 은 `requestAnimationFrame` 을 먼저 예약한다.
- `src/best.ts:14` · `localStorage.getItem` 예외(SecurityError: 사이트 데이터 차단, 일부 사생활 모드)도 잡지 않는다. `loadBests` 는 메뉴 생성자(`src/menu.ts:108`)와 `show`(`src/menu.ts:115`)에서, `localStorage` 읽기는 부팅 중 `savedVolume`(`src/main.ts:110`)·`savedLag`(`src/main.ts:136`)에서 불린다. · 저장소 접근이 SecurityError 를 던지는 브라우저 → `boot` 가 reject → 화면 전체가 "불러오기 실패: ..." 로 바뀌고 게임을 시작할 수 없다(`loadBests` 의 SecurityError 는 재현 확인, boot 경로는 코드로 확인). `src/playlog.ts:34` 의 `getItem` 도 같다. · 저장소 접근을 한 곳의 안전한 읽기/쓰기 함수로 모으고 실패 시 기본값(없음)을 돌려준다.

## 중간

- `src/audio.ts:91-96` · 카운트인 클릭을 첫 노트에서 한 박씩 거꾸로 잡을 뿐 곡의 박 격자(`chart.offset`)와 맞추지 않는다. 첫 노트가 엇박이면 이미 음악이 나오는 동안 클릭이 반 박/4분의 1박 어긋나 울린다. · 출시곡 63개 중 클릭이 song time ≥ 0(음악 재생 중)에 오면서 격자에서 벗어난 곡 3개: `occupy-the-dance-floor`(136BPM, 클릭 0.12·0.561 이 −0.49박 어긋남), `punk-rock-metal`(110BPM, 0.035·0.581 이 −0.25박), `sunny-afternoon`(100BPM, 0.303 이 −0.5박). 첫 노트가 엇박인 곡은 19개이고 나머지 16개는 클릭이 모두 음악 시작 전이라 들리는 어긋남은 없다. `test/audio.test.ts` 는 offset 0 인 경우만 본다. · 의도가 "첫 노트 한 박 전" 이면 그대로 두되 음악과 겹치는 곡은 마지막 클릭을 첫 노트 직전의 정박(offset 격자)으로 잡는 선택지를 두거나, 해당 곡 차트를 확인한다.
- `src/audio.ts:238-248` · 의심. `AudioContext` 가 `pause()` 를 거치지 않고 멈추면(iOS 전화·다른 앱 오디오, 브라우저의 자동 suspend) `pausedAt` 이 null 이라 `heardTime` 이 `stamp.contextTime + (performanceMs - stamp.performanceTime)` 으로 계속 앞으로 간다. 소리는 멈췄는데 노트는 지나가 연속 miss → 게임 오버가 될 수 있다. `context.onstatechange` 를 듣는 코드는 `src/` 어디에도 없다. 실제 브라우저에서 `getOutputTimestamp` 가 이때 어떤 값을 주는지는 확인하지 못했다. · `statechange` 에서 `state !== "running"` 이면 플레이 화면을 `pause` 로 보낸다.
- `src/chart.ts:7` · `notes`(와 `anchors`)를 음수 아님만 검사하고 오름차순·중복 없음은 검사하지 않는다. 판정(`src/judge.ts:33-35` "strictly in order")과 경로가 정렬을 전제한다. 같은 시각 두 노트면 스윕 길이가 0 이라 `orbiterAngle`(`src/path.ts:414`, 템포 있는 경우 `src/path.ts:411-412`)이 0 으로 나눈다. · 노트 [.., 1, 1, ..] 인 그림 도로 차트 → 스윕 {startTime 1, endTime 1} → `orbiterAngle(sweep, 1)` = NaN, `orbiterAngle(sweep, 1.1)` = Infinity(재현 확인) → 그 타일에 선 동안 크레용 각도가 NaN 이라 그려지지 않음. 출시 데이터는 `test/songs.test.ts:30` 이 엄격 증가를 확인하므로 지금은 안 터진다. 새 차트를 `songs.test` 없이 넣거나 도구가 중복을 내면 터진다. · 스키마에 `.refine(t => t.every((x, i) => i === 0 || x > t[i-1]))` 를 더하거나 `orbiterAngle` 에서 길이 0 스윕을 끝 각도로 처리한다.

## 낮음

- `src/judge.ts:26` · 창 경계 `<=` 는 의도대로지만 오차를 `songTime - time` 으로 빼서 생기는 부동소수 오차 때문에 "정확히 경계" 가 한쪽으로 기운다. · 노트 1, 누름 1.06 → 오차 0.06000000000000005 → great(perfect 아님). 1.1 → good, 3.14 → null, 100.14 → null. 반면 0.86(−0.14) → good, 1.14 → good(재현 확인). `test/judge.test.ts:5-16` 는 `judgementOf(0.06)` 처럼 리터럴만 넣어 이를 드러내지 않는다. 실제 누르기는 연속값이라 체감 영향은 거의 없다. · 경계를 ms 정수로 반올림해 비교(`Math.round(Math.abs(offsetS) * 1e6) <= withinS * 1e6`)하거나 시험에 `1.06 - 1` 형태 값을 넣는다. `advance`(`src/judge.ts:103`)도 같은 식을 쓰므로 둘을 함께 바꾼다.
- `src/judge.ts:79-83` · 엄격한 순서 판정이라 간격 0.28s 미만인 두 노트에서 뒤 노트에 가까운 누르기가 앞 노트의 늦은 판정으로 소비된다. 설계(주석 `src/judge.ts:34`)이지만 결과가 나쁘다. · 노트 [1.0, 1.1], 누름 1.10 → 노트 0 good(+100ms). 노트 1 기준이면 perfect(재현 확인). 시험 없음. · 앞 노트 오차보다 뒤 노트 오차가 작고 뒤 노트가 perfect 창 안이면 앞 노트를 miss 로 넘기고 뒤 노트에 주는 규칙을 검토한다.
- `src/judge.ts:78` · 카운트인 동안(첫 노트 창 밖)의 누르기도 `lastPressAt` 을 남겨, 첫 노트를 놓치면 '눌렀는데 놓침'(strain 4)으로 센다. · 노트 [1], `press(-2)`(카운트인 중 박자 따라 누름) 후 `advance(2)` → missPressed 1, missUnpressed 0(재현 확인). 플레이 기록 통계가 그만큼 기운다. · 창의 앞쪽 일정 범위(예: 노트 −0.5s 이전) 누르기는 `lastPressAt` 에 넣지 않는다.
- `src/best.ts:20` · 저장된 JSON 이 손상(잘림)되면 빈 Map 으로 읽고, 다음 `recordBest` 가 그 빈 Map 에 이번 곡만 넣어 덮어쓴다. 손상된 원본에 남아 있던 다른 곡 기록을 복구할 기회가 사라진다. · 저장값 `{"a":{"grade":90,"score":5},"b":{"grade":80,"score":3}`(끝 `}` 빠짐) → `recordBest("c", …)` → 저장값이 `{"c":{"grade":10,"score":1}}` 로 바뀜(재현 확인). 손상 JSON 을 빈 값으로 읽는 것은 `test/best.test.ts:46-53` 이 덮지만 덮어쓰기 결과는 안 본다. · 파싱 실패 시 원본을 `livecanvas.best.corrupt` 같은 키로 한 번 옮겨 둔다.
- `src/best.ts:40` · best 키가 곡 id 하나뿐이다. 지금은 곡마다 난이도가 하나이고 id 가 유일해서(`test/songs.test.ts:17`) 충돌은 없다. 의심: 곡 id 를 바꾸면 옛 기록은 남은 채 안 보이고 새 id 는 0 에서 시작하며, 같은 곡에 난이도를 더하면 한 기록을 나눠 쓴다. 차트 노트가 바뀌어도 옛 점수가 그대로 비교 대상이다. · 키를 `${id}:${difficulty}` 로 하고, 필요하면 차트 버전/노트 수를 함께 저장해 다르면 새로 시작한다. id 변경 시 옮김 표를 둔다.
- `src/best.ts:24` · 저장값이 배열이면 `Object.entries` 가 인덱스를 키로 만든다. · 저장값 `[{"grade":1,"score":2}]` → 곡 id "0" 의 best 로 읽힘(재현 확인). 곡 id 정규식상 "0" 도 유효한 id 다. · `Array.isArray(parsed)` 면 빈 Map 을 돌려준다.
- `src/main.ts:110` · `Number("")` 이 0 이라 저장값이 빈 문자열이면 음량이 0 으로 시작한다. `src/main.ts:136` 의 lag 은 클램프 없이 읽는다(타이밍 체크는 ±0.3s 로 자르는데 저장값은 아무 값이나 통과). · `livecanvas.volume` 에 "" 저장 → 무음. `livecanvas.lagMs` 에 "5000" → 모든 판정이 5s 밀림. · 빈 문자열은 기본값으로, lag 은 ±0.3s 로 자른다.
- `src/main.ts:315-323` · `onDone` 안의 `localStorage.setItem` 이 던지면 `settings.show()` 에 닿지 못한다. `leave` 가 이미 `hide()` 를 불렀으므로(`src/calibration.ts:132-135`) 화면에 아무것도 없고 `screen` 은 "calibration" 그대로다. Escape 로만 빠져나온다. `src/main.ts:278` 음량 저장도 같은 예외를 던진다. · 저장소 가득 참 + 타이밍 체크에서 확인 누름 → 빈 화면. · 위 '안전한 저장' 함수로 바꾼다.
- `src/audio.ts:120-124` · 의심. `pausedAt` 은 `suspend()` 를 부르기 전 시각이고 `suspend()` 는 비동기라, 실제로 오디오 시계가 멈추는 시각은 그보다 늦다. 다시 재생하면 song time 이 그 차이만큼 앞으로 뛴다. 브라우저에서 크기를 재지 못했다. · `await this.context.suspend()` 후 `heardTime` 을 다시 재서 `pausedAt` 으로 쓴다.
- `src/main.ts:231` · `planSections(times, chart.bpm, chart.offset)` 는 템포 맵을 무시하고 기본 BPM 으로 16박마다 자른다(`src/sections.ts:67-68`). 템포가 바뀌는 리듬 도로 차트 `last-fortress`(3구간), `breach`(5구간)에서는 구간(실 색·카메라 이동) 경계가 마디와 어긋난다. · `breach` 에서 두 번째 템포 구간 이후 구간 시작이 마디 첫 박에서 벗어남(코드로 확인, 화면은 보지 않음). · 템포 맵이 있으면 `beatsBetween(tempo, offset, time)` 로 슬롯을 센다.
- `src/main.ts:532-539` · 준비 화면에서 Escape·수식키 조합을 뺀 모든 키가 곡을 시작한다. Shift, Tab, CapsLock 단독도 시작한다(수식키 검사는 `metaKey/ctrlKey/altKey` 뿐). · 준비 화면에서 Shift 누름 → 곡 시작. · `event.key` 가 수식키·Tab 이면 무시한다.
- `src/picture-reveal.ts:119-123` · `revealedPath` 가 결과 화면 매 프레임(`src/result-screen.ts:130`) 불리고, 그 안에서 `tileOfPoint` 가 점마다 0 부터 선형 탐색해(`src/picture-reveal.ts:142`) 프레임당 O(점 수 × 타일 수)다. · 반복 측정: 노트 1,000개 약 4ms, 2,000개 약 25ms/프레임(출시 리듬 차트는 402~473노트). · 위의 `for` 루프에서 이미 구한 `tile` 을 배열에 저장해 재사용하고, 이동이 끝난(move=1, lines=1) 뒤에는 결과를 캐시한다.
- `src/crayon.ts:89` · `drawGrain` 이 `ctx.canvas.width/height`(장치 픽셀)로 채우는데 ctx 에는 이미 `devicePixelRatio` 배율이 걸려 있다(`src/render.ts:56`). DPR 2 에서 4배 넓이를 칠한다. 결과 화면은 같다. · DPR 3 폰에서 매 프레임 9배 넓이 패턴 채우기. · 호출자가 넘기는 CSS 픽셀 크기(`size`)로 채운다.
- `src/calibration.ts:22` · `MAX_LAG_S`(0.3)로 자르는데, 받아들이는 누르기가 이미 `CATCH_S`(0.25, `src/calibration.ts:17`) 안이라 중앙값이 ±0.25 를 넘을 수 없다. 클램프가 하는 일이 없다. · 해당 없음(코드로 확인). · 둘 중 하나로 정리한다.
- `src/style.css:571-620` · `.marks`, `.mark`, `.mark-icon`, `.mark-slow`, `.mark-fast`, `.mark-twirl`, `.mark-name`, `.mark-meaning` 을 쓰는 TS 코드가 없다(`grep` 으로 확인). · 해당 없음. · 지운다.

## 확인했으나 문제 없음

- 판정 창: `press` 의 `<=`(`src/judge.ts:26`)와 `advance` 의 `<=`(`src/judge.ts:103`)가 같은 식이라 "판정도 놓침도 아닌" 틈은 없다. 같은 시각 두 노트는 두 번 눌러야 둘 다 perfect 다(재현 확인).
- 카운트인 박 간격: 60BPM·첫 노트 0 → [−2, −1.5, −1, −0.5](반으로 나눔), 첫 클릭은 항상 −2.7s(시작 키 0.3s 뒤) 이후. BPM 은 스키마가 양수로 막고(`src/chart.ts:42`, `src/chart.ts:30`) 노트는 음수가 아니라 반으로 나누는 루프(`src/audio.ts:95`)는 끝난다. 클릭은 `startAt`(= 재생 시각 + decodingShift)에 맞춰 예약되고 화면 3·2·1·START 는 `songTime`(= heardTime − lag)으로 그려져, 보정값은 소리·화면·판정에 같은 방향으로 한 번만 들어간다.
- 카메라: `cameraAt` 은 첫 타일 이전·마지막 타일 이후에 그 타일에 서 있고(`test/path.test.ts:161` 이 덮음), 같은 시각 타일은 `span > 0` 검사(`src/path.ts:473`)로 0 나누기가 없다(재현: [0,1,1,2] 에서 유한값). `fitView` 는 여백 1.5 덕에 분모가 3 이상, `poseIn` 은 `length > 0` 를 검사한다.
- 리스너: `removeEventListener` 가 없지만 모든 리스너가 부팅 때 한 번 붙는 단일 객체에 있어 쌓이지 않는다. 튜토리얼 rAF 는 `show/hide` 에서 취소한다(`src/tutorial.ts:100-111`). 탭 전환은 플레이 중에만 일시정지한다(`src/main.ts:426-428`).

## 중복

- `src/intro.ts:92-102`, `src/guide.ts:43-57`, `src/rhythm-road.ts:73-78`, `src/picture-reveal.ts:144-149` · 점 목록의 경계 상자 계산이 네 번 있다. 뒤 둘은 `Math.min(...배열)` 전개라 점이 아주 많으면 인자 수 한계에 걸린다. · 하나의 `boundsOf` 로 모은다.
- `src/track.ts:241-243`, `src/sections.ts:101-103` · 같은 이름 `easeInOut` 이 각각 3차·2차 곡선이다. · 이름을 구분하거나 한 모듈에서 내보낸다.
- `src/track.ts:116`, `src/tutorial.ts:19`, `src/walking-crayon-draw.ts:32`(`CALM`), `src/main.ts:154` · `prefers-reduced-motion` 조회가 네 곳. · 한 곳에서 내보낸다.
- `src/walking-crayon.ts:16-25`, `src/path.ts:460-466` · "time 이하인 마지막 타일" 이분 탐색이 두 번. · `standingAt` 하나로.
- `src/best.ts:13-25`, `src/playlog.ts:33-48` · localStorage 읽기 + JSON.parse + SyntaxError 처리 패턴이 같고 둘 다 getItem 예외는 안 잡는다. `src/main.ts:109-112`, `src/main.ts:135-138` 도 같은 숫자 읽기 패턴. · 저장소 접근 헬퍼 하나로 모은다(위 높음 항목의 고칠 안과 같은 자리).
- `src/crayon.ts:51-76`, `src/embroidery.ts:98-115` · 컨텍스트별 패턴 캐시(WeakMap + 오프스크린 캔버스)가 같은 구조. · 패턴 생성 함수만 받는 캐시 헬퍼 하나로.
- `src/crayon.ts:20-49`, `src/walking-crayon-draw.ts:103-128` · 크레용 윤곽(끝 → 심 → 몸통) 그리기와 테두리·그림자 처리가 거의 같다. · 치수만 받는 공통 함수로.
- `src/track.ts:402-405`, `src/track.ts:283-288` · `drawPauses` 가 `signStroke` 와 같은 설정을 손으로 반복하고, 화살촉(`src/track.ts:416-422`)도 `arrowHead`(`src/track.ts:254-262`)와 각도 0.6/0.55 만 다르다. · `signStroke`·`arrowHead` 를 쓴다.
- `src/path.ts:94-95`(`MIN_WEIGHT`/`MAX_WEIGHT`), `src/rhythm-road.ts:233`(리터럴 0.6, 1.8) · 같은 값이 상수와 리터럴로 따로 있다. · 상수를 공유한다.
- `src/track.ts:102`, `src/walking-crayon-draw.ts:29` · 같은 이름 `PACE_COLOR` 가 서로 다른 값(normal: text vs thread). · 이름을 구분한다.
- `src/drawing.ts:136-138`, `src/intro.ts:80-82` · `distance` 가 두 번, `src/embroidery.ts:55-57` `lerp` 와 `src/intro.ts:84-86` `between` 이 같은 일. · 공용 기하 모듈로.
- `src/main.ts:606-616`, `src/main.ts:626-639`, `src/main.ts:367-380` · Session 필드(song, difficulty, pictureName, sections, play, path, source)를 화면 전환마다 손으로 복사한다. · `sessionOf(screen)` 같은 헬퍼로 뽑는다.
- `src/main.ts:404-417`, `src/main.ts:454-465` · 버튼 생성 + `type="button"` + `pointerdown` 전파 막기가 반복된다. · 작은 생성 함수로.
