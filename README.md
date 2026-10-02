# Rhythm Game

AI로 만든 노래(mp3)를 넣으면 채보를 자동으로 만들어 플레이하는 웹 리듬게임. 기획은 [docs/PLAN.md](docs/PLAN.md).

현재 단계: 1단계 - 곡 목록 화면, PC 키보드 5키.

## 실행

```bash
pnpm install   # 처음 한 번
pnpm dev       # 터미널에 나오는 http://localhost:5173 주소를 브라우저로 열기
```

| 화면 | 키 / 마우스 | 동작 |
|---|---|---|
| 메인 | Enter 또는 시작 버튼 | 곡 목록으로 |
| 메인 | S D Space J K | 화면의 키 안내 원이 밝아짐 (키 확인용) |
| 곡 목록 | Esc | 메인 화면으로 |
| 곡 목록 | ↑ ↓ 또는 곡 클릭 | 곡 고르기 |
| 곡 목록 | ← → 또는 1 2 3 또는 난이도 클릭 | Easy / Normal / Hard 고르기 |
| 곡 목록 | Enter 또는 시작 버튼 (곡 더블클릭도 가능) | 플레이 시작 |
| 플레이 | S D Space J K | 반원으로 놓인 버튼 5개, 왼쪽부터 순서대로 (맨 아래 가운데가 스페이스바). 고리가 버튼과 겹칠 때 누른다 |
| 플레이 | Esc | 곡 목록으로 나가기 |
| 결과 | Enter 또는 Esc 또는 클릭 | 곡 목록으로 |

주소 뒤에 `?song=<곡-id>`를 붙이면 그 곡이 선택된 상태로 열린다.

## 곡 추가

1. `public/songs/<곡-id>/` 폴더를 만들고 mp3를 `song.mp3` 이름으로 넣는다. 곡 id는 영어 소문자, 숫자, `-`만 쓴다.
2. 채보를 만든다. 같은 폴더에 `chart.json`이 생기고, 곡 목록(`public/songs/index.json`)도 함께 갱신된다. (처음 실행은 분석 도구를 내려받느라 1분쯤 걸린다)

   ```bash
   pnpm chart public/songs/<곡-id>/song.mp3 --title "곡 제목" --artist "만든 사람"
   ```

3. 브라우저를 새로고침하면 곡 목록에 나타난다.

곡을 지울 때는 폴더를 지운 뒤 아무 곡이나 채보를 다시 만들면 목록에서 빠진다.

채보가 마음에 안 들면 `chart.json`을 직접 고쳐도 된다. `t`는 노트 시간(초), `lane`은 0~4, `end`가 있으면 그 시간까지 누르고 있어야 하는 롱노트다. 같은 `t`에 노트가 둘이면 동시치기다.

레인 수와 키는 `src/lanes.ts`와 `tools/chart_notes.py`의 `LANES`가 같은 수여야 한다. 바꾼 뒤에는 모든 곡의 채보를 다시 만든다.

| 노트 종류 | 화면 | 치는 법 | 채보 도구가 만드는 기준 |
|---|---|---|---|
| 일반 | 고리 하나 | 버튼과 겹칠 때 누른다 | 드럼 등 타격 소리 |
| 동시치기 | 좌우 대칭 고리 둘이 선으로 이어짐 | 두 키를 같이 누른다 | 박자 위의 가장 센 타격 (Easy 없음, Normal 5%, Hard 10%) |
| 롱노트 | 고리 뒤로 띠가 이어짐 | 누른 채로 띠가 끝날 때까지 유지한다 | 다음 노트까지 빈 자리가 있고 그동안 소리가 이어질 때 (0.4초 이상, 전체의 15% 이하) |

롱노트는 누를 때 한 번, 끝까지 유지했을 때 한 번, 모두 두 번 판정된다. 중간에 떼면 뒤쪽 판정이 Miss가 되고 콤보가 끊긴다.

출처 표시가 필요한 음원은 `--credit "표시할 문구"`를 붙인다. 곡 목록에서 그 곡을 고르면 화면 아래에 문구가 나온다.

| 난이도 | 노트가 놓이는 자리 |
|---|---|
| Easy | 두 박자마다 (2분음표). 동시치기 없음 |
| Normal | 박자마다 (4분음표) |
| Hard | 반 박자마다 (8분음표) |

템포가 75~150 BPM 범위 밖이면 절반이나 두 배로 바꿔서 계산한다(예: 170 BPM 곡은 85로 표시). 메트로놈 없이 연주해 템포가 흔들리는 곡도 따라간다. 노트는 드럼 등 타격 소리 기준이고, 보컬 멜로디는 아직 노트로 만들지 않는다.

채보가 잘 안 나오는 곡: 일그러진 기타가 꽉 찬 하드록처럼 드럼이 다른 소리에 묻히는 곡은 박자 추적이 불안정하다.

## 들어 있는 곡

| 곡 id | 곡 | 출처 / 라이선스 |
|---|---|---|
| `circles` | Circles | Josh Woodward, CC BY 4.0 |
| `midnight-sun` | Midnight Sun | Josh Woodward, CC BY 4.0 |
| `release` | Release | Josh Woodward, CC BY 4.0 |
| `swansong` | Swansong | Josh Woodward, CC BY 4.0 |
| `test-beat` | Test Beat 128 | 검증용으로 직접 합성한 곡 |

Josh Woodward의 곡은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)으로 공개되어 있다. Free download: https://www.joshwoodward.com/

## 구조

| 경로 | 역할 |
|---|---|
| `tools/make_chart.py` | mp3를 분석해 박자를 찾고 채보(`chart.json`)와 곡 목록(`index.json`)을 쓰는 도구 |
| `tools/chart_notes.py` | 노트를 어느 줄에 놓을지, 롱노트와 동시치기를 어디에 넣을지 정하는 규칙 |
| `src/lanes.ts` | 버튼(줄) 5개와 키 정의 |
| `src/chart.ts` | 곡 목록, 채보, 음원 불러오기 |
| `src/title.ts` | 메인 화면 (게임 이름은 이 파일의 `GAME_NAME`) |
| `src/menu.ts` | 곡 목록 화면 |
| `src/audio.ts` | 재생과 곡 시간 계산 |
| `src/judge.ts` | 판정, 점수, 콤보 (롱노트, 동시치기 포함) |
| `src/stage.ts`, `src/stage-*.ts` | 플레이 화면 그리기 (반원 버튼, 고리, 롱노트 띠, 동시치기 선, 타격 효과) |
| `src/result-screen.ts` | 결과 화면 그리기 |
| `DESIGN.md` | 디자인 규칙 (색, 글꼴, 부품 상태, 움직임). 화면을 바꿀 때 먼저 읽는다 |
| `src/canvas.ts` | 색과 그리기 도우미 |
| `src/render.ts` | 캔버스 크기 맞춤과 화면 선택 |
| `src/main.ts` | 키 입력과 화면 전환 |
