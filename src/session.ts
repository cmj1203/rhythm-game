import type { Difficulty, SongSummary } from "./chart";
import type { PlayState } from "./judge";
import type { Path } from "./path";
import type { Section } from "./sections";

/** 곡 한 판에 딸린 것. 준비·플레이·게임 오버·결과 화면이 이어받는다. */
export type Session = {
  readonly song: SongSummary;
  readonly difficulty: Difficulty;
  readonly pictureName: string;
  readonly sections: readonly Section[];
  readonly play: PlayState;
};

/** 화면 하나에서 다음 화면으로 넘길 한 판의 필드와 길. 화면 고유 필드(bursts, paused 등)는 옮기지 않는다. */
export function sessionOf(screen: Session & { readonly path: Path }): Session & { readonly path: Path } {
  const { song, difficulty, pictureName, sections, play, path } = screen;
  return { song, difficulty, pictureName, sections, play, path };
}
