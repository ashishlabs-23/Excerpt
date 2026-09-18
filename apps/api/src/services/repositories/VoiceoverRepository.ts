import { DatabaseService } from '../supabaseService';

/**
 * VoiceoverRepository
 * Canonical authority: PostgreSQL / Supabase
 */
export class VoiceoverRepository {
  private static instance: VoiceoverRepository;
  private db: DatabaseService;

  private constructor() {
    this.db = new DatabaseService();
  }

  public static getInstance(): VoiceoverRepository {
    if (!VoiceoverRepository.instance) {
      VoiceoverRepository.instance = new VoiceoverRepository();
    }
    return VoiceoverRepository.instance;
  }

  public async getProject(projectId: string): Promise<any | null> {
    try {
      return await this.db.getVoiceoverProject(projectId);
    } catch {
      return null;
    }
  }

  public async listProjectsForUser(userId: string): Promise<any[]> {
    try {
      return (await this.db.getVoiceoverProjectsByUser(userId)) || [];
    } catch {
      return [];
    }
  }

  public async createProject(data: any): Promise<any> {
    return await this.db.createVoiceoverProject(data);
  }

  public async updateProject(projectId: string, updates: any): Promise<any> {
    return await this.db.updateVoiceoverProject(projectId, updates);
  }

  public async getSegments(projectId: string): Promise<any[]> {
    try {
      return (await this.db.getVoiceoverSegments(projectId)) || [];
    } catch {
      return [];
    }
  }

  public async saveSegments(segments: any[]): Promise<any> {
    return await this.db.saveVoiceoverSegments(segments);
  }

  public async createVoiceoverClip(clipData: any): Promise<any> {
    return await this.db.createVoiceoverClip(clipData);
  }

  public async getVoiceoverClipsBySource(sourceClipId: string): Promise<any[]> {
    try {
      return (await this.db.getVoiceoverClipsBySource(sourceClipId)) || [];
    } catch {
      return [];
    }
  }
}

export const voiceoverRepository = VoiceoverRepository.getInstance();
