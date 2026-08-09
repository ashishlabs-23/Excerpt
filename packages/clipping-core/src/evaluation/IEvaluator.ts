export interface EvaluatorResult {
  component: string;
  score: number;
  passed: boolean;
  regressions: string[];
  notes: string[];
}

export interface IEvaluator {
  evaluate(expected: any, generated: any): EvaluatorResult;
}
