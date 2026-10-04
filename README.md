# 라이브캔버스

노래(mp3)를 넣으면 박자를 분석해 길을 만들고, 키 하나로 연주하면 그림이 그려지는 웹 리듬게임. 기획은 [docs/PLAN.md](docs/PLAN.md), 디자인 규칙은 [DESIGN.md](DESIGN.md).

컨셉은 "리듬 + 그림"이다. 크레파스가 노래의 한 박에 반 바퀴씩 돌다가 그 끝이 다음 칸의 흰 고리에 닿는 순간 키를 누르면 선이 한 칸 그려진다. 선은 크레파스로 그은 것처럼 거칠고, 잘 맞출수록 진하고 굵게, 덜 맞추면 옅게 그려진다. 놓치면 빨간 낙서가 남는다. 길은 한 줄로 이어진 그림(한붓그리기)을 따라 나 있어서, 곡이 끝나 화면이 멀어지면 내가 그린 그림 전체가 드러난다. 선 색은 곡의 구간마다 바뀌고, 카메라는 구간마다 다가가거나 물러나고, 기울고, 옆으로 미끄러지며 움직인다.

처음에는 바느질 컨셉("한 땀")이었고 2026-10-02에 바꿨다. 코드에는 그때의 이름(`embroidery.ts`, `drawStitches`, `thread` 같은)이 남아 있다.

## 실행

```bash
pnpm install   # 처음 한 번
pnpm dev       # 터미널에 나오는 http://localhost:5173 주소를 브라우저로 열기
```

| 화면 | 키 / 마우스 | 동작 |
|---|---|---|
| 처음 화면 (제목이 써지는 동안) | 아무 키, 또는 화면 클릭/탭 | 기다리지 않고 완성된 제목으로 건너뛴다. 아래 "인트로" 참고 |
| 처음 화면 (제목이 완성된 뒤) | Enter 또는 시작 버튼 | 하는 법 화면으로 |
| 하는 법 | Enter 또는 곡 고르기 버튼 | 곡 목록으로 |
| 하는 법 | Esc | 처음 화면으로 |
| 곡 목록 | ← → 또는 1 2 3 또는 난이도 탭 클릭 | Easy / Normal / Hard 탭 바꾸기. 그 난이도의 곡만 보인다 |
| 곡 목록 (컴퓨터) | 시작 버튼 아래 음량 막대 끌기 | 게임 소리 크기 바꾸기(0~100%). 다음에 열어도 그대로다. 폰에는 막대가 없다(폰의 음량 버튼을 쓴다) |
| 곡 목록 | ↑ ↓ 또는 곡 클릭 | 보이는 난이도 안에서 곡 고르기 |
| 곡 목록 | Enter 또는 시작 버튼 (곡 더블클릭도 가능) | 플레이 시작 |
| 곡 목록 | Esc | 처음 화면으로 |
| 시작 대기 | 아무 키, 또는 화면 클릭/탭 | 곡을 고르면 멀리서 길의 앞부분이 보인 채로 멈춰 있다. 누르면 3, 2, 1을 세는 동안 화면이 다가오고 노래가 시작된다 |
| 시작 대기 | Esc 또는 오른쪽 위 곡 선택 버튼 | 곡 목록으로 |
| 플레이 | 아무 키, 또는 화면 클릭/탭 | 크레파스 끝이 다음 칸의 흰 고리에 닿는 순간 누른다 |
| 플레이 | Esc | 곡 목록으로 나가기 |
| 결과 | Enter 또는 Esc 또는 클릭 | 곡 목록으로 |

주소 뒤에 `?song=<곡-id>`를 붙이면 곡 목록에서 그 곡이 선택된 상태로 열린다.

주소 뒤에 `?tick`을 붙이면 노트 자리마다 "톡" 소리가 난다. 노트가 노래 박자와 맞는지 귀로 확인할 때 쓴다. 둘을 같이 쓰려면 `?song=circles&tick`처럼 적는다.

## 온라인 주소와 배포

설치 없이 하려면 https://cmj1203.github.io/rhythm-game/ 을 연다. 폰에서도 된다. 위의 `?song=`도 이 주소 뒤에 붙일 수 있다.

`main` 브랜치에 푸시하면 깃허브 액션(`.github/workflows/deploy.yml`)이 빌드해서 깃허브 페이지에 올린다. 몇 분 뒤 위 주소에 반영되고, 진행 상황은 깃허브 레포의 Actions 탭에서 본다. 푸시가 곧 공개이므로 덜 된 작업은 푸시하지 않는다.

깃허브 페이지는 무료 요금제에서 공개 레포만 쓸 수 있어서, 2026-10-03에 레포를 공개로 바꿨다.

## 인트로

게임을 켜면 나오는 첫 장면이다. 누를 것은 없다. 크레파스가 제목을 0.6초마다 한 글자씩 저절로 쓰고(라, 이, 브, 캔, 버, 스), 3.4초 뒤 여섯 글자를 다 쓰면 왼쪽 위 LIVE가 켜지고 시작 버튼이 나온다.

기다리기 싫으면 아무 키나 누르거나 화면을 누른다. 완성된 제목과 시작 버튼이 바로 나온다. 소리는 없다. "동작 줄이기" 설정이 켜져 있으면 처음부터 완성된 제목을 보여 준다.

제목 글자는 `public/pictures/logo.svg`다. `<path>` 하나가 한 글자이고, 파일에 적힌 순서대로 쓴다.

2026-10-02에 세 가지(A: 한 줄이 동물을 그리고 제목으로 바뀜, B: 박자에 네 번 맞춰 시작, A+B)를 만들어 비교했고, 2026-10-03에 A+B로 정했다.

## 길을 읽는 법

| 길 모양 | 뜻 |
|---|---|
| 크레파스가 도는 빠르기 | 노래의 빠르기다. 길이 어떻게 꺾이든 한 박에 정확히 반 바퀴 돈다 |
| 반 바퀴보다 덜 돌아서 닿는 칸 | 한 박보다 짧게 기다린다 (반 박이면 4분의 1바퀴) |
| 큰 분홍색 점이 있는 칸 | 노트가 촘촘한 구간. 크레파스가 박자에 맞춰 정확히 두 배 빠르기(반 박에 반 바퀴)로 돌고, 그동안 도는 원이 분홍색이 된다. 구간이 끝나면 원래 빠르기로 돌아온다 |
| 큰 하늘색 점이 있는 칸 | 오래 기다리는 칸. 여기서는 크레파스가 절반 이하 빠르기로 천천히 돌고, 그동안 도는 원이 하늘색이 된다 |
| 보라색 고리가 둘러싼 칸 | 여기서 크레파스가 도는 방향이 바뀐다 |
| 흰 고리 | 다음에 그릴 칸. 크레파스 끝이 이 고리에 닿을 때 누른다 |
| 밝은 점선 | 아직 그리지 않은 길. 크레파스에서 가까울수록 밝고, 20칸 앞까지만 보인다 |
| 색 크레파스 선 / 빨간 낙서 | 이미 그린 곳. 맞췄으면 선, 놓쳤으면 낙서. 잘 맞출수록 진하고 굵다. 오래 기다린 노트의 선일수록 굵다. 방금 그은 몇 칸만 또렷하고 그 전의 선은 흐려진다 |
| 선과 크레파스 색이 바뀜 | 곡의 구간(16박)이 두 번 지났다 |
| 화면이 다가가거나 물러남, 천천히 돎, 옆으로 미끄러짐 | 구간마다 카메라가 한 가지씩 천천히 움직인다. 노트가 많은 구간일수록 화면이 가깝고 많이 기운다. 화면은 길의 모퉁이마다 꺾이지 않고 부드럽게 돈다 |

길은 그림의 선을 큰 흐름만 따라간다. 그림 속의 작은 고리와 물결은 길이 일일이 돌지 않고, 그 자리를 지나는 선이 맡는다. 그림의 선이 곧게 뻗는 곳에서는 길이 좌우로 물결치며 간다. 길은 얼불춤처럼 8방향으로만 가고, 두 번 넘게 곧게 이어 가지 않고 45도나 90도로 꺾인다. 리듬에 따라 길이 꺾이기도 하기 때문에 길 자체는 그림과 조금 다르게 생겼지만, 마지막 노트가 지나면 선이 당겨지면서 그림의 선 위로 모인다. 그림 크기는 마지막 노트에서 그림이 끝나도록 곡마다 맞춰진다.

크레파스는 한 박에 반 바퀴를 지킨다. 그래서 길이 꺾인 칸에서는 지나온 칸 바로 위가 아니라, 꺾인 만큼 떨어진 곳에서 돌기 시작한다.

## 그림

그림은 한 줄로 이어진 한붓그리기 아트다. 선이 왼쪽 바닥에서 들어와 대상을 그리고, 몸 안을 고리와 물결로 채운 뒤 오른쪽 바닥으로 나간다. 사용자가 고른 참고 그림의 스타일에 맞춰 아스트라(GPT-6 Astra)가 새로 그렸다.

| 종류 | 그림 |
|---|---|
| 공룡 | 티라노사우루스, 스테고사우루스, 트리케라톱스, 브라키오사우루스, 프테라노돈, 안킬로사우루스, 파라사우롤로푸스, 스피노사우루스, 벨로키랍토르, 파키케팔로사우루스, 딜로포사우루스 |
| 동물 | 고양이, 말, 코끼리, 사슴, 토끼, 악어, 달팽이, 수탉, 여우, 기린, 곰, 낙타, 개구리, 강아지, 양, 돼지, 사자, 다람쥐, 고슴도치, 판다, 코알라, 캥거루, 얼룩말, 하마, 햄스터, 너구리, 호랑이, 원숭이, 젖소, 북극곰, 늑대, 고릴라, 뱀, 카멜레온, 염소, 생쥐, 무당벌레, 들소, 무스, 치타, 박쥐, 우파루파, 나무늘보, 코뿔소, 레서판다, 비버, 라마, 쿼카, 미어캣, 오리너구리, 아르마딜로, 병아리, 가젤, 여우원숭이, 호저, 당나귀, 하이에나, 망아지, 칠면조, 눈표범, 스라소니, 사슴벌레, 도마뱀붙이, 이구아나, 줄무늬다람쥐, 웜뱃, 키위새, 타조, 카피바라, 천산갑, 혹멧돼지, 맥, 스컹크, 웰시코기, 오랑우탄, 개미핥기, 기니피그, 오소리, 순록, 두더지, 야크, 개미, 애벌레, 메뚜기, 목도리도마뱀, 오카피, 사막여우, 하늘다람쥐, 페럿, 닥스훈트, 장수풍뎅이, 사마귀, 매머드, 검치호랑이, 도도새, 매미, 프레리독, 친칠라, 긴팔원숭이, 불도그, 푸들, 큰뿔양, 메추라기, 코브라, 도롱뇽, 두꺼비, 북극여우, 안경원숭이, 알파카, 마멋, 가시두더지, 땅돼지, 주머니쥐, 허스키, 아이벡스, 물소, 빨간눈청개구리, 퍼그, 맨드릴, 시바견, 태즈메이니아데빌, 누, 달마시안, 날쥐, 늘보로리스, 비글, 북방족제비, 세인트버나드, 산토끼, 가비알, 울버린, 서벌, 카라칼, 갈기늑대, 코요테 |
| 하늘과 바다 | 고래, 백조, 독수리, 문어, 나비, 부엉이, 펭귄, 황제펭귄, 홍학, 공작, 거북이, 해마, 해파리, 오리, 돌고래, 게, 금붕어, 꿀벌, 수달, 앵무새, 상어, 물범, 투칸, 펠리컨, 소라게, 황새치, 바다코끼리, 불가사리, 벌새, 일각고래, 범고래, 쥐가오리, 흰동가리, 바닷가재, 복어, 잠자리, 퍼핀, 두루미, 거위, 딱따구리, 까치, 갈매기, 황새, 오징어, 아귀, 장어, 물총새, 코뿔새, 참새, 벨루가, 귀상어, 개복치, 조개, 새우, 날치, 비둘기, 반딧불이, 앵무조개, 고래상어, 매너티, 알바트로스, 매, 원앙, 제비, 까마귀, 코카투, 메기, 바다사자, 쏠배감펭, 대머리독수리, 푸른발부비새, 비단잉어, 에뮤, 나방, 넓적부리황새, 후투티, 베타, 성게, 웃는물총새, 꿩, 뱀잡이수리, 화식조, 금조, 로드러너, 엔젤피시, 쇠똥구리, 말미잘, 콘도르, 울새, 홍관조, 카나리아, 왕관앵무, 왜가리, 큰어치, 피라냐, 연어, 굴 |
| 음식 | 컵케이크, 아이스크림, 파인애플, 라면, 햄버거, 도넛, 수박, 피자, 딸기, 만두, 크루아상, 타코, 초밥, 떡볶이, 아이스바, 핫도그, 빙수, 팬케이크, 김밥, 버블티, 치킨, 주먹밥, 마카롱, 붕어빵, 와플, 팝콘, 프레첼, 새우튀김, 조각 케이크, 감자튀김, 솜사탕, 포도, 츄러스, 비빔밥, 푸딩, 스파게티, 체리, 진저브레드 쿠키, 샌드위치, 막대사탕, 바나나, 계란후라이, 옥수수, 복숭아, 귤, 아보카도, 레몬, 당근, 떡꼬치, 계란말이, 버섯, 사과, 식빵, 배, 초코칩 쿠키, 어묵꼬치, 키위, 베이글, 에그타르트, 사과파이, 치즈, 부리또, 호박, 밀크셰이크, 용과, 바게트, 코코넛, 나초, 찹쌀떡, 선데 아이스크림, 춘권, 석류, 호떡, 브로콜리, 짜장면, 타코야키, 시나몬롤, 경단 꼬치, 감, 군고구마, 토마토, 달고나, 망고, 군밤, 포춘쿠키, 파에야, 계란빵, 김치, 송편, 어니언링, 스타프루트, 호빵, 토스트, 꿀단지, 곰젤리, 사과사탕, 참외, 리치, 고로케, 티라미수, 블루베리, 무화과, 우동, 함박스테이크, 팥빙수 컵, 브라우니, 크레페, 카레라이스, 돈가스, 쌀국수, 볶음밥 |
| 악기 | 기타, 바이올린, 축음기, 피아노 |
| 물건과 풍경 | 자전거, 돛단배, 주전자, 로켓, 새장, 백야, 재봉틀, 등대, 풍차, 기관차, 관람차 |

그림은 모두 369장이다. 곡마다 그림이 하나 나온다. 그림을 나눌 때 곡마다 난이도 세 자리(Easy, Normal, Hard)를 잡아 두고 그 곡의 난이도 자리 것을 쓰기 때문에, 곡 123개까지는 곡마다 다른 그림이 나온다. 곡이 늘면 아스트라가 그림을 더 그린다. 새 그림은 동물을 먼저, 다음으로 음식을 고른다.

황제펭귄은 사용자가 준 연속선 그림(`docs/reference/emperor-penguin.png`, 게임에는 실리지 않는 원본)을 한 줄 선으로 옮긴 것이다.

리듬은 그림에 두 가지로 남는다. 오래 기다린 노트의 선은 굵고 빠른 노트의 선은 가늘며, 곡의 구간이 바뀌면 선 색이 바뀐다. 잘 맞춘 곳은 진하게, 덜 맞춘 곳은 옅게 남는다. 그래서 같은 그림이라도 곡마다 다르게 완성된다.

어느 그림이 나올지는 게임이 정한다. 그림은 곡 목록 순서대로, 곡마다 난이도 세 자리에 카드처럼 한 장씩 나눠지고, 곡은 자기 난이도 자리의 그림을 쓴다. 그림이 자리보다 많은 동안에는 같은 그림이 두 곡에 나오지 않는다. 그림을 두 장 이상 받은 자리는 그중 하나를, 그리고 모든 곡은 선의 어느 쪽 끝에서 그리기 시작할지를, 자기 리듬이 그림에서 가장 덜 벗어나는 쪽으로 고른다. 같은 곡은 항상 같은 그림이고, 곡을 추가하거나 지우거나 난이도를 바꾸면 배정이 바뀔 수 있다.

그림을 추가하려면:

1. `public/pictures/<그림-id>.svg`를 만든다. `viewBox="0 0 100 100"` 안에 채우기 없이 선만 그리고, `transform`은 쓰지 않는다. `<path>` 하나에 `M`이 한 번만 나오면 한 줄 그림이다. 그림 이름은 `<title>`에 적는다.
2. 선이 여러 개여도 된다(`path`, `line`, `polyline`, `polygon`, `circle`, `ellipse`, `rect`). 가까운 끝끼리 이어서 그리고, 선 사이를 옮겨 가는 구간은 완성된 그림에 남지 않는다.
3. `src/pictures.ts`의 `PICTURES`에 그림 id를 추가한다.

경로에 `S`, `T`, 소문자 `m` 명령이 들어 있으면 그림을 읽는 데 1초 가까이 걸린다. `M L C Q A`만 쓰면 0.02초 안에 읽는다.

늦게 또는 일찍 누르면 Miss가 찍히고(빨간 낙서) 크레파스가 다음 칸으로 넘어간다. 그런데 한 번도 누르지 않고 노트를 지나보내면(박자 뒤 0.3초까지 아무것도 누르지 않으면) 게임 오버다. 노래가 멈추고 "다시 하기"(그 곡을 처음부터, 키보드로는 Enter)와 "곡 선택"(곡 목록으로, 키보드로는 Esc) 버튼이 나온다. 마지막 노트가 지나면 화면이 멀어지며 그림 전체가 보이고, 결과 화면으로 이어진다. 노래의 남은 부분은 결과 화면에서도 계속 나온다.

결과 화면의 큰 숫자는 100점 만점 점수다. 노트마다 Perfect 1, Great 0.7, Good 0.4, Miss 0으로 쳐서 평균을 낸 것이고, 소수점은 버리므로 전부 Perfect일 때만 100점이 나온다.

## 곡 추가

1. `public/songs/<곡-id>/` 폴더를 만들고 mp3를 `song.mp3` 이름으로 넣는다. 곡 id는 영어 소문자, 숫자, `-`만 쓴다.
2. 채보를 만든다. 같은 폴더에 `chart.json`이 생기고, 곡 목록(`public/songs/index.json`)도 함께 갱신된다. (처음 실행은 분석 도구와 박자 분석 모델을 내려받느라 몇 분 걸린다)

   ```bash
   pnpm chart public/songs/<곡-id>/song.mp3 --title "곡 제목" --artist "만든 사람"
   ```

3. 브라우저를 새로고침하면 곡 목록에 나타난다. 난이도 탭 안의 순서는 `public/songs/order.json`을 따르고, 여기에 없는 곡은 그 난이도의 맨 끝에 나온다. 원하는 자리에 곡 id를 넣으면 그 자리로 간다.

곡을 지울 때는 폴더를 지운 뒤 아무 곡이나 채보를 다시 만들면 목록에서 빠진다.

곡마다 난이도는 하나다. 채보 도구가 곡의 빠르기로 정한다: 105 BPM 미만은 Easy, 125 BPM 이상은 Hard, 그 사이는 Normal. 직접 정하려면 `--difficulty easy`(또는 `normal`, `hard`)를 붙인다. 곡 목록에서는 그 난이도 탭에 나타난다.

`chart.json`의 `notes`에는 "눌러야 하는 시간(초)" 목록이, `difficulty`에는 난이도가 들어 있다. 마음에 안 들면 직접 고쳐도 된다. 길 모양은 게임이 이 시간들로부터 그때그때 만든다. 노트 자리가 노래와 맞는지는 주소 뒤에 `?tick`을 붙여 귀로 확인한다.

`anchors`는 손대지 않는다. 곡에서 소리가 가장 또렷하게 터지는 순간 몇 개의 시간이다. 브라우저마다 mp3 앞머리의 빈 소리를 잘라 내는 양이 달라서 같은 소리가 0.01~0.03초 다른 자리에 놓이는데, 게임이 곡을 불러올 때 이 순간들을 자기가 푼 소리에서 다시 찾아 그 차이만큼 채보를 옮긴다.

출처 표시가 필요한 음원은 `--credit "표시할 문구"`를 붙인다. 곡 목록에서 그 곡을 고르면 화면 아래에 문구가 나온다.

| 난이도 | 노트가 놓이는 자리 |
|---|---|
| Easy | 세게 치는 박자 + 아주 세게 치는 반 박자(엇박) |
| Normal | 세게 치는 박자와 반 박자 + 아주 세게 치는 잔박 |
| Hard | 치는 소리가 뚜렷한 박자와 반 박자 + 세게 치는 잔박 |

노래에서 치는 소리가 약한 박에는 노트를 두지 않는다. 그래서 노트가 박마다 똑같이 오지 않고, 엇박을 포함해 노래의 리듬을 따라간다. 노트 없이 2박 넘게 비는 곳은 조금이라도 치는 소리가 있는 박을 노트로 채운다. 곡이 끝나며 소리가 꺼져 가는 부분(가장 큰 소리보다 30 dB 아래로 내려가 다시 올라오지 않는 뒤)에는 노트를 두지 않는다.

박자는 박자 분석 모델 [Beat This!](https://github.com/CPJKU/beat_this)(MIT 라이선스)로 찾고, 찾은 박마다 가장 가까운 타격 소리에 맞춰 다듬는다. 템포가 75~150 BPM 범위 밖이면 절반이나 두 배로 바꿔서 계산한다(예: 170 BPM 곡은 85로 표시). 절반으로 줄일 때는 마디 첫 박이 놓이는 쪽 박을 남긴다. 3박자 곡(왈츠)은 박을 하나씩 건너뛰면 마디와 어긋나므로 줄이지 않는다. 곡 중간에 쉬었다가 반 박 어긋나게 다시 들어오는 곡, 메트로놈 없이 연주해 템포가 흔들리는 곡도 따라간다. 노트는 드럼 등 타격 소리 기준이다.

## 들어 있는 곡

| 곡 id | 곡 | 난이도 | 빠르기 | 출처 / 라이선스 |
|---|---|---|---|---|
| `swansong` | Swansong | Easy | 85 BPM | Josh Woodward, CC BY 4.0 |
| `ruby-4` | Ruby 4 (칩튠) | Easy | 86 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `ancient-heavy-tech-donjon` | Ancient Heavy Tech Donjon (게임 음악, 엇박 많음) | Easy | 90 BPM | Komiku (Free Music Archive), CC0 |
| `boss-3-this-is-the-time-to-glisten` | Boss 3 : This is the time to glisten (게임 음악 보스전) | Easy | 90 BPM | Komiku (Free Music Archive), CC0 |
| `flutey-funk` | Flutey Funk (펑크 베이스와 플루트) | Easy | 90 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `rubix-cube` | Rubix Cube (엇박 많음) | Easy | 90 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `together-we-are-stronger` | Together we are stronger (게임 음악, 구간 변화 많음) | Easy | 90 BPM | Komiku (Free Music Archive), CC0 |
| `highlight-reel` | Highlight Reel (밝은 록) | Easy | 90 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `andreas-theme` | Andreas Theme (밴드 록) | Easy | 90 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `game-boi-1` | Game BOI 1 (게임 음악, 엇박 많음) | Easy | 90 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `feels-good-2-b` | Feels Good 2 B (어반 댄스) | Easy | 90 BPM | Jason Shaw (Free Music Archive), CC BY 3.0 |
| `jupiter` | Jupiter (신스 팝) | Easy | 90 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `fearless-first` | Fearless First (밴드 록) | Easy | 92 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `circles` | Circles | Easy | 93 BPM | Josh Woodward, CC BY 4.0 |
| `wallpaper` | Wallpaper (밝은 신스와 드럼, 엇박 많음) | Easy | 93 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `game-travel-1` | Game Travel 1 (게임 음악, 엇박 많음) | Easy | 93 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `carnivale-intrigue` | Carnivale Intrigue (삼바, 엇박 많음) | Easy | 95 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `boss-2-too-powerful-for-you-run` | Boss 2 : Too powerful for you, run ! (게임 음악 보스전, 엇박 많음) | Easy | 95 BPM | Komiku (Free Music Archive), CC0 |
| `video-games` | Video Games (전자음악, 엇박 많음) | Easy | 95 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `no-war` | No War (중동풍 힙합 비트, 엇박 많음) | Easy | 95 BPM | Ketsa (Free Music Archive), CC BY 4.0 |
| `pensive-adventure` | Pensive Adventure (게임 음악) | Easy | 95 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `cretaceous-dawn` | Cretaceous Dawn (타악기, 엇박 많음) | Easy | 96 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `battle-of-the-void` | Battle of the Void (게임 전투 음악) | Easy | 97 BPM | Marcelo Fernandez (OpenGameArt), CC BY 3.0 |
| `coffee` | Coffee (보컬 팝록) | Easy | 97 BPM | Josh Woodward, CC BY 4.0 |
| `action-discovery` | Action Discovery (게임 음악, 엇박 많음) | Easy | 98 BPM | Komiku (Free Music Archive), CC0 |
| `zap-beat` | Zap Beat (전자음악, 엇박 많음) | Easy | 98 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `make-funk` | Make Funk (펑크 베이스) | Easy | 99 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `aerosol-of-my-love` | Aerosol of my Love (신스팝, 엇박 많음) | Easy | 100 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `blippy-trance` | Blippy Trance (밝은 트랜스) | Easy | 100 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `the-adventure` | The adventure (게임 음악, 1분) | Easy | 100 BPM | Komiku (Free Music Archive), CC0 |
| `to-fight-a-spell-by-dancing` | To fight a spell by dancing (게임 음악, 2분) | Easy | 100 BPM | Komiku (Free Music Archive), CC0 |
| `glitter-blast` | Glitter Blast (신스 댄스, 엇박 많음) | Easy | 100 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `sunny-afternoon` | Sunny Afternoon (칩튠) | Easy | 100 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `ants` | Ants (칩튠, 촘촘함) | Easy | 100 BPM | Rolemusic (Free Music Archive), CC BY 4.0 |
| `funkorama` | Funkorama | Easy | 101 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `sunday-dub` | Sunday Dub (더브, 엇박 많음) | Easy | 102 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `groundwork` | Groundwork (안정적인 그루브) | Easy | 102 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `cloud-dancer` | Cloud Dancer (EDM, 구간 변화 많음) | Normal | 107 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `loopster` | Loopster (베이스와 일렉트릭 피아노, 촘촘함) | Normal | 108 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `heavy-drums-n-bass` | Heavy Drums N Bass (드럼 중심) | Normal | 109 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `fat-caps` | Fat Caps (어반 댄스, 엇박 많음) | Normal | 109 BPM | Jason Shaw (Free Music Archive), CC BY 3.0 |
| `kumasi-groove` | Kumasi Groove (타악기와 마림바, 엇박 많음) | Normal | 110 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `radio-rock` | Radio Rock (록) | Normal | 110 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `magic-bottle-town` | The Town Where I Got the Magic Bottle (칩튠) | Normal | 110 BPM | Ragnar Random (OpenGameArt), CC0 |
| `mt-fox-shop` | Mt Fox Shop (칩튠 게임 음악) | Normal | 110 BPM | BoxCat Games (Free Music Archive), CC BY 3.0 |
| `punk-rock-metal` | Punk Rock Metal Background Music (펑크 록) | Normal | 110 BPM | madworldgames (OpenGameArt), CC0 |
| `club-seamus` | Club Seamus (백파이프 클럽 그루브) | Normal | 112 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `ectoplasm` | Ectoplasm (엇박 많음) | Normal | 112 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `pilot-error` | Pilot Error (록, 엇박 많음) | Normal | 112 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `delay-rock` | Delay Rock (록) | Normal | 112 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `mini-boss` | Mini Boss (게임 음악) | Normal | 113 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `protofunk` | Protofunk (펑크 드럼과 기타) | Normal | 113 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `street-party` | Street Party (브라스와 드럼, 엇박 많음) | Normal | 114 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `midnight-sun` | Midnight Sun | Normal | 115 BPM | Josh Woodward, CC BY 4.0 |
| `no-frills-comparsa` | No Frills Comparsa (라틴, 엇박 많음) | Normal | 115 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `dubakupado` | Dubakupado (아프리카 타악기, 엇박 많음) | Normal | 115 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `aurea-carmina` | Aurea Carmina (기타와 브라스 댄스) | Normal | 115 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `drama` | Drama (파워 팝, 구간 변화 많음) | Normal | 115 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `funky-chunk` | Funky Chunk (펑크 드럼과 베이스) | Normal | 115 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `the-final-road` | The Final Road (게임 음악, 엇박 많음) | Normal | 115 BPM | Visager (Free Music Archive), CC BY 4.0 |
| `c-funk` | C-Funk (펑크, 엇박 많음) | Normal | 117 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `electro-cabello` | Electro Cabello (드럼과 브라스 그루브) | Normal | 117 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `fantasia-fantasia` | Fantasia Fantasia (판타지 록, 구간 변화 많음) | Normal | 118 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `mountain-emperor` | Mountain Emperor (타이코 북과 가믈란) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `voltaic` | Voltaic (전자 타악기, 촘촘함) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `enter-the-party` | Enter the Party (댄스, 엇박 많음) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `kicking-bullies` | Kicking bullies (게임 음악) | Normal | 120 BPM | Komiku (Free Music Archive), CC0 |
| `captain-glouglou-contest` | Captain Glouglou contest (게임 음악, 엇박 많음) | Normal | 120 BPM | Komiku (Free Music Archive), CC0 |
| `groovy-baby` | Groovy Baby (촘촘한 그루브, 엇박 많음) | Normal | 120 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `back-in-the-80s` | Back In The 80s (80년대 신스팝, 촘촘함) | Normal | 120 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `a-wee-tipple` | A Wee Tipple (셈여림 변화 큼) | Normal | 120 BPM | Scott Holmes Music (Free Music Archive), CC BY 4.0 |
| `jenifer-the-game` | Jenifer The Game (게임 음악, 촘촘함) | Normal | 120 BPM | Komiku (Free Music Archive), CC0 |
| `your-call` | Your Call (촘촘함, 엇박 많음) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `impact-allegretto` | Impact Allegretto (오케스트라 타격, 엇박 많음) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `psychedelic-crater` | Psychedelic Crater (촘촘함, 구간 변화 큼) | Normal | 120 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `game-boi-3` | Game BOI 3 (게임 음악, 촘촘함, 엇박 많음) | Normal | 120 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `b-3` | B-3 (칩튠 게임 음악) | Normal | 120 BPM | BoxCat Games (Free Music Archive), CC BY 3.0 |
| `saturn` | Saturn (신스 그루브, 엇박 많음) | Normal | 120 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `menace` | Menace (빠른 고딕 메탈) | Normal | 120 BPM | Tomasz Kucza (OpenGameArt), CC BY 4.0 |
| `looking-for-ammunition` | Wandering Around Looking for Ammunition (칩튠) | Normal | 120 BPM | Ragnar Random (OpenGameArt), CC0 |
| `prepare-to-fight` | Prepare to fight (게임 전투 음악) | Normal | 120 BPM | Basil (OpenGameArt), CC0 |
| `funky-pop` | Funky Pop (팝, 엇박 많음) | Normal | 121 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `forever-believe` | Forever Believe (어반 댄스) | Normal | 121 BPM | Jason Shaw (Free Music Archive), CC BY 3.0 |
| `voxel-revolution` | Voxel Revolution (전자음악, 엇박 많음) | Normal | 122 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `rising-tide-faster` | Rising Tide (faster) (전자음악, 촘촘함) | Normal | 122 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `covered-in-oil` | Covered In Oil (펑키한 전자 힙합) | Normal | 124 BPM | Broke For Free (Free Music Archive), CC BY 3.0 |
| `pookatori-and-friends` | Pookatori and Friends (통통 튀는 신스, 엇박 많음) | Normal | 124 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `tech-live` | Tech Live (전자 타악기, 촘촘함) | Normal | 124 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `southern-gothic` | Southern Gothic (밴조, 발 구르기와 박수) | Hard | 126 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `special-spotlight` | Special Spotlight (빠른 록) | Hard | 126 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `big-love` | Big Love (댄스 하우스) | Hard | 127 BPM | 1000 Handz (Free Music Archive), CC BY 4.0 |
| `laserpack` | Laserpack (신스와 금속 타악기) | Hard | 128 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `hotrock` | Hotrock (록, 촘촘함) | Hard | 128 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `sax-rock-and-roll` | Sax, Rock, and Roll (색소폰 록, 촘촘함) | Hard | 128 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `friend-to-friend` | Friend to friend (R&B 비트, 엇박 많음) | Hard | 130 BPM | Loyalty Freak Music (Free Music Archive), CC0 |
| `humble` | Humble (댄스 하우스) | Hard | 130 BPM | 1000 Handz (Free Music Archive), CC BY 4.0 |
| `final-level` | Final Level (게임 음악, 가장 촘촘함) | Hard | 130 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `lagoa-v2` | Lagoa v2 (브라질 카니발) | Hard | 130 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `level-8-find-a-way` | Level 8 : Find a way (게임 음악) | Hard | 130 BPM | Komiku (Free Music Archive), CC0 |
| `acoustic-rock` | Acoustic Rock (빠른 어쿠스틱 록) | Hard | 130 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `the-road-we-use-to-travel` | The road we use to travel when we were kids (게임 음악, 엇박 많음) | Hard | 130 BPM | Komiku (Free Music Archive), CC0 |
| `feel-good-rock` | Feel Good Rock (록, 엇박 많음) | Hard | 131 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `tafi-maradi-no-voice` | Tafi Maradi no voice (젬베, 엇박 많음) | Hard | 133 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `freddys-menagerie` | Freddy's Menagerie (타악기와 록) | Hard | 134 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `raving-energy-faster` | Raving Energy (faster) (빠른 전자음악, 가장 촘촘함) | Hard | 134 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `8bit-dungeon-boss` | 8bit Dungeon Boss (칩튠 보스전) | Hard | 134 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `desert-of-lost-souls` | Desert of Lost Souls (어두운 신스, 엇박 많음) | Hard | 134 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `getting-it-done` | Getting it Done (신스 댄스, 엇박 많음) | Hard | 135 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `big-car-theft` | Big Car Theft (빠른 액션, 촘촘함) | Hard | 135 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `show-your-moves` | Show Your Moves (댄스, 가장 촘촘함) | Hard | 136 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `occupy-the-dance-floor` | Occupy The Dance Floor (댄스, 엇박 많음) | Hard | 136 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `adventures-of-yuki` | Adventures of Yuki Level 1 (칩튠 게임 음악) | Hard | 139 BPM | playgb.com (OpenGameArt), CC BY 4.0 |
| `unholy-knight` | Unholy Knight (오케스트라, 셈여림 큼) | Hard | 140 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `level-11-high-risk-infiltration` | Level 11 : High risk infiltration (빠른 아케이드 액션) | Hard | 140 BPM | Komiku (Free Music Archive), CC0 |
| `transition` | Transition (전자음악, 엇박 많음) | Hard | 140 BPM | Jason Shaw (Audionautix.com), CC BY 4.0 |
| `mutant-club` | Mutant Club (클럽 음악, 엇박 많음) | Hard | 140 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `retro-soundtrack` | Retro Soundtrack (빠른 신스, 구간 변화 많음) | Hard | 140 BPM | HoliznaCC0 (Free Music Archive), CC0 |
| `breakdown` | Breakdown (록, 촘촘함) | Hard | 140 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `wretched-destroyer` | Wretched Destroyer (헤비 메탈) | Hard | 140 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `level-4-first-infiltration-in-unresponsible-tech` | Level 4 : First infiltration in Unresponsible Tech (빠른 아케이드 액션) | Hard | 143 BPM | Komiku (Free Music Archive), CC0 |
| `the-white` | The White (빠른 칩튠, 촘촘함) | Hard | 145 BPM | Rolemusic (Free Music Archive), CC BY 4.0 |
| `jaunty-gumption` | Jaunty Gumption (빠른 마림바와 오르간) | Hard | 146 BPM | Kevin MacLeod (incompetech.com), CC BY 4.0 |
| `release` | Release | Hard | 156 BPM | Josh Woodward, CC BY 4.0 |

Josh Woodward의 곡은 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)으로 공개되어 있다. Free download: https://www.joshwoodward.com/

Kevin MacLeod의 곡(8bit Dungeon Boss, Aerosol of my Love, Andreas Theme, Aurea Carmina, Blippy Trance, Breakdown, C-Funk, Carnivale Intrigue, Cloud Dancer, Club Seamus, Cretaceous Dawn, Delay Rock, Desert of Lost Souls, Dubakupado, Electro Cabello, Enter the Party, Fantasia Fantasia, Fearless First, Flutey Funk, Freddy's Menagerie, Funkorama, Funky Chunk, Getting it Done, Glitter Blast, Groundwork, Highlight Reel, Hotrock, Impact Allegretto, Jaunty Gumption, Kumasi Groove, Lagoa v2, Laserpack, Loopster, Mountain Emperor, No Frills Comparsa, Pilot Error, Pookatori and Friends, Protofunk, Psychedelic Crater, Raving Energy (faster), Rising Tide (faster), "Sax, Rock, and Roll", Show Your Moves, Southern Gothic, Special Spotlight, Street Party, Sunday Dub, Tafi Maradi no voice, Tech Live, Unholy Knight, Voltaic, Voxel Revolution, Wallpaper, Wretched Destroyer, Your Call, Zap Beat)은 Kevin MacLeod (incompetech.com)의 작품이다. Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/ 음원은 고치지 않고 그대로 쓴다.

"Covered In Oil"은 Broke For Free의 곡이다(https://freemusicarchive.org/music/Broke_For_Free/Slam_Funk/Broke_For_Free_-_Slam_Funk_-_10_Covered_In_Oil). Licensed under Creative Commons: By Attribution 3.0. https://creativecommons.org/licenses/by/3.0/

Jason Shaw의 곡 "Fat Caps"(https://freemusicarchive.org/music/Jason_Shaw/Audionautix_Tech_Urban_Dance/TU-FatCaps/), "Feels Good 2 B"(https://freemusicarchive.org/music/Jason_Shaw/Audionautix_Tech_Urban_Dance/TU-FeelsGood2B/)와 "Forever Believe"(https://freemusicarchive.org/music/Jason_Shaw/Audionautix_Tech_Urban_Dance/TU-ForeverBelieve/)는 Free Music Archive에 공개된 것을 쓴다. Licensed under Creative Commons: By Attribution 3.0. https://creativecommons.org/licenses/by/3.0/

Jason Shaw의 곡("Acoustic Rock", "Big Car Theft", "Ectoplasm", "Feel Good Rock", "Groovy Baby", "Heavy Drums N Bass", "Occupy The Dance Floor", "Radio Rock", "Rubix Cube", "Transition")은 Jason Shaw (Audionautix.com)의 작품이다. Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

Komiku의 곡("Action Discovery", "Ancient Heavy Tech Donjon", "Boss 2 : Too powerful for you, run !", "Boss 3 : This is the time to glisten", "Captain Glouglou contest", "Jenifer The Game", "Kicking bullies", "Level 4 : First infiltration in Unresponsible Tech", "Level 8 : Find a way", "Level 11 : High risk infiltration", "The adventure", "The road we use to travel when we were kids", "To fight a spell by dancing", "Together we are stronger")은 Free Music Archive에서 CC0(퍼블릭 도메인)으로 공개되어 있다. 출처를 밝힐 의무는 없지만 곡 목록에 함께 적는다.

"The White"는 Rolemusic의 곡이다(https://freemusicarchive.org/music/Rolemusic/The_Black_Dot/The_White/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"Friend to friend"(Loyalty Freak Music, https://freemusicarchive.org/music/Loyalty_Freak_Music/INSTRUMENTAL_RB_BEATS_TO_SING_OR_RAP_ON/Loyalty_Freak_Music_-_INSTRUMENTAL_RB_BEATS_TO_SING_OR_RAP_ON_-_02_Friend_to_friend/), "Punk Rock Metal Background Music"(madworldgames, https://opengameart.org/content/punk-rock-metal-background-music), "Prepare to fight"(Basil, https://opengameart.org/content/prepare-to-fight)는 CC0(퍼블릭 도메인)으로 공개되어 있다. 출처를 밝힐 의무는 없지만 곡 목록에 함께 적는다.

"Big Love"와 "Humble"은 1000 Handz(1000Handz.com)의 곡이다(https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-dancehouse-instrumentals/big-love-2/, https://freemusicarchive.org/music/1000-handz/cc-by-free-to-use-dancehouse-instrumentals/humble/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"Mt Fox Shop"은 BoxCat Games의 곡이다(https://freemusicarchive.org/music/BoxCat_Games/Nameless_the_Hackers_RPG_Soundtrack/BoxCat_Games_-_Nameless-_the_Hackers_RPG_Soundtrack_-_02_Mt_Fox_Shop/). Licensed under Creative Commons: By Attribution 3.0. https://creativecommons.org/licenses/by/3.0/

"Adventures of Yuki Level 1"은 playgb.com의 곡이다(https://opengameart.org/content/adventures-of-yuki-level-1-music). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

Ragnar Random의 곡 "The Town Where I Got the Magic Bottle"과 "Wandering Around Looking for Ammunition"(팩 안의 파일 이름은 "07 - the town where i got the magic bottle chiptune", "10 - wandering around looking for ammunition")은 OpenGameArt의 Fakebit Chiptune Music Pack(https://opengameart.org/content/fakebit-chiptune-music-pack)에 CC0(퍼블릭 도메인)으로 공개되어 있다. 출처를 밝힐 의무는 없지만 곡 목록에 함께 적는다.

"Battle of the Void"는 Marcelo Fernandez의 곡이다(https://opengameart.org/content/battle-of-the-void, OpenGameArt에 CC-BY 3.0으로 공개). 작곡가가 요청한 표기: “Battle of the Void”. Music by Marcelo Fernandez (http://www.marcelofernandezmusic.com). Licensed under Creative Commons Attribution 4.0 International (http://creativecommons.org/licenses/by/4.0/).

"Menace"는 Tomasz Kucza / magory.net의 곡이다(https://opengameart.org/content/menace-fast-gothic-metal-track). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"No War"는 Ketsa의 곡이다(https://freemusicarchive.org/music/Ketsa/master-builder/no-war/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"B-3"는 BoxCat Games의 곡이다(https://freemusicarchive.org/music/BoxCat_Games/Nameless_the_Hackers_RPG_Soundtrack/BoxCat_Games_-_Nameless-_the_Hackers_RPG_Soundtrack_-_04_B-3/). Licensed under Creative Commons: By Attribution 3.0. https://creativecommons.org/licenses/by/3.0/

"The Final Road"는 Visager의 곡이다(https://freemusicarchive.org/music/Visager/Songs_From_An_Unmade_World/Visager_-_Songs_from_an_Unmade_World_-_11_The_Final_Road/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"Ants"는 Rolemusic의 곡이다(https://freemusicarchive.org/music/Rolemusic/Pop_Singles_Compilation_2014/02_rolemusic_-_ants/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

"A Wee Tipple"은 Scott Holmes Music의 곡이다(https://freemusicarchive.org/music/Scott_Holmes/Music_For_Media_Vol_2/Scott_Holmes_-_03_-_A_Wee_Tipple_1169/). Licensed under Creative Commons: By Attribution 4.0. https://creativecommons.org/licenses/by/4.0/

HoliznaCC0의 곡("Back In The 80s", "Drama", "Final Level", "Funky Pop", "Game BOI 1", "Game BOI 3", "Game Travel 1", "Jupiter", "Make Funk", "Mini Boss", "Mutant Club", "Pensive Adventure", "Retro Soundtrack", "Ruby 4", "Saturn", "Sunny Afternoon", "Video Games")은 Free Music Archive에서 CC0(퍼블릭 도메인)으로 공개되어 있다. 출처를 밝힐 의무는 없지만 곡 목록에 함께 적는다.

모든 곡의 출처를 밝혀 두어서, 곡 목록에서 곡을 고르면 화면 아래에 출처 문구가 나온다.

2026-10-04에 지루한 곡 5개(Test Beat 128, Hyperfun, Rhinoceros, Pixel Peeker Polka - faster, Disco con Tutti)를 뺐다. 채보를 재 보니 같은 간격이 44~82번 이어지거나(마디가 거의 똑같이 반복) 곡 내내 음량 변화가 거의 없었다. 스윙 느낌이라 박자가 어긋나게 잡힌 후보 3곡(Dentaneosuchus Hunt, Jet Fueled Vixen, Mega Hyper Ultrastorm)은 넣지 않았다. 함께 넣었던 Sergio's Magic Dustbin(곡이 점점 빨라짐)과 surpass your limits!(노트 간격이 한 박과 반 박에 반씩 나뉨)는 크레파스가 한 박에 반 바퀴를 지키지 못해서(칸의 10%가 9~15% 넘게 어긋남) 다시 뺐다.

## 구조

| 경로 | 역할 |
|---|---|
| `tools/make_chart.py` | mp3를 분석해 박자를 찾고(Beat This! 모델) 채보(`chart.json`)와 곡 목록(`index.json`)을 쓰는 도구 |
| `DESIGN.md` | 디자인 규칙 (색, 글꼴, 부품 상태, 움직임). 화면을 바꿀 때 먼저 읽는다 |
| `src/chart.ts` | 곡 목록, 채보, 음원 불러오기 |
| `public/songs/order.json` | 곡 목록 화면의 곡 순서(난이도마다 잘 만들어진 곡이 먼저). 그림을 나누는 순서인 `index.json`과 따로 둔다 |
| `public/pictures/*.svg` | 한붓그리기 그림. 파일마다 한 줄로 이어진 선 하나 |
| `public/pictures/logo.svg` | 제목 글자. 그림 목록(`PICTURES`)에는 넣지 않는다 |
| `src/path.ts` | 노트 시간으로 길(칸의 위치, 크레파스가 도는 각도, 선 굵기)을 만든다. 길이 그림을 따라가게 하고, 마지막 노트에서 그림이 끝나도록 그림 크기를 맞춘다 |
| `src/pictures.ts` | 그림 목록과, 채보의 리듬에 가장 잘 맞는 그림 고르기 |
| `src/drawing.ts` | 그림 파일을 읽어 선을 점으로 바꾼다 |
| `src/guide.ts` | 그림을 길 크기에 맞춰 일정한 간격의 점으로 놓고, 길이 따라갈 수 있게 작은 고리를 편 줄을 따로 만든다 |
| `src/sections.ts` | 곡을 16박 구간으로 나눠 구간마다 선 색과 카메라 움직임(거리, 기울기, 옆으로 미끄러짐)을 정한다 |
| `src/judge.ts` | 판정, 점수, 콤보, 노트별 판정 기록 |
| `src/audio.ts` | 재생과 곡 시간 계산, 브라우저마다 다른 mp3 디코딩 차이 맞추기, 곡마다 다른 녹음 크기 맞추기(큰 곡은 줄여서 틂), `?tick`의 톡 소리 |
| `src/track.ts` | 플레이 화면 그리기 (앞길, 도는 크레파스, 타격 효과, 콤보 효과, 점수, 끝날 때 멀어지는 장면) |
| `src/crayon.ts` | 크레파스 모양과 종이 결 그리기 (플레이 화면, 결과 화면, 인트로가 함께 쓴다) |
| `src/intro.ts` | 인트로: 크레파스가 제목을 한 글자씩 쓰기, LIVE 표시등 |
| `src/embroidery.ts` | 크레파스 선과 낙서, 바탕의 결 그리기, 선을 당겨 그림 선 위로 모으기, 그림 전체를 화면에 맞추는 계산 (파일 이름은 바느질 때 그대로) |
| `src/result-screen.ts` | 결과 화면 그리기 (완성된 그림 + 점수) |
| `src/canvas.ts` | 색과 그리기 도우미 |
| `src/render.ts` | 캔버스 크기 맞춤과 화면 선택 |
| `src/title.ts` | 처음 화면의 글자와 시작 버튼. 제목 로고는 그 뒤의 캔버스에 `src/intro.ts`가 그린다 (글자로 된 이름은 이 파일의 `GAME_NAME`) |
| `src/tutorial.ts` | 하는 법 화면 (누르는 순간을 보여 주는 그림과 큰 분홍 점, 큰 하늘 점, 보라 고리 설명) |
| `src/menu.ts` | 곡 목록 화면 (난이도 탭과 그 난이도의 곡들, 음량 막대) |
| `src/main.ts` | 입력과 화면 전환 |

## 이전 버전

반원으로 놓인 버튼 5개를 누르던 버전은 git 커밋 `20c8d8a`에 저장되어 있다.
