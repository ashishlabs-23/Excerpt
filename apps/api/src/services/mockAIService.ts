interface MockClip {
  id: string;
  start_time: number;
  end_time: number;
  duration: number;
  title: string;
  hook: string;
  score: number;
  video_url: string;
  thumbnail_url?: string;
}

export const mockAIService = {
  detectClips: async (videoUrl: string): Promise<MockClip[]> => {
    console.log(`[MockAI] Detecting clips for ${videoUrl}...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return [
      {
        id: 'clip-mock-1',
        start_time: 10,
        end_time: 40,
        duration: 30,
        title: "The Billion Dollar Pivot",
        hook: "I realized everything was wrong when I saw the data...",
        score: 9.8,
        video_url: "https://example.com/clips/pivot.mp4",
        thumbnail_url: "https://example.com/thumbs/pivot.jpg"
      },
      {
        id: 'clip-mock-2',
        start_time: 120,
        end_time: 150,
        duration: 30,
        title: "Why Most Startups Fail",
        hook: "It's not money, it's not the team, it's the timing.",
        score: 9.2,
        video_url: "https://example.com/clips/fail.mp4",
        thumbnail_url: "https://example.com/thumbs/fail.jpg"
      }
    ];
  },
  
  generateTranscription: async (inputPath: string): Promise<string> => {
    console.log(`[MockAI] Transcribing ${inputPath}...`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    return "This is a mock transcription generated for the Excerpt platform demonstration.";
  }
};
