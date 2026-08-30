# CAPTION PLAN CONTRACT
# Excerpt — Kinetic Caption Planning (Step 9)

> **Status**: COMPLETE
> The Caption Planning subsystem has been implemented in `@excerpt/clipping-core`. This layer computes mathematically precise, culturally aware text boundaries and overrides aggressive styles if readability drops below human limits.

## 1. Complex Script Handling (RTL / CJK)

English whitespace-splitting is not assumed universally.
- **RTL Engines**: The `LanguageUtils` engine natively detects Arabic and Hebrew Unicode blocks. When detected, line-wrapping arrays are mathematically reversed. This ensures rendering engines paint the words right-to-left sequentially.
- **CJK Tokenization**: Chinese, Japanese, and Korean character blocks are detected to suppress naive whitespace delimitations, ensuring the engine respects semantic tokens rather than failing on 0-space character strings.

## 2. Style Degradation

Styles dictate typography math (like `Hormozi`, `Kinetic`, `Minimal`). 
The `CaptionPlanner` checks a style's supported scripts before binding. If an English-centric style (like `Hormozi`) is explicitly requested for a Japanese transcript, the engine gracefully degrades the plan to `MINIMAL`, logging a warning instead of producing illegible font artifacts.

## 3. The Readability Density Guard

Certain styles (like `Hormozi`) flash 1 or 2 words on the screen extremely fast.
If a speaker talks too fast (e.g., 10 words per second), rendering 1-word cards creates a physically unreadable strobe effect.

The `ReadabilityGuard` explicitly monitors the incoming Words-Per-Second (WPS) against the `CaptionStyleConfig.maxWordsPerSecond` ceiling. If the speaker exceeds the limit, the engine safely overrides the style's default grouping, compressing the fast speech into longer, multi-word blocks (held on screen longer) to preserve viewer comprehension.

## 4. Test Verification

5 explicit edge-cases in `captions.test.ts` continuously assert the engine:
1. **English Baseline**: Standard 2-WPS speech correctly maps to 1-word cards in the Hormozi style and calculates the mathematical center of the safe zone.
2. **RTL Logic**: A mock Arabic string successfully forces the mathematical array reversal, putting the last word visually on the right.
3. **CJK Boundaries**: The engine correctly detects CJK characters and flags that it does not require space delimiters.
4. **Density Guard**: Simulating 15-WPS speech into a 4-WPS restricted style successfully forces the engine to merge words, preventing 13 individual cards from strobing in 1 second.
5. **Style Fallback**: Attempting to force a Japanese string into the `Hormozi` style successfully falls back to `Minimal` with a tracked warning.
