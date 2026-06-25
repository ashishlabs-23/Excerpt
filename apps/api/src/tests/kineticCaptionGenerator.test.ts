import fs from 'fs';
import path from 'path';
import { KineticCaptionGenerator } from '../services/kineticCaptionGenerator';

describe('KineticCaptionGenerator', () => {
    let generator: KineticCaptionGenerator;
    const tempOutputFile = path.join(__dirname, 'temp_test_captions.ass');

    beforeEach(() => {
        generator = new KineticCaptionGenerator();
    });

    afterEach(() => {
        if (fs.existsSync(tempOutputFile)) {
            fs.unlinkSync(tempOutputFile);
        }
    });

    it('generates non-overlapping contiguous events', () => {
        const words = [
            { start: 1.0, end: 1.5, word: 'Welcome' },
            { start: 1.5, end: 1.8, word: 'to' },
            { start: 1.8, end: 2.1, word: 'the' },
            { start: 2.1, end: 2.5, word: 'show' }
        ];

        generator.generateASS(words, tempOutputFile);
        expect(fs.existsSync(tempOutputFile)).toBe(true);

        const content = fs.readFileSync(tempOutputFile, 'utf-8');
        const lines = content.split('\n');
        
        // Find Dialogue events
        const dialogueLines = lines.filter(l => l.startsWith('Dialogue:'));
        expect(dialogueLines.length).toBe(4);

        const timeIntervals: { start: string; end: string }[] = [];
        dialogueLines.forEach(line => {
            // Dialogue: 0,0:00:01.00,0:00:01.50,...
            const parts = line.split(',');
            const start = parts[1];
            const end = parts[2];
            timeIntervals.push({ start, end });
        });

        // Verify that the end of each line matches the start of the next line exactly
        for (let i = 0; i < timeIntervals.length - 1; i++) {
            expect(timeIntervals[i].end).toBe(timeIntervals[i+1].start);
        }
    });

    it('handles overlapping input start times by enforcing strictly increasing starts', () => {
        // Words starting at the same time
        const words = [
            { start: 1.0, end: 1.5, word: 'Welcome' },
            { start: 1.0, end: 1.8, word: 'to' },
            { start: 1.8, end: 2.1, word: 'the' }
        ];

        generator.generateASS(words, tempOutputFile);
        const content = fs.readFileSync(tempOutputFile, 'utf-8');
        const lines = content.split('\n');
        const dialogueLines = lines.filter(l => l.startsWith('Dialogue:'));
        
        const timeIntervals: { start: string; end: string }[] = [];
        dialogueLines.forEach(line => {
            const parts = line.split(',');
            timeIntervals.push({ start: parts[1], end: parts[2] });
        });

        // Verify no overlaps (each starts at the end of the previous one)
        for (let i = 0; i < timeIntervals.length - 1; i++) {
            expect(timeIntervals[i].end).toBe(timeIntervals[i+1].start);
        }
    });
});
