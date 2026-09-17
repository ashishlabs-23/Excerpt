import { BenchmarkGroundTruth } from './VoiceoverQualityGate';

export interface BenchmarkCorpusItem {
  id: string;
  category: 'Sports' | 'Podcast' | 'Interview' | 'Vlog' | 'Tutorial' | 'News' | 'Debate' | 'Gaming' | 'Music' | 'Long-form';
  title: string;
  description: string;
  clipInterval: { start: number; end: number };
  expectedDurationSec: number;
  speechGroundTruth: {
    dialogueMode: 'single' | 'duo';
    expectedSpeakers: string[];
    suggestedVoices: string[];
    tone: string;
  };
  visualGroundTruth: BenchmarkGroundTruth;
  captionPreset: 'submagic' | 'hormozi' | 'tiktok' | 'mrbeast' | 'neon' | 'minimalist';
}

export const VOICEOVER_BENCHMARK_CORPUS: BenchmarkCorpusItem[] = [
  // 1. Sports
  {
    id: 'bench-sports-01',
    category: 'Sports',
    title: 'Stoppage Time Winner Counter-Attack',
    description: 'Striker accelerates down right flank and finishes past goalkeeper in 93rd minute.',
    clipInterval: { start: 0, end: 12 },
    expectedDurationSec: 12,
    speechGroundTruth: {
      dialogueMode: 'duo',
      expectedSpeakers: ['Play-by-Play', 'Color Analyst'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB', 'IKne3meq5aSn9XLyUdCD'],
      tone: 'Ecstatic, urgent, high-energy',
    },
    visualGroundTruth: {
      facts: [
        'Player in red kit counter-attacks down right side',
        'Striker shoots into top left corner of the net',
        'Goalkeeper dives to right but cannot reach the ball',
      ],
      entities: ['Striker', 'Goalkeeper', 'Defender #4'],
      ocrText: ['92:45', 'RED 2 - 1 BLUE', 'STOPPAGE TIME'],
      forbiddenClaims: [
        'scored from a penalty',
        'header from the left corner',
        'blue team scored the goal',
        'game was postponed',
      ],
      expectedSpeakers: ['Play-by-Play', 'Color Analyst'],
      dialogueMode: 'duo',
      maxCPS: 26,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'hormozi',
  },

  // 2. Podcast
  {
    id: 'bench-podcast-02',
    category: 'Podcast',
    title: 'AI Robotics Founder Debate',
    description: 'Host and guest discussing autonomous humanoid robotic dexterity.',
    clipInterval: { start: 0, end: 16 },
    expectedDurationSec: 16,
    speechGroundTruth: {
      dialogueMode: 'duo',
      expectedSpeakers: ['Host', 'Guest'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB', 'IKne3meq5aSn9XLyUdCD'],
      tone: 'Thoughtful, conversational, analytical',
    },
    visualGroundTruth: {
      facts: [
        'Two speakers seated at studio microphone desk with pop filters',
        'Split screen showing robot hand manipulation test video',
      ],
      entities: ['Host', 'Guest', 'Robotic Hand'],
      ocrText: ['EPISODE 142', 'AUTONOMOUS HARDWARE'],
      forbiddenClaims: [
        'outdoor hiking trail',
        'cooking demonstration',
        'unmanned submarine exploration',
      ],
      dialogueMode: 'duo',
      maxCPS: 22,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'submagic',
  },

  // 3. Interview
  {
    id: 'bench-interview-03',
    category: 'Interview',
    title: 'Post-Match Press Conference Reflection',
    description: 'Head coach addressing tactical substitutions in post-match media room.',
    clipInterval: { start: 0, end: 14 },
    expectedDurationSec: 14,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['Narrator'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Authoritative, objective, composed',
    },
    visualGroundTruth: {
      facts: [
        'Coach seated in front of sponsor backdrop with sponsor logos',
        'Press journalists holding microphones in foreground',
      ],
      entities: ['Head Coach', 'Press Reporter'],
      ocrText: ['POST-MATCH MEDIA', 'OFFICIAL BRIEFING'],
      forbiddenClaims: [
        'referee handed out a red card on the pitch',
        'halftime locker room speech',
      ],
      dialogueMode: 'single',
      maxCPS: 20,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'minimalist',
  },

  // 4. Vlog
  {
    id: 'bench-vlog-04',
    category: 'Vlog',
    title: 'Tokyo Street Food Exploration',
    description: 'Creator ordering and tasting sizzling Wagyu skewers in vibrant night market.',
    clipInterval: { start: 0, end: 10 },
    expectedDurationSec: 10,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['Creator'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Enthusiastic, personal, sensory',
    },
    visualGroundTruth: {
      facts: [
        'Chef grilling skewers over open charcoal grill with rising smoke',
        'Creator taking a bite with expressive reaction',
      ],
      entities: ['Creator', 'Grill Master', 'Wagyu Skewers'],
      ocrText: ['SHINJUKU NIGHTS', 'WAGYU A5'],
      forbiddenClaims: [
        'eating pizza in Rome',
        'snowboarding in the Alps',
        'ordering sushi from a conveyer belt',
      ],
      dialogueMode: 'single',
      maxCPS: 22,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'tiktok',
  },

  // 5. Tutorial
  {
    id: 'bench-tutorial-05',
    category: 'Tutorial',
    title: 'Code Editor Refactoring Shortcut',
    description: 'Step-by-step developer tutorial demonstrating multi-cursor variable rename.',
    clipInterval: { start: 0, end: 12 },
    expectedDurationSec: 12,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['Instructor'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Instructive, clear, paced',
    },
    visualGroundTruth: {
      facts: [
        'IDE screen recording showing TypeScript function highlighted',
        'Keyboard shortcut visualizer overlay displaying Ctrl+F2',
      ],
      entities: ['Code Editor', 'Cursor', 'Function Declaration'],
      ocrText: ['function calculateVelocity', 'CTRL + F2', 'VS CODE'],
      forbiddenClaims: [
        'editing video in Adobe Premiere',
        'installing python on macOS terminal',
      ],
      dialogueMode: 'single',
      maxCPS: 18,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'neon',
  },

  // 6. News
  {
    id: 'bench-news-06',
    category: 'News',
    title: 'Spacecraft Orbital Insertion Success',
    description: 'Mission control telemetry confirmed successful lunar orbit insertion.',
    clipInterval: { start: 0, end: 15 },
    expectedDurationSec: 15,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['News Anchor'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Formal, journalistic, serious',
    },
    visualGroundTruth: {
      facts: [
        'Mission control room applauding in front of large telemetry screens',
        '3D orbital trajectory simulation on center display',
      ],
      entities: ['Mission Flight Director', 'Flight Controllers', 'Orbiter'],
      ocrText: ['BREAKING NEWS', 'ORBIT CONFIRMED', 'VELOCITY 1.62 KM/S'],
      forbiddenClaims: [
        'spacecraft lost signal and crashed',
        'launch scrubbed due to weather',
      ],
      dialogueMode: 'single',
      maxCPS: 20,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'minimalist',
  },

  // 7. Debate
  {
    id: 'bench-debate-07',
    category: 'Debate',
    title: 'Economic Policy Argument on Inflation',
    description: 'Two panelists exchanging rapid counterpoints regarding interest rate cuts.',
    clipInterval: { start: 0, end: 16 },
    expectedDurationSec: 16,
    speechGroundTruth: {
      dialogueMode: 'duo',
      expectedSpeakers: ['Speaker A', 'Speaker B'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB', '21m00Tcm4TlvDq8ikWAM'],
      tone: 'Firm, competitive, persuasive',
    },
    visualGroundTruth: {
      facts: [
        'Side by side split screen of two debate podiums',
        'Timer display counting down 30 second rebuttals',
      ],
      entities: ['Panelist Left', 'Panelist Right', 'Moderator'],
      ocrText: ['ROUND 2', 'MONETARY POLICY', ':24 REMAINING'],
      forbiddenClaims: [
        'unanimous agreement without rebuttal',
        'silent reading of documents',
      ],
      dialogueMode: 'duo',
      maxCPS: 24,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'submagic',
  },

  // 8. Gaming
  {
    id: 'bench-gaming-08',
    category: 'Gaming',
    title: 'Tactical Shooter 1v3 Clutch Moment',
    description: 'Player defuses bomb with 1.2 seconds remaining after eliminating three opponents.',
    clipInterval: { start: 0, end: 12 },
    expectedDurationSec: 12,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['Caster'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Intense, breathless, explosive',
    },
    visualGroundTruth: {
      facts: [
        'First person perspective firing through smoke towards bomb site',
        'Triple kill notification banner popping up on top right',
        'Defuse timer ticking down with blue progress bar',
      ],
      entities: ['Player', 'Defusal Kit', 'Bomb Site B'],
      ocrText: ['DEFUSING...', '0:01', 'ROUND WON'],
      forbiddenClaims: [
        'player ran out of ammo and was eliminated',
        'bomb exploded before defuse started',
      ],
      dialogueMode: 'single',
      maxCPS: 26,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'mrbeast',
  },

  // 9. Music / Low-Speech
  {
    id: 'bench-music-09',
    category: 'Music',
    title: 'Electronic Festival Drop Transition',
    description: 'DJ builds tension leading up to heavy synth drop with pulsating laser show.',
    clipInterval: { start: 0, end: 12 },
    expectedDurationSec: 12,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['MC'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Hype, punchy, sparse',
    },
    visualGroundTruth: {
      facts: [
        'Massive festival stage with pyrotechnics and green lasers firing into crowd',
        'DJ with arms raised above CDJs before drop hits',
      ],
      entities: ['DJ', 'Crowd', 'Laser Rig'],
      ocrText: ['MAIN STAGE LIVE', 'DROP IN 3 2 1'],
      forbiddenClaims: [
        'quiet classical violin recital in small chamber',
        'empty stadium in the rain',
      ],
      dialogueMode: 'single',
      maxCPS: 16,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'neon',
  },

  // 10. Long-form
  {
    id: 'bench-longform-10',
    category: 'Long-form',
    title: 'Deep Nature Documentary Sequence',
    description: 'Extended multi-stage sequence of snow leopard stalking through Himalayan pass.',
    clipInterval: { start: 0, end: 30 },
    expectedDurationSec: 30,
    speechGroundTruth: {
      dialogueMode: 'single',
      expectedSpeakers: ['Documentary Narrator'],
      suggestedVoices: ['pNInz6obpgDQGcFmaJgB'],
      tone: 'Deep, cinematic, atmospheric, patient',
    },
    visualGroundTruth: {
      facts: [
        'Wide panoramic shot of snow-covered mountain ridges and rocky cliffs',
        'Snow leopard camouflaged against gray rock ledge creeping slowly downward',
        'Herd of mountain ibex grazing unaware in valley below',
      ],
      entities: ['Snow Leopard', 'Himalayan Ridge', 'Ibex Herd'],
      ocrText: ['ALTITUDE 4,800M', 'LADAKH REGION'],
      forbiddenClaims: [
        'tropical rainforest canopy with parrots',
        'underwater coral reef with sharks',
        'subway train entering station',
      ],
      dialogueMode: 'single',
      maxCPS: 18,
      safeZoneMarginPx: 80,
    },
    captionPreset: 'submagic',
  },
];
