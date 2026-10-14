# 귀로 확인할 곡

`uv run tools/screen_songs.py --history` 결과(`screening/results.json`, 129곡)에서 귀 경고(flag)가 붙은 27곡. 문턱은 모두 제안 값이며 검증되지 않았다.

결정은 `screening/decisions.json` 에 `{"<곡 id>": {"keep": true}}` 처럼 적는다.

## 소리가 깎여 있음 (`clipping`, 5곡)

측정: 분당 연속 3샘플 이상 꼭대기가 평평한 횟수

### electro-cabello — Electro Cabello (현재 곡)

- 소리가 깎여 있음: 분당 32.1번 (기준 10번 초과)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### flutey-funk — Flutey Funk (옛 곡)

- 소리가 깎여 있음: 분당 12.0번 (기준 10번 초과)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### humble — Humble (옛 곡)

- 소리가 깎여 있음: 분당 11.1번 (기준 10번 초과)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### mt-fox-shop — Mt Fox Shop (옛 곡)

- 소리가 깎여 있음: 분당 214.2번 (기준 10번 초과)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### pixel-peeker-polka — Pixel Peeker Polka - faster (옛 곡)

- 소리가 깎여 있음: 분당 18.1번 (기준 10번 초과)
- 폰 스피커로 들어 보고 decisions.json 에 적기

## 폰 스피커에서 박이 약함 (`phone_weak_beat`, 11곡)

측정: 300Hz 위만 남겼을 때 남는 박의 비율(상대·절대 중 낮은 값). 대용 지표라 귀로 확인해야 함

### 8bit-dungeon-boss — 8bit Dungeon Boss (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 79.8% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### action-discovery — Action Discovery (옛 곡)

- 폰 스피커에서 박이 약함: 남는 박 76.9% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### andreas-theme — Andreas Theme (옛 곡)

- 폰 스피커에서 박이 약함: 남는 박 77.0% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### fat-caps — Fat Caps (옛 곡)

- 폰 스피커에서 박이 약함: 남는 박 78.2% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### funkorama — Funkorama (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 79.6% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### loopster — Loopster (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 69.6% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### mountain-emperor — Mountain Emperor (옛 곡)

- 폰 스피커에서 박이 약함: 남는 박 70.8% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### occupy-the-dance-floor — Occupy The Dance Floor (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 77.7% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### sunday-dub — Sunday Dub (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 78.1% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### sunny-afternoon — Sunny Afternoon (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 78.6% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### video-games — Video Games (현재 곡)

- 폰 스피커에서 박이 약함: 남는 박 77.8% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

## 박이 또렷하지 않음 (`beat_clarity_low`, 6곡)

측정: essentia 신뢰도, 제안 값, 귀로 확인

### circles — Circles (옛 곡)

- 박이 또렷하지 않음: 신뢰도 0.91 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### impact-allegretto — Impact Allegretto (옛 곡)

- 박이 또렷하지 않음: 신뢰도 1.48 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### release — Release (옛 곡)

- 박이 또렷하지 않음: 신뢰도 1.4 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### rhinoceros — Rhinoceros (옛 곡)

- 박이 또렷하지 않음: 신뢰도 1.39 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### swansong — Swansong (옛 곡)

- 박이 또렷하지 않음: 신뢰도 1.38 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### unholy-knight — Unholy Knight (옛 곡)

- 박이 또렷하지 않음: 신뢰도 1.37 (기준 1.5 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

## 박 간격이 고르지 않음 (`beat_unstable`, 5곡)

측정: 12초 창 중 간격 변동 10% 이하 비율, 제안 값, 귀로 확인

### coffee — Coffee (현재 곡)

- 박 간격이 고르지 않음: 고른 구간 64.3% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### jenifer-the-game — Jenifer The Game (현재 곡)

- 박 간격이 고르지 않음: 고른 구간 37.5% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### looking-for-ammunition — Wandering Around Looking for Ammunition (현재 곡)

- 박 간격이 고르지 않음: 고른 구간 44.4% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### magic-bottle-town — The Town Where I Got the Magic Bottle (옛 곡)

- 박 간격이 고르지 않음: 고른 구간 0.0% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

### surpass-your-limits — surpass your limits! (옛 곡)

- 박 간격이 고르지 않음: 고른 구간 78.6% (기준 80.0% 미만)
- 폰 스피커로 들어 보고 decisions.json 에 적기

폰에서 실제로 들리는지와 박자 구조는 지금 도구로 못 잰다.
