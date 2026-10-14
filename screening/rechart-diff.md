# 재채보 비교 (rhythm-fit-screening 할 일 10)

60곡을 지금 채보 규칙(최소 간격 125 ms, 4% 넘게 줄면 연타 유지, 3분 박자 격자, 길 1/12 반올림)으로 `pnpm chart` 로 다시 만든 결과.
이전 채보는 이 커밋 직전의 `public/songs/<id>/chart.json`, 이전 격자는 할 일 9 기록대로 모두 4.

- 곡 수: 60
- 노트 합계: 29254 → 28892
- 박자 판정(check_timing) 통과: 60 → 60
- 96% 미만으로 줄어든 곡: desert-of-lost-souls, freddys-menagerie, getting-it-done, ruby-4
  - 사용자 결정 2026-10-14: 96% 기준은 strict 곡에만 적용하고 run_exempt 곡은 노트가 줄어도 새 채보를 받아들인다 (desert-of-lost-souls 95.2%, getting-it-done 95.5%, ruby-4 95.4%, freddys-menagerie 90.8% 수용). ruby-4 는 125 ms 미만 간격이 없어 간격 규칙과 무관하게 줄었고(1·2·3안 모두 95.4%), freddys-menagerie 는 격자 4 라 줄어든 몫은 간격 규칙에서 나왔다.
- 격자가 바뀐 곡: 없음 (60곡 모두 4)
- 125 ms 미만 간격이 남은 곡 (할 일 18 의 run_exempt: 사용자 결정 2026-10-14, 연타 안의 간격은 그대로 둠): desert-of-lost-souls (run_exempt, 10개, 최소 0.1103 s), freddys-menagerie (run_exempt, 89개, 최소 0.1116 s), friend-to-friend (run_exempt, 63개, 최소 0.1122 s), getting-it-done (run_exempt, 18개, 최소 0.1107 s), laserpack (run_exempt, 58개, 최소 0.1144 s), occupy-the-dance-floor (run_exempt, 145개, 최소 0.1096 s), show-your-moves (run_exempt, 75개, 최소 0.1102 s), wretched-destroyer (run_exempt, 38개, 최소 0.1068 s)

| 곡 | 노트 전 → 후 (유지) | BPM 전 → 후 | 격자 전 → 후 | 125 ms 미만 간격 전 → 후 | 최소 간격 전 → 후 (s) | 옮김 / 지움 | 간격 규칙 | 박자 판정 전 → 후 | 난이도 전 → 후 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 8bit-dungeon-boss | 686 → 659 (96.1%) | 134.0 → 134.0 | 4 → 4 | 77 → 0 | 0.1118 → 0.2233 | 25 / 27 | strict | ok 88% → ok 91% | hard → hard |
| adventures-of-yuki | 550 → 549 (99.8%) | 139.0 → 139.0 | 4 → 4 | 0 → 0 | 0.2146 → 0.2146 | 117 / 1 | strict | ok 100% → ok 100% | hard → hard |
| aerosol-of-my-love | 239 → 238 (99.6%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2991 → 0.2992 | 57 / 1 | strict | ok 93% → ok 95% | easy → easy |
| battle-of-the-void | 305 → 309 (101.3%) | 97.0 → 97.0 | 4 → 4 | 0 → 0 | 0.3084 → 0.3081 | 87 / 0 | strict | ok 97% → ok 96% | easy → easy |
| blippy-trance | 202 → 202 (100.0%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2996 → 0.2997 | 0 / 0 | strict | ok 100% → ok 100% | easy → easy |
| boss-3-this-is-the-time-to-glisten | 269 → 272 (101.1%) | 90.0 → 90.0 | 4 → 4 | 0 → 0 | 0.3319 → 0.3319 | 22 / 0 | strict | ok 100% → ok 99% | easy → easy |
| breakdown | 695 → 687 (98.8%) | 140.0 → 140.0 | 4 → 4 | 6 → 0 | 0.1071 → 0.2124 | 235 / 8 | strict | ok 97% → ok 97% | hard → hard |
| c-funk | 478 → 482 (100.8%) | 117.0 → 117.0 | 4 → 4 | 0 → 0 | 0.1282 → 0.1282 | 24 / 0 | strict | ok 96% → ok 96% | normal → normal |
| captain-glouglou-contest | 352 → 350 (99.4%) | 120.02 → 120.02 | 4 → 4 | 0 → 0 | 0.2480 → 0.2480 | 75 / 2 | strict | ok 99% → ok 99% | hard → hard |
| carnivale-intrigue | 337 → 336 (99.7%) | 94.99 → 95.0 | 4 → 4 | 0 → 0 | 0.3124 → 0.3122 | 146 / 1 | strict | ok 99% → ok 99% | easy → easy |
| coffee | 384 → 382 (99.5%) | 96.67 → 96.67 | 4 → 4 | 0 → 0 | 0.3076 → 0.3076 | 18 / 2 | strict | ok 97% → ok 97% | easy → easy |
| covered-in-oil | 772 → 765 (99.1%) | 123.85 → 123.85 | 4 → 4 | 1 → 0 | 0.1231 → 0.2310 | 466 / 7 | strict | ok 94% → ok 95% | hard → hard |
| cretaceous-dawn | 436 → 424 (97.2%) | 96.09 → 96.09 | 4 → 4 | 0 → 0 | 0.1483 → 0.3069 | 201 / 12 | strict | ok 93% → ok 94% | easy → easy |
| desert-of-lost-souls | 703 → 669 (95.2%) | 134.0 → 134.0 | 4 → 4 | 83 → 10 | 0.1103 → 0.1103 | 79 / 34 | run_exempt | ok 99% → ok 99% | hard → hard |
| dubakupado | 591 → 583 (98.6%) | 115.0 → 115.0 | 4 → 4 | 0 → 0 | 0.1304 → 0.1305 | 77 / 8 | strict | ok 97% → ok 97% | normal → normal |
| electro-cabello | 526 → 523 (99.4%) | 117.0 → 117.0 | 4 → 4 | 0 → 0 | 0.2512 → 0.2554 | 55 / 3 | strict | ok 96% → ok 96% | normal → normal |
| enter-the-party | 512 → 515 (100.6%) | 120.0 → 120.0 | 4 → 4 | 1 → 0 | 0.1249 → 0.1250 | 127 / 0 | strict | ok 100% → ok 100% | normal → normal |
| fantasia-fantasia | 418 → 413 (98.8%) | 118.0 → 118.0 | 4 → 4 | 0 → 0 | 0.1270 → 0.1271 | 3 / 5 | strict | ok 92% → ok 92% | normal → normal |
| forever-believe | 484 → 475 (98.1%) | 120.99 → 120.99 | 4 → 4 | 0 → 0 | 0.2436 → 0.2438 | 105 / 9 | strict | ok 100% → ok 100% | normal → normal |
| freddys-menagerie | 835 → 758 (90.8%) | 134.0 → 134.0 | 4 → 4 | 196 → 89 | 0.1112 → 0.1116 | 251 / 77 | run_exempt | ok 94% → ok 94% | hard → hard |
| friend-to-friend | 534 → 527 (98.7%) | 129.85 → 129.85 | 4 → 4 | 70 → 63 | 0.1122 → 0.1122 | 0 / 7 | run_exempt | ok 98% → ok 98% | hard → hard |
| funkorama | 379 → 374 (98.7%) | 101.0 → 101.0 | 4 → 4 | 0 → 0 | 0.2958 → 0.2959 | 62 / 5 | strict | ok 97% → ok 97% | easy → easy |
| funky-chunk | 644 → 640 (99.4%) | 115.0 → 115.0 | 4 → 4 | 0 → 0 | 0.1304 → 0.1303 | 143 / 4 | strict | ok 95% → ok 94% | normal → normal |
| funky-pop | 437 → 430 (98.4%) | 120.99 → 120.99 | 4 → 4 | 0 → 0 | 0.2469 → 0.2472 | 40 / 7 | strict | ok 94% → ok 94% | hard → normal |
| game-travel-1 | 286 → 283 (99.0%) | 93.1 → 93.1 | 4 → 4 | 0 → 0 | 0.3115 → 0.3174 | 114 / 3 | strict | ok 99% → ok 100% | normal → normal |
| getting-it-done | 783 → 748 (95.5%) | 135.0 → 135.0 | 4 → 4 | 41 → 18 | 0.1110 → 0.1107 | 161 / 35 | run_exempt | ok 95% → ok 96% | hard → hard |
| glitter-blast | 381 → 382 (100.3%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2903 → 0.2976 | 45 / 0 | strict | ok 99% → ok 99% | easy → easy |
| groundwork | 290 → 290 (100.0%) | 102.0 → 102.0 | 4 → 4 | 0 → 0 | 0.2920 → 0.2924 | 105 / 0 | strict | ok 95% → ok 94% | easy → easy |
| jenifer-the-game | 768 → 761 (99.1%) | 120.0 → 120.0 | 4 → 4 | 0 → 0 | 0.2296 → 0.2438 | 274 / 7 | strict | ok 98% → ok 98% | hard → hard |
| jupiter | 281 → 279 (99.3%) | 90.0 → 90.0 | 4 → 4 | 0 → 0 | 0.3330 → 0.3330 | 35 / 2 | strict | ok 100% → ok 100% | easy → easy |
| laserpack | 701 → 692 (98.7%) | 127.96 → 127.96 | 4 → 4 | 75 → 58 | 0.1144 → 0.1144 | 10 / 9 | run_exempt | ok 95% → ok 95% | hard → hard |
| level-4-first-infiltration-in-unresponsible-tech | 602 → 599 (99.5%) | 143.01 → 143.01 | 4 → 4 | 0 → 0 | 0.2094 → 0.2092 | 12 / 3 | strict | ok 98% → ok 99% | hard → hard |
| looking-for-ammunition | 340 → 334 (98.2%) | 120.0 → 120.0 | 4 → 4 | 0 → 0 | 0.2490 → 0.2493 | 97 / 6 | strict | ok 98% → ok 99% | normal → normal |
| loopster | 450 → 455 (101.1%) | 108.0 → 108.0 | 4 → 4 | 0 → 0 | 0.1389 → 0.1389 | 103 / 0 | strict | ok 98% → ok 98% | normal → normal |
| mutant-club | 523 → 519 (99.2%) | 139.99 → 139.99 | 4 → 4 | 1 → 0 | 0.1072 → 0.2136 | 108 / 4 | strict | ok 98% → ok 99% | hard → hard |
| no-frills-comparsa | 418 → 417 (99.8%) | 115.0 → 115.0 | 4 → 4 | 0 → 0 | 0.1303 → 0.1298 | 47 / 1 | strict | ok 98% → ok 98% | normal → normal |
| no-war | 338 → 338 (100.0%) | 95.0 → 95.0 | 4 → 4 | 0 → 0 | 0.3144 → 0.3149 | 109 / 0 | strict | ok 99% → ok 99% | easy → easy |
| occupy-the-dance-floor | 742 → 743 (100.1%) | 135.97 → 136.0 | 4 → 4 | 147 → 145 | 0.1050 → 0.1096 | 559 / 0 | run_exempt | ok 88% → ok 89% | hard → hard |
| pensive-adventure | 433 → 431 (99.5%) | 95.07 → 95.07 | 4 → 4 | 0 → 0 | 0.3012 → 0.3149 | 53 / 2 | strict | ok 100% → ok 100% | normal → normal |
| pookatori-and-friends | 815 → 811 (99.5%) | 124.0 → 124.0 | 4 → 4 | 0 → 0 | 0.2388 → 0.2407 | 48 / 4 | strict | ok 99% → ok 99% | hard → hard |
| protofunk | 636 → 635 (99.8%) | 113.2 → 113.2 | 4 → 4 | 0 → 0 | 0.2601 → 0.2639 | 143 / 1 | strict | ok 99% → ok 99% | normal → normal |
| punk-rock-metal | 295 → 291 (98.6%) | 110.0 → 110.0 | 4 → 4 | 0 → 0 | 0.1363 → 0.1364 | 47 / 4 | strict | ok 99% → ok 100% | normal → normal |
| rubix-cube | 349 → 346 (99.1%) | 89.99 → 89.99 | 4 → 4 | 0 → 0 | 0.3321 → 0.3328 | 72 / 3 | strict | ok 99% → ok 99% | easy → easy |
| ruby-4 | 305 → 291 (95.4%) | 86.0 → 86.0 | 4 → 4 | 0 → 0 | 0.3486 → 0.3482 | 35 / 14 | run_exempt | ok 100% → ok 100% | easy → easy |
| show-your-moves | 887 → 872 (98.3%) | 136.0 → 136.0 | 4 → 4 | 106 → 75 | 0.1102 → 0.1102 | 46 / 15 | run_exempt | ok 88% → ok 89% | hard → hard |
| special-spotlight | 661 → 650 (98.3%) | 126.0 → 126.0 | 4 → 4 | 24 → 0 | 0.1190 → 0.2380 | 10 / 11 | strict | ok 96% → ok 97% | hard → hard |
| street-party | 509 → 507 (99.6%) | 114.0 → 114.0 | 4 → 4 | 0 → 0 | 0.1315 → 0.1313 | 212 / 2 | strict | ok 93% → ok 92% | normal → normal |
| sunday-dub | 400 → 404 (101.0%) | 102.0 → 102.0 | 4 → 4 | 0 → 0 | 0.2939 → 0.2923 | 16 / 0 | strict | ok 94% → ok 94% | easy → easy |
| sunny-afternoon | 214 → 212 (99.1%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2998 → 0.2998 | 2 / 2 | strict | ok 100% → ok 100% | easy → easy |
| tafi-maradi-no-voice | 561 → 554 (98.8%) | 133.0 → 133.0 | 4 → 4 | 28 → 0 | 0.1121 → 0.2218 | 318 / 7 | strict | ok 98% → ok 99% | hard → hard |
| tech-live | 695 → 694 (99.9%) | 124.0 → 124.0 | 4 → 4 | 0 → 0 | 0.2398 → 0.2385 | 241 / 1 | strict | ok 100% → ok 100% | normal → normal |
| the-adventure | 127 → 124 (97.6%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2997 → 0.2997 | 0 / 3 | strict | ok 98% → ok 98% | easy → easy |
| the-final-road | 406 → 400 (98.5%) | 115.11 → 114.89 | 4 → 4 | 0 → 0 | 0.1302 → 0.2596 | 121 / 6 | strict | ok 96% → ok 96% | normal → normal |
| the-road-we-use-to-travel | 482 → 491 (101.9%) | 130.08 → 129.88 | 4 → 4 | 4 → 0 | 0.1153 → 0.2257 | 162 / 0 | strict | ok 93% → ok 94% | hard → hard |
| to-fight-a-spell-by-dancing | 227 → 224 (98.7%) | 100.0 → 100.0 | 4 → 4 | 0 → 0 | 0.2980 → 0.2980 | 43 / 3 | strict | ok 97% → ok 96% | easy → easy |
| video-games | 194 → 194 (100.0%) | 95.0 → 95.0 | 4 → 4 | 0 → 0 | 0.3148 → 0.3148 | 19 / 0 | strict | ok 97% → ok 96% | easy → easy |
| voltaic | 621 → 615 (99.0%) | 120.0 → 120.0 | 4 → 4 | 0 → 0 | 0.1250 → 0.2442 | 200 / 6 | strict | ok 97% → ok 98% | normal → normal |
| wallpaper | 361 → 359 (99.4%) | 93.0 → 93.0 | 4 → 4 | 0 → 0 | 0.3221 → 0.3219 | 29 / 2 | strict | ok 98% → ok 98% | easy → easy |
| wretched-destroyer | 623 → 610 (97.9%) | 140.0 → 140.0 | 4 → 4 | 63 → 38 | 0.1064 → 0.1068 | 368 / 13 | run_exempt | ok 98% → ok 98% | normal → normal |
| your-call | 782 → 775 (99.1%) | 120.0 → 120.0 | 4 → 4 | 0 → 0 | 0.2472 → 0.2489 | 75 / 7 | strict | ok 100% → ok 100% | normal → normal |

옮김 / 지움: 1 ms 안에 짝이 없는 이전 노트와 새 노트를 짝지어 옮김으로, 남는 이전 노트를 지움으로 센 값(`make_chart.gap_report` 와 같은 셈, 박자 정렬 차이로 모든 노트가 1 ms 미만 움직인 것은 빼고 셈).
