import { PerceptionFrame, TemporalPerceptionStream } from '@excerpt/clipping-core';

export class TemporalAligner {
  /**
   * Aligns multiple asynchronous engine outputs into a unified 10hz TemporalPerceptionStream.
   * Frame interval defaults to 100ms.
   */
  static align(
    durationMs: number,
    whisperxData: any[] | null,
    pyannoteData: any[] | null,
    yoloData: any[] | null,
    frameIntervalMs: number = 100
  ): TemporalPerceptionStream {
    const frames: PerceptionFrame[] = [];
    const numFrames = Math.ceil(durationMs / frameIntervalMs);

    for (let i = 0; i < numFrames; i++) {
      const timestampMs = i * frameIntervalMs;

      const frame: PerceptionFrame = {
        timestampMs,
        durationMs: frameIntervalMs,
        transcriptWords: { available: false, data: null },
        speaker: { available: false, data: null },
        faces: { available: false, data: null },
        persons: { available: false, data: null },
        objects: { available: false, data: null },
        scene: { available: false, data: null },
        motion: { available: false, data: null },
        audioEnergy: { available: false, data: null },
        pitch: { available: false, data: null },
        emotion: { available: false, data: null },
        visualSaliency: { available: false, data: null },
        cameraMotion: { available: false, data: null }
      };

      // Align WhisperX
      if (whisperxData) {
        frame.transcriptWords.available = true;
        const wordsInFrame = whisperxData.filter(
          w => timestampMs >= w.startMs && timestampMs < w.endMs
        );
        frame.transcriptWords.data = wordsInFrame.length > 0 ? wordsInFrame : [];
      }

      // Align Pyannote (Speaker Diarization)
      if (pyannoteData) {
        frame.speaker.available = true;
        const speakerAtTime = pyannoteData.find(
          s => timestampMs >= s.startMs && timestampMs < s.endMs
        );
        if (speakerAtTime) {
          frame.speaker.data = speakerAtTime.speaker;
        }
      }

      // Align YOLO (Objects/Persons)
      if (yoloData) {
        frame.objects.available = true;
        frame.persons.available = true;
        // YOLO might be 30fps, so we find the closest frame
        let closestYolo = null;
        let minDiff = Infinity;
        for (const y of yoloData) {
          const diff = Math.abs(y.timestampMs - timestampMs);
          if (diff < minDiff && diff < frameIntervalMs) {
            minDiff = diff;
            closestYolo = y;
          }
        }
        if (closestYolo) {
          frame.objects.data = closestYolo.objects || [];
          frame.persons.data = closestYolo.persons || [];
        } else {
          frame.objects.data = [];
          frame.persons.data = [];
        }
      }

      frames.push(frame);
    }

    return { frames };
  }
}
