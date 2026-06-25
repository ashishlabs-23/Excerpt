import { createClient } from '@supabase/supabase-js';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export class PolicyPromotionEngine {
  private readonly MIN_MATCHES = 30;
  private readonly WIN_RATE_THRESHOLD = 0.55;
  private readonly CONFIDENCE_THRESHOLD = 0.80;
  private readonly STABILITY_THRESHOLD = 0.80;

  /**
   * Sweeps policy_matchups and promotes/demotes policies on the ladder.
   * experimental -> candidate -> challenger -> promoted -> retired
   */
  public async evaluatePolicies(): Promise<void> {
    console.log('[PolicyPromotionEngine] Starting Evaluation...');

    // Get all active active non-promoted, non-retired policies
    const { data: policies, error } = await supabase.from('policy_versions')
      .select('*')
      .in('stage', ['experimental', 'candidate', 'challenger']);

    if (error || !policies) {
      console.error('[PolicyPromotionEngine] Failed to load policies:', error);
      return;
    }

    for (const policy of policies) {
      // Fetch their matchups
      const { data: matchups, error: matchupError } = await supabase.from('policy_matchups')
        .select('*')
        .or(`policy_a_id.eq.${policy.id},policy_b_id.eq.${policy.id}`)
        .order('created_at', { ascending: false });

      if (matchupError || !matchups) continue;

      const totalMatches = matchups.length;
      if (totalMatches < this.MIN_MATCHES) {
        console.log(`[PolicyPromotionEngine] ${policy.narrative_type} V${policy.version_number} has only ${totalMatches} matches. Waiting for ${this.MIN_MATCHES}.`);
        continue;
      }

      // Calculate Wins
      const wins = matchups.filter(m => m.winner === policy.id).length;
      const winRate = wins / totalMatches;
      
      // We will assume `confidence` and `stability` are updated via another worker or here
      const isStable = policy.stability >= this.STABILITY_THRESHOLD;
      const isConfident = policy.confidence >= this.CONFIDENCE_THRESHOLD;

      console.log(`[PolicyPromotionEngine] ${policy.narrative_type} V${policy.version_number} Stats: ${wins}/${totalMatches} (${(winRate*100).toFixed(1)}%) | Conf: ${policy.confidence} | Stab: ${policy.stability}`);

      if (winRate >= this.WIN_RATE_THRESHOLD && isConfident && isStable) {
        // Upgrade stage logic
        let nextStage = policy.stage;
        if (policy.stage === 'experimental') nextStage = 'candidate';
        else if (policy.stage === 'candidate') nextStage = 'challenger';
        else if (policy.stage === 'challenger') nextStage = 'promoted';
        
        console.log(`[PolicyPromotionEngine] => Promoting ${policy.narrative_type} V${policy.version_number} from ${policy.stage} to ${nextStage}`);

        // If promoting to 'promoted', we must retire the previous promoted
        if (nextStage === 'promoted') {
          await supabase.from('policy_versions')
            .update({ stage: 'retired' })
            .eq('narrative_type', policy.narrative_type)
            .eq('stage', 'promoted');
        }

        // Update the policy itself
        await supabase.from('policy_versions')
          .update({ stage: nextStage })
          .eq('id', policy.id);
          
      } else if (winRate < 0.40 && totalMatches >= this.MIN_MATCHES) {
        // Demote or Retire if performing terribly
        console.log(`[PolicyPromotionEngine] => Retiring ${policy.narrative_type} V${policy.version_number} due to poor performance (${(winRate*100).toFixed(1)}%)`);
        await supabase.from('policy_versions')
          .update({ stage: 'retired' })
          .eq('id', policy.id);
      }
    }
    
    console.log('[PolicyPromotionEngine] Evaluation Complete.');
  }
}

export const policyPromotionEngine = new PolicyPromotionEngine();

// If run directly:
if (require.main === module) {
  policyPromotionEngine.evaluatePolicies().catch(console.error);
}
