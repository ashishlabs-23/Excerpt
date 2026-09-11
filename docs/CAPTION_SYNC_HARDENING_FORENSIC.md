# Forensic Analysis: Caption Desynchronization & Source Quality Degradation

**Document ID**: P0-CAPTION-SYNC-FORENSIC  
**Date**: 2026-09-10  
**Status**: Root Cause Isolated & Remediated  

---

## 1. Executive Summary
An investigation into user reports ("error too many captions are not correct and video quality is poor") uncovered three compounding defects in the Excerpt media engine:
1. **+3.000s FFmpeg Seek Lead Error**: In `videoProcessor.ts`, a two-stage seeking routine (`preSeek = start - 3` before `-i` and `fineSeek = 3` after `-i`) caused `-filter_complex` and `-vf` to decode frames starting 3 seconds earlier than requested, shifting all subtitles by 3 seconds and truncating speech at the end of every clip.
2. **Boundary Word Pollution & 0.000s Clamping**: `videoWorker.ts` and `renderWorker.ts` allowed words preceding `clipStart` (from previous sentences) to enter `clipWords`, where they were clamped to `0.000s`. Because words were not chronologically sorted, tail syllables of prior sentences appeared as the first subtitle words of the new clip.
3. **Silent 360p Fallback on YouTube Streams**: `DownloadEngine.ts` fell back to `best[height<=cap]/best`, which matched YouTube's format 18 (640×360 @ 459 kbps). Cropping a 9:16 slice (202×360) and scaling to 1080×1920 resulted in severe pixelation and artifacting.

---

## 2. Deep Dive: The FFmpeg Two-Stage Seeking Bug

### 2.1 The Code
In `apps/api/src/services/videoProcessor.ts` (historical):
```typescript
const preSeek = Math.max(0, start - 3);
const fineSeek = Number((start - preSeek).toFixed(3));

const inputs: string[] = [];
if (preSeek > 0) inputs.push('-ss', String(preSeek));
inputs.push('-i', inputPath);
if (fineSeek > 0) inputs.push('-ss', String(fineSeek));
inputs.push('-t', String(duration));
```

### 2.2 Why It Failed
In FFmpeg CLI syntax:
- Options preceding `-i <file>` are **input options** applying to that input file.
- Options placed after `-i <file>` and before `-filter_complex` or output arguments are **output-level options**.
- However, when `-filter_complex` or `-vf` is present, the filtergraph decodes streams directly from the demuxer. The demuxer sought to `preSeek` (`start - 3`).
- Inside `-filter_complex`:
  ```text
  [0:v]crop=...,setpts=PTS-STARTPTS[v_cropped];[v_cropped]ass='subs.ass'[v_caps]
  ```
  `setpts=PTS-STARTPTS` resets the presentation timestamp to `0.000s` at the **first frame decoded** — which was at `start - 3`!
- The ASS subtitle script generated subtitles where `t = 0.000s` corresponds to `start`.
- Therefore, subtitle word 0 was rendered onto the video frame at `start - 3.000s`, exactly 3 seconds before the speaker actually said it.
- Furthermore, when B-roll overlays were included, `inputs.push('-i', clip.videoPath)` appended `-i` after `-ss fineSeek -t duration`, inadvertently applying `-ss 3.0 -t duration` to the **B-roll input file**, corrupting the B-roll overlay timing.

### 2.3 The Canonical Fix
```text
-accurate_seek -ss <start> -i <inputPath> -t <duration>
```
With explicit timestamp normalization in the filtergraph:
```text
[0:v]...,setpts=PTS-STARTPTS[v_out]
[0:a]asetpts=PTS-STARTPTS[a_out]
```
and output duration constraint `-t <duration>` before the output URL.

---

## 3. Deep Dive: Word Boundary Intersection & Clamping

### 3.1 The Code
In `renderWorker.ts` (historical):
```typescript
const isWordsAbsolute = clipStart > 2.0 && wordsToCaption.some((w: any) => typeof w.start === 'number' && w.start >= (clipStart * 0.5));
const relativeWords = wordsToCaption.map((w: any) => {
  const startOffset = isWordsAbsolute
    ? Math.max(0, Number((rawStart - clipStart).toFixed(3)))
    : Math.max(0, Number(rawStart.toFixed(3)));
  ...
});
```

### 3.2 Why It Failed
1. If `clipStart <= 2.0`, `isWordsAbsolute` evaluated to `false`, leaving absolute timestamps (e.g. 1.8s) unadjusted.
2. In job `3c7758`, clip 0 started at `238.10s`. The words array contained:
   - Word 0: `"butt."` (start `238.28s`, end `238.54s` - segment tail from prior speech)
   - Word 1: `"We're"` (start `237.94s`, end `238.80s` - first word of thesis clause)
3. For `"We're"`, `rawStart - clipStart = 237.94 - 238.10 = -0.16s`.
   `Math.max(0, -0.16) = 0.000s`.
4. Because the words were not sorted chronologically by `start`, `"butt."` (0.18s) was followed by `"We're"` (0.00s).
5. `KineticCaptionGenerator` enforce-order logic clamped `"We're"` after `"butt."`, flashing `"BUTT. WE'RE"` at the clip opening.

### 3.3 The Canonical Intersection Rule
A source word belongs to a clip if and only if it has positive temporal overlap with `[clipStart, clipEnd]`:
$$\text{word.end} > \text{clipStart} \quad \land \quad \text{word.start} < \text{clipEnd}$$
Relative timestamps must be clamped strictly within the clip:
$$\text{relativeStart} = \max(0, \text{word.start} - \text{clipStart})$$
$$\text{relativeEnd} = \min(\text{duration}, \text{word.end} - \text{clipStart})$$
Reject any word where $\text{relativeEnd} \le \text{relativeStart}$.
All words must be sorted ascending by original source start timestamp prior to ASS emission.

---

## 4. Deep Dive: Silent 360p Source Degradation

### 4.1 The Mechanism
1. `DownloadEngine.ts` used a fallback chain ending with:
   ```text
   best[height<=${cap}]/best
   ```
2. In YouTube's format architecture, format 18 is a pre-merged 640×360 stream.
3. When standalone DASH extraction failed (due to YouTube's player API changes rejecting outdated yt-dlp versions with HTTP 403), `DownloadEngine` tried `web_embedded`.
4. `web_embedded` only exposes format 18 (360p) for non-embeddable videos.
5. The format selector happily accepted format 18 because `360 <= 1080` matches `best[height<=1080]`.
6. Neither `DownloadEngine` nor `YouTubeAcquisitionAdapter` inspected the resulting video stream height.

### 4.2 The Architectural Remediation
Separate **Acquisition Strategy** from **Format Resolution**:
1. Strategy manages network transport, client emulations, and cookies.
2. `FormatResolver` inspects all available format streams from metadata:
   - If formats $\ge 1080\text{p}$ exist $\to$ select highest bitrate $1080\text{p}$.
   - Else if formats $\ge 720\text{p}$ exist $\to$ select $720\text{p}$.
   - Else if source max height $< 720\text{p}$ $\to$ explicitly mark `LOW_SOURCE_RESOLUTION`.
3. Never silently download 360p when $\ge 720\text{p}$ is present in the format catalog.
4. Update yt-dlp to latest stable release and capture runtime telemetry (`selectedHeight`, `selectedWidth`, `selectedFormatId`, `ytDlpVersion`).
