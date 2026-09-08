# Current External Dependency Research & Constraints

**Document Status:** Approved Research Baseline  
**Scope:** YouTube Acquisition, FFmpeg Filtergraph Architecture, libass Rendering, and Web Playback Standards.  
**Date:** September 2026

---

## 1. YouTube Acquisition & PO-Token / Client Architecture

### 1.1 Current YouTube Security Behavior
YouTube enforces cryptographic **Proof of Origin (PO) Tokens** (via Botguard/DeviceCheck/Play Integrity) on requests to prevent automated scraping and non-player streaming:
- **Player Context (`web.player`, `mweb.player`, `android.player`, `ios.player`):** Innertube API queries returning video metadata and streaming format manifests.
- **GVS Context (`web.gvs`, `mweb.gvs`):** Google Video Server requests pulling raw DASH segments and media chunks.
- **`sabr=1` / Service Integrity:** Modern client payloads require `serviceIntegrityDimensions.poToken` inside `v1/player` request bodies to yield playable video URLs without HTTP 403 Forbidden.

### 1.2 Deprecated vs. Modern yt-dlp Extractor Configuration
| Pattern | Deprecated / Broken Assumption | Modern 2026 Production Standard |
|---|---|---|
| **Client Ladder** | Static array `['android', 'ios', 'mweb', 'web']` falling back blindly upon 403. | **Capability & Context-Aware Router**: Evaluate IP origin (datacenter vs residential), availability of JS runtime / PO token provider, and video type before dispatch. |
| **PO Token Provisioning** | Omitting PO tokens and assuming iOS/Android clients remain permanently exempt. | Provisioning PO tokens via `--extractor-args "youtube:po_token=web.gvs+<TOKEN>,web.player+<TOKEN>"` or dynamic PO token providers (`yt-dlp-getpot-wpc` / headless provider). |
| **Session Lifetime** | Assuming tokens last indefinitely across videos. | PO tokens are bound to session and client IP; must be regenerated on TTL expiry or on HTTP 403 / 429 response. |

### 1.3 Target Architecture: Adaptive Acquisition Router
```
YouTube URL Ingestion
        ↓
Environment & Capability Detection
  - Datacenter vs Residential IP?
  - PO Token Provider daemon active?
  - Session cookies mounted?
        ↓
Strategy Selection Matrix:
  1. PO-Token Provider (Web/MWeb with dynamic minting)
  2. TV / TV-Embedded Client (lightweight token requirements)
  3. iOS / Android Mobile Client (native Innertube signature)
  4. Web-Cookies Session Vault
        ↓
Acquisition & Bitstream Integrity Check
```

---

## 2. FFmpeg Filtergraph Architecture & Capability Matrix

### 2.1 The Single-Pass Optimization Principle
> **Rule:** *Single-pass filtergraph consolidation is an efficiency optimization; correctness and semantic preservation are invariants.*

### 2.2 Capability Matrix of Render Stages
| Stage | FFmpeg Implementation | Graph Primitive | Hardware (CUDA/NVENC) Constraint | Single-Pass Coexistence |
|---|---|---|---|---|
| **1. Temporal Cut** | `-ss <pre> -i <in> -ss <fine> -t <dur>` | Demuxer / Input Flags | Stream-level seeking; zero filter impact. | **Compatible** |
| **2. Dynamic Reframe / Crop** | `scale=W:H:flags=bicubic,crop=w:h:x:y,setsar=1` | Video Filter (`-vf` or `-filter_complex`) | Requires RAM frames; CUDA requires `hwdownload` or software decoding. | **Compatible** (forms base layer) |
| **3. Dual-Speaker Split** | `split[s1][s2];[s1]...[top];[s2]...[bot];[top][bot]vstack` | Complex Filtergraph | Multiple sub-branches; must terminate in a single tagged output. | **Compatible** |
| **4. Contextual B-Roll** | `overlay=x:y:enable='between(t,s,e)'` | Multiple Inputs + Filtergraph | B-roll inputs (`-i broll1.mp4`) must be scaled and alpha-faded before overlay. | **Compatible** (applied to cropped base) |
| **5. Subtitles / Kinetic Captions** | `ass='<escaped_path>'` (via `libass`) | Video Filter | **CPU only**. Reads text and renders raster bitmaps into planar YUV frames. | **Compatible** (applied after B-roll) |
| **6. Hook Card & Progress Bar** | `drawbox=...`, `drawtext=...` | Video Filter | **CPU only**. Requires system font file or fontconfig. | **Compatible** (applied on final raster) |
| **7. Audio Dynamic Range & Loudness** | `highpass=f=80,afade=...,loudnorm=I=-16:TP=-1.5:LRA=11` | Audio Filter (`-af`) | Runs on audio stream `[0:a]`. Independent of video filtergraph. | **Compatible** |
| **8. Video Thumbnail** | `scale=360:-1,format=yuv420p` @ poster time | Secondary Output or Derived Extraction | Extracting thumbnail simultaneously requires `-map` branch or separate 1-frame probe. | **Derived Operation** (Probe at `poster_time` after video is rendered, or via secondary output) |

### 2.3 Hardware Acceleration Bottleneck
- `subtitles`, `ass`, `drawtext`, and `overlay` are **software filters** operating in system RAM (Host CPU memory).
- If NVENC (`-c:v h264_nvenc`) is used, decoding can occur on GPU, but frames must be transferred via `hwdownload,format=nv12` for filtering, then uploaded via `hwupload_cuda` for encode.
- In multi-tenant environments without dedicated GPUs (or standard x86 CPU nodes), `libx264` with `-preset fast` (Quality) or `-preset veryfast` (Draft) provides maximum stability, determinism, and zero memory bus bottleneck.

---

## 3. libass Subtitle Rendering & Path Escaping

### 3.1 The "Escaping Hell" on Windows
FFmpeg's filter parser treats `:` as an option delimiter and `\` as an escape delimiter. On Windows, a standard absolute path such as `C:\temp\job-1\subs.ass` fails with:
`[AVFilterGraph @ 00000...] Unable to parse option value "C:\temp\job-1\subs.ass"`

### 3.2 Canonical Escaping Contract
1. Replace all backslashes `\` with forward slashes `/`.
2. Escape the drive letter colon `:` with double backslash `\\:`.
3. Escape single quotes `'` as `\\\'`.
4. Wrap the path in single quotes inside the filter argument:
   ```typescript
   const safeAssPath = path.resolve(assPath)
     .replace(/\\/g, '/')
     .replace(/:/g, '\\:')
     .replace(/'/g, "\\\\'");
   const filter = `ass='${safeAssPath}'`;
   ```

---

## 4. Web Playback & Streaming Standards (Browser Target)

To guarantee instant playback, HTTP 206 partial range streaming, and zero client decoding failures across Chrome, Safari (iOS/macOS), Firefox, and Edge:

1. **Container & Metadata:**
   - Container: MP4 (`.mp4`).
   - Atom Placement: `-movflags +faststart`. The `moov` atom (metadata index) **must** precede `mdat` (movie data) at byte offset 0. Without faststart, browsers cannot start playback until the entire multi-megabyte file is downloaded.
2. **Video Stream:**
   - Codec: H.264 (`avc1`).
   - Profile: High Profile (`-profile:v high -level 4.2` or `4.1`).
   - Pixel Format: `yuv420p` (`-pix_fmt yuv420p`). YUV444 or 10-bit YUV causes immediate black screens or fatal decode errors in Safari and Firefox mobile.
   - Frame Rate: Constant Frame Rate (`-vsync cfr` or `-r 30/60`).
   - GOP Size: Closed GOP, `-g 60 -keyint_min 60` (enables seamless seeking at 1-2 second intervals).
3. **Audio Stream:**
   - Codec: AAC-LC (`-c:a aac`).
   - Sampling Rate: 48,000 Hz (`-ar 48000`).
   - Bitrate: 192 kbps (Draft) / 320 kbps (Quality).
   - Normalization: EBU R128 (`loudnorm=I=-16:TP=-1.5:LRA=11`), eliminating volume jumps between clips.

---

## 5. Engineering Constraints for Excerpt P0

1. **Per-Job Mode Invariance:** `generationMode: 'draft' | 'quality'` must originate at the client, persist in database queues, attach to `RenderPlan`, and control FFmpeg flags at render time.
2. **Single-Pass Primary Execution:** `VideoProcessor.renderSinglePassClip` must assemble Crop + B-Roll + Subtitles + Hook/Progress into a unified `-filter_complex` command.
3. **Graceful Degradation:** If any filtergraph branch encounters an unexpected syntax failure, the pipeline must log an error telemetry event and fail cleanly with `PipelineError(PipelineErrorCode.RenderFailed)` — never producing a corrupt zero-byte MP4.
4. **Mandatory FastStart & Stream Verification:** Every rendered file must have `-movflags +faststart` and pass an immediate `ffprobe` stream validation check (`streams.includes('video') && streams.includes('audio')`) before upload or cache registration.
