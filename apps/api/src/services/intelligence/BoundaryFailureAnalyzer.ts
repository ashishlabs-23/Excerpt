export interface BoundaryFailureAnalysis {
  failure_type: string;
  severity: string;
  start_delta: number;
  end_delta: number;
  accuracy_score: number;
}

export class BoundaryFailureAnalyzer {
  /**
   * Analyzes the differences between the predicted boundary and the editor's corrected boundary.
   */
  public analyze(
    excerptStart: number,
    excerptEnd: number,
    editorStart: number,
    editorEnd: number,
    narrativeType: string,
    editorFeedbackType?: string
  ): BoundaryFailureAnalysis {
    const startDelta = editorStart - excerptStart;
    const endDelta = editorEnd - excerptEnd;
    
    // Boundary Accuracy Score: 100 - absolute error in seconds
    const accuracyScore = Math.max(0, 100 - Math.abs(startDelta) - Math.abs(endDelta));
    
    let failureType = 'unknown';

    // If the editor explicitly provided a feedback reason (e.g. "wrong_story"), that overrides boundary heuristics
    if (editorFeedbackType && ['wrong_story', 'wrong_narrative', 'missed_context'].includes(editorFeedbackType)) {
      failureType = editorFeedbackType;
    } else {
      // Heuristic resolution
      if (editorStart < excerptStart - 2) {
        failureType = 'missing_buildup';
      } else if (editorEnd > excerptEnd + 2) {
        failureType = 'reaction_cutoff';
      } else if (editorStart > excerptStart + 3) {
        failureType = 'started_too_early';
      } else if (editorEnd < excerptEnd - 3) {
        failureType = 'ended_too_late';
      } else {
        failureType = 'minor_adjustment';
      }
    }

    let severity = 'minor';
    const totalError = Math.abs(startDelta) + Math.abs(endDelta);
    if (totalError >= 10) {
      severity = 'critical';
    } else if (totalError >= 4) {
      severity = 'moderate';
    }

    return {
      failure_type: failureType,
      severity,
      start_delta: startDelta,
      end_delta: endDelta,
      accuracy_score: accuracyScore
    };
  }
}

export const boundaryFailureAnalyzer = new BoundaryFailureAnalyzer();
