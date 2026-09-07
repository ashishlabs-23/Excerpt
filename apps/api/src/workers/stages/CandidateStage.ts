import { CandidateGenerator } from '../../services/intelligence/CandidateGenerator';
import { CriticEngine } from '../../services/intelligence/CriticEngine';
import { PersonaRankingEngine } from '../../services/intelligence/PersonaRankingEngine';
import { fallbackClipService } from '../../services/fallbackClipService';
import { AIService } from '../../services/aiService';
import { PipelineContext } from '../../services/intelligence/PipelineContext';
import { PipelineStage, StageResult } from './types';

export interface CandidateInput {
  jobId: string;
  videoUrl: string;
  numClips: number;
  sourceDuration: number;
  transcriptionText: string;
  segments: any[];
  storyGraph?: any;
  graph?: any;
  v2Candidates?: any[];
  isV2PipelineUsed?: boolean;
  recoveryMode?: boolean;
  excludedZones?: any[];
  intent?: string;
  aiService: AIService;
  pipelineContext: PipelineContext;
}

export interface CandidateOutput {
  candidates: any[];
  generationMode: 'ai' | 'heuristic' | 'recovery';
  criticFilteredCount: number;
  rankedCandidates: any[];
}

export class CandidateStage implements PipelineStage<CandidateInput, CandidateOutput> {
  readonly name = 'stage_3_candidate_generation';

  private candidateGenerator = new CandidateGenerator();
  private criticEngine = new CriticEngine();
  private personaRankingEngine = new PersonaRankingEngine();

  async execute(input: CandidateInput): Promise<StageResult<CandidateOutput>> {
    const startedAt = Date.now();
    const {
      videoUrl,
      numClips,
      sourceDuration,
      transcriptionText,
      segments,
      storyGraph,
      graph,
      v2Candidates = [],
      isV2PipelineUsed = false,
      recoveryMode = false,
      excludedZones = [],
      intent,
      aiService,
      pipelineContext,
    } = input;

    let candidates: any[] = [];
    let generationMode: 'ai' | 'heuristic' | 'recovery' = 'ai';
    let criticFilteredCount = 0;
    let rankedCandidates: any[] = [];

    try {
      // 1. If StoryGraph exists, generate candidates & run critic
      if (storyGraph?.stories && Array.isArray(storyGraph.stories) && storyGraph.stories.length > 0) {
        console.log(`[CandidateStage]: 🎬 Generating Candidates from StoryGraph & Executing Critic...`);
        for (const story of storyGraph.stories) {
          this.candidateGenerator.generateCandidates(story);
          const initialCount = story.candidate_ranges?.length || 0;
          story.candidate_ranges = (story.candidate_ranges || []).filter((candidate: any) => {
            const criticResult = this.criticEngine.evaluateCandidate(candidate, story, graph);
            if (!criticResult.approved) {
              console.log(`[Critic]: Rejected candidate for story ${story.id} - ${criticResult.reason}`);
              return false;
            }
            return true;
          });
          criticFilteredCount += (initialCount - (story.candidate_ranges?.length || 0));
        }

        console.log(`[CandidateStage]: 🏆 Ranking Story Candidates via PersonaRankingEngine...`);
        rankedCandidates = await this.personaRankingEngine.rank(storyGraph.stories, 'TikTok');
        pipelineContext.rankedCandidates = rankedCandidates;
      }

      // 2. Select candidates based on pipeline branch
      if (isV2PipelineUsed && v2Candidates.length > 0) {
        console.log(`[CandidateStage]: Using ${v2Candidates.length} V2 multi-modal candidates.`);
        candidates = v2Candidates;
        generationMode = 'ai';
      } else if (!recoveryMode && transcriptionText && transcriptionText.trim()) {
        let heuristicCandidates: any[] = [];
        if (segments.length > 0) {
          try {
            heuristicCandidates = fallbackClipService.detectClips({
              segments,
              videoUrl,
              numClips: Math.min(Math.max(numClips * 3, 4), 8),
              totalDuration: sourceDuration,
              excludedZones,
            });
          } catch (candErr: any) {
            console.warn(`[CandidateStage]: Preselection fallback unavailable: ${candErr.message}`);
          }
        }

        try {
          candidates = await aiService.detectClips(
            transcriptionText,
            videoUrl,
            numClips,
            heuristicCandidates,
            intent as any,
            excludedZones
          );
          generationMode = 'ai';
        } catch (aiErr: any) {
          console.warn(`[CandidateStage]: AI detection failed, falling back to heuristic: ${aiErr.message}`);
          candidates = heuristicCandidates.length > 0
            ? heuristicCandidates.slice(0, numClips)
            : fallbackClipService.detectClips({
                segments,
                videoUrl,
                numClips,
                totalDuration: sourceDuration,
                excludedZones,
              });
          generationMode = 'heuristic';
        }
      } else {
        generationMode = 'recovery';
        candidates = fallbackClipService.detectClips({
          segments,
          videoUrl,
          numClips,
          totalDuration: sourceDuration,
          excludedZones,
        });
      }

      return {
        success: true,
        data: {
          candidates,
          generationMode,
          criticFilteredCount,
          rankedCandidates,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err,
        durationMs: Date.now() - startedAt,
      };
    }
  }
}
