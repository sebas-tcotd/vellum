/**
 * Desktop system of the visitor for the download band (EXPERIENCE.md ·
 * Detección de SO). Pure and self-contained: the band inlines its source.
 */

export type DetectedPlatform = 'windows' | 'macos' | 'linux';

export interface PlatformInput {
  userAgent: string;
  /** `navigator.userAgentData?.platform`, when the browser has it. */
  uaPlatform?: string | undefined;
  /** `navigator.userAgentData?.mobile`. */
  mobile?: boolean | undefined;
  /** `navigator.maxTouchPoints`. */
  maxTouchPoints: number;
}

/**
 * Returns the system to recommend, or `null` for phones, tablets (iPadOS
 * reports a Mac user agent with touch), ChromeOS and anything unknown.
 */
export function detectPlatform(input: PlatformInput): DetectedPlatform | null {
  const ua = input.userAgent;
  if (input.mobile || /Android|iPhone|iPad|iPod/i.test(ua)) return null;
  if (/CrOS/.test(ua) || /chrome ?os/i.test(input.uaPlatform ?? ''))
    return null;
  const platform = (input.uaPlatform || ua).toLowerCase();
  if (/win/.test(platform)) return 'windows';
  if (/mac/.test(platform)) return input.maxTouchPoints > 1 ? null : 'macos';
  if (/linux|x11/.test(platform)) return 'linux';
  return null;
}
