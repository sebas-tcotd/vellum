import type { Lang } from '../content/routes';

/** Which file a shot shows, chosen among the names on disk (no extension). */
export type ShotFileChoice =
  | { kind: 'final' | 'stand-in'; name: string }
  | { kind: 'missing' };

/**
 * The final file in the page language wins (`<file>-<lang>`), then the
 * language-neutral final file, then the stand-in; otherwise the shot is
 * missing. Pure, so it is unit-tested without the build.
 */
export function pickShotFile(
  shot: { file: string; standIn?: { file: string } | undefined },
  lang: Lang,
  finals: readonly string[],
  standIns: readonly string[],
): ShotFileChoice {
  for (const name of [`${shot.file}-${lang}`, shot.file])
    if (finals.includes(name)) return { kind: 'final', name };
  if (shot.standIn && standIns.includes(shot.standIn.file))
    return { kind: 'stand-in', name: shot.standIn.file };
  return { kind: 'missing' };
}
