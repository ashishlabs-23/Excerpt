import fs from 'fs';
import { KineticCaptionGenerator, CaptionPreset } from './kineticCaptionGenerator';

export class CaptionService {
    private kineticGenerator = new KineticCaptionGenerator();

    generateASS(
        words: {start: number; end: number; word: string}[],
        outputPath: string,
        preset: CaptionPreset | string = 'hormozi',
        clipDurationSec?: number
    ) {
        this.kineticGenerator.generateASS(words, outputPath, preset, clipDurationSec);
    }
}

