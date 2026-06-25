import fs from 'fs';
import { KineticCaptionGenerator } from './kineticCaptionGenerator';

export class CaptionService {
    private kineticGenerator = new KineticCaptionGenerator();

    generateASS(words: {start: number; end: number; word: string}[], outputPath: string) {
        this.kineticGenerator.generateASS(words, outputPath);
    }
}

