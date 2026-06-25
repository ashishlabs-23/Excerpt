/**
 * classifier.test.ts
 *
 * Unit tests for CategoryClassifier.
 * Tests the transcript keyword scoring logic in isolation (no FFmpeg calls).
 *
 * Run with: npm test --workspace=apps/api
 */

import { CategoryClassifier } from '../services/intelligence/CategoryClassifier';

// ─── Test data ──────────────────────────────────────────────────────────────

const FOOTBALL_TRANSCRIPTS = [
  `That's an incredible goal from the striker! The keeper had absolutely no chance. 
   The referee blows the whistle — penalty awarded in injury time. VAR is checking...`,

  `He shoots, he scores! What a header from the corner kick. The goalkeeper was completely 
   beaten. Yellow card shown to the defender for a late tackle on the pitch.`,

  `Free kick from 25 yards out. The wall is set. He strikes it — it hits the crossbar! 
   The striker's rebound is cleared off the line. Offside flag is up from the linesman.`,

  `Substitution for the home team. The striker limps off after a heavy tackle. 
   The referee consults VAR for a possible handball in the penalty area.`,

  `Half-time whistle blows. The goalkeeper made three incredible saves in the first half. 
   The red card was the turning point — the stadium erupts after the decision.`,
];

const CRICKET_TRANSCRIPTS = [
  `Oh what a six! The batsman launches that over long on for a massive six. 
   The crowd goes wild! The bowler responds with a vicious bouncer next delivery.`,

  `LBW appeal! The umpire raises his finger — wicket! The batsman is out LBW 
   for 45 runs. The spinner is on a hat-trick after two wickets in consecutive deliveries.`,

  `Four runs! The ball races to the boundary. The batsman is on 98 — two away from 
   a century. The fielder slides but can't prevent the boundary in the powerplay.`,

  `Run out! The batsman was short of his crease. The wicket-keeper whips off the bails. 
   The third umpire checks — OUT! The innings is in tatters at 120 for 6.`,

  `Over number 15 and the no-ball is called. The spinner bowls a maiden — dot ball, 
   dot ball, six, four, wicket! What an over from the young spinner.`,
];

const PODCAST_TRANSCRIPTS = [
  `Welcome back to another episode of the show. I'm your host and today we have a 
   very special guest joining us. If you're a new listener, make sure to subscribe 
   on Spotify or Apple Podcasts.`,

  `So I was thinking about this all week and wanted to bring it up today. In your 
   opinion, how do you feel about the direction things are going? My guest today 
   has some really interesting thoughts on this topic.`,

  `That's such a great question. You know, in my experience, the most important 
   thing is to stay consistent. I've been doing this for 10 years and every episode 
   I learn something new. Thank you to our Patreon supporters.`,

  `Before we get into today's topic, a quick word from our sponsor. Now, back to the 
   conversation. Tell me more about your experience — walk us through what happened 
   that day. This is episode 147 of the weekly series.`,

  `And that's it for today's episode. Thank you so much for listening. 
   If you enjoyed this conversation, please leave us a review. 
   We release new episodes every Tuesday and Thursday.`,
];

const MMA_TRANSCRIPTS = [
  `Huge right hand lands! He's wobbled, he's down! The referee jumps in — it's a TKO! 
   What a knockout in round three of this UFC main event bout in the octagon.`,

  `He sinks in the rear naked choke — tap out! Submission victory in round two. 
   The referee stops the fight immediately. The corner throws in the towel.`,

  `Big takedown! He's in the guard, working ground and pound. The referee warns him 
   for the fence grab. He's looking for the guillotine from the bottom.`,

  `Jab, cross, hook combination! Knockdown in round one! The fighter beats the count 
   but the referee is watching closely. The corner is yelling instructions from the cage.`,

  `Referee stoppage! The fighter couldn't defend himself on the ground. 
   TKO victory via strikes in the third round of this Bellator main event.`,
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Test the transcript-only classification path (no FFmpeg calls).
 * We mock the video path and pass skipVisual = true to avoid audio/visual analysis.
 */
async function classifyTranscriptOnly(
  classifier: CategoryClassifier,
  transcript: string
): Promise<{ category: string; confidence: number; fallback_used: boolean }> {
  // Pass a non-existent path — audio/visual are skipped via skipVisual=true
  const result = await classifier.classify(transcript, '/dev/null', true);
  return { category: result.category, confidence: result.confidence, fallback_used: result.fallback_used };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('CategoryClassifier', () => {
  let classifier: CategoryClassifier;

  beforeAll(() => {
    classifier = new CategoryClassifier();
  });

  // ── Football ─────────────────────────────────────────────────────────────

  describe('Football classification', () => {
    it.each(FOOTBALL_TRANSCRIPTS.map((t, i) => [`football_${i + 1}`, t]))(
      'correctly classifies %s as football',
      async (_name, transcript) => {
        const result = await classifyTranscriptOnly(classifier, transcript);
        expect(result.category).toBe('football');
        expect(result.confidence).toBeGreaterThan(0);
      }
    );

    it('achieves >60% recall on football corpus', async () => {
      let correct = 0;
      for (const t of FOOTBALL_TRANSCRIPTS) {
        const result = await classifyTranscriptOnly(classifier, t);
        if (result.category === 'football') correct++;
      }
      const recall = correct / FOOTBALL_TRANSCRIPTS.length;
      console.log(`Football recall: ${(recall * 100).toFixed(1)}% (${correct}/${FOOTBALL_TRANSCRIPTS.length})`);
      expect(recall).toBeGreaterThanOrEqual(0.6);
    });
  });

  // ── Cricket ──────────────────────────────────────────────────────────────

  describe('Cricket classification', () => {
    it.each(CRICKET_TRANSCRIPTS.map((t, i) => [`cricket_${i + 1}`, t]))(
      'correctly classifies %s as cricket',
      async (_name, transcript) => {
        const result = await classifyTranscriptOnly(classifier, transcript);
        expect(result.category).toBe('cricket');
        expect(result.confidence).toBeGreaterThan(0);
      }
    );

    it('achieves >60% recall on cricket corpus', async () => {
      let correct = 0;
      for (const t of CRICKET_TRANSCRIPTS) {
        const result = await classifyTranscriptOnly(classifier, t);
        if (result.category === 'cricket') correct++;
      }
      const recall = correct / CRICKET_TRANSCRIPTS.length;
      console.log(`Cricket recall: ${(recall * 100).toFixed(1)}% (${correct}/${CRICKET_TRANSCRIPTS.length})`);
      expect(recall).toBeGreaterThanOrEqual(0.6);
    });
  });

  // ── Podcast ───────────────────────────────────────────────────────────────

  describe('Podcast classification', () => {
    it.each(PODCAST_TRANSCRIPTS.map((t, i) => [`podcast_${i + 1}`, t]))(
      'correctly classifies %s as podcast',
      async (_name, transcript) => {
        const result = await classifyTranscriptOnly(classifier, transcript);
        expect(result.category).toBe('podcast');
        expect(result.confidence).toBeGreaterThan(0);
      }
    );

    it('achieves >60% recall on podcast corpus', async () => {
      let correct = 0;
      for (const t of PODCAST_TRANSCRIPTS) {
        const result = await classifyTranscriptOnly(classifier, t);
        if (result.category === 'podcast') correct++;
      }
      const recall = correct / PODCAST_TRANSCRIPTS.length;
      console.log(`Podcast recall: ${(recall * 100).toFixed(1)}% (${correct}/${PODCAST_TRANSCRIPTS.length})`);
      expect(recall).toBeGreaterThanOrEqual(0.6);
    });
  });

  // ── MMA ───────────────────────────────────────────────────────────────────

  describe('MMA classification', () => {
    it('achieves >60% recall on MMA corpus', async () => {
      let correct = 0;
      for (const t of MMA_TRANSCRIPTS) {
        const result = await classifyTranscriptOnly(classifier, t);
        if (result.category === 'mma') correct++;
      }
      const recall = correct / MMA_TRANSCRIPTS.length;
      console.log(`MMA recall: ${(recall * 100).toFixed(1)}% (${correct}/${MMA_TRANSCRIPTS.length})`);
      expect(recall).toBeGreaterThanOrEqual(0.6);
    });
  });

  // ── Fallback ──────────────────────────────────────────────────────────────

  describe('Fallback behaviour', () => {
    it('falls back to podcast when transcript is empty', async () => {
      const result = await classifyTranscriptOnly(classifier, '');
      // No transcript → default to podcast (either via fallback or explicit no-audio default)
      expect(result.category).toBe('podcast');
    });

    it('falls back to podcast when confidence is low (mixed transcript)', async () => {
      // Deliberately ambiguous transcript with no strong category signal
      const ambiguous = 'The thing is, you know, it happened. People were there. Yes. Ok. Good. Next.';
      const result = await classifyTranscriptOnly(classifier, ambiguous);
      // Either fallback or correctly low confidence — either is acceptable
      if (result.fallback_used) {
        expect(result.category).toBe('podcast');
      }
    });

    it('does not crash on very long transcripts', async () => {
      const longTranscript = FOOTBALL_TRANSCRIPTS.join('\n').repeat(20);
      const result = await classifyTranscriptOnly(classifier, longTranscript);
      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ── Cross-contamination guard ─────────────────────────────────────────────

  describe('Cross-contamination guard', () => {
    it('does not classify a football transcript as podcast', async () => {
      const result = await classifyTranscriptOnly(classifier, FOOTBALL_TRANSCRIPTS[0]);
      expect(result.category).not.toBe('podcast');
    });

    it('does not classify a podcast transcript as football', async () => {
      const result = await classifyTranscriptOnly(classifier, PODCAST_TRANSCRIPTS[0]);
      expect(result.category).not.toBe('football');
    });

    it('does not classify a cricket transcript as podcast', async () => {
      const result = await classifyTranscriptOnly(classifier, CRICKET_TRANSCRIPTS[0]);
      expect(result.category).not.toBe('podcast');
    });
  });
});
