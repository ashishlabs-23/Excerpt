/**
 * HookPlan.ts — Editorial opening hook specification for @excerpt/clipping-core.
 *
 * Treats hooks as structured edit plans (punch-ins, headlines, opening mode)
 * rather than simple text banners.
 */

export type OpeningMode =
  | 'cold_open'
  | 'context_first'
  | 'question'
  | 'claim'
  | 'reaction';

export interface HookPlan {
  sourceWindow: {
    start: number;
    end: number;
  };
  headline?: string;
  punchIn?: {
    enabled: boolean;
    fromScale: number;
    toScale: number;
    durationMs: number;
  };
  emphasis?: {
    words: string[];
    visualTreatment: string;
  };
  openingMode: OpeningMode;
}

export function createDefaultHookPlan(start: number, end: number, headline?: string): HookPlan {
  return {
    sourceWindow: {
      start,
      end: Math.min(start + 3.0, end),
    },
    headline,
    punchIn: {
      enabled: true,
      fromScale: 1.15,
      toScale: 1.0,
      durationMs: 400,
    },
    openingMode: 'claim',
  };
}
