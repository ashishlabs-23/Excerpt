import { RenderPlan } from './SpatialIntelligenceTypes';

/**
 * Consumes a renderer-agnostic RenderPlan and generates raw FFmpeg mathematical expressions.
 * This file is the only place in the Intelligence layer that knows FFmpeg exists.
 */
export class FFmpegTranslator {
    
    public generateExpressions(plans: RenderPlan[]): { xExpression: string; yExpression: string } {
        if (!plans || plans.length === 0) {
            return { xExpression: 'iw/2-ow/2', yExpression: 'ih/2-oh/2' };
        }

        // In a full implementation, we build complex lerp expressions or write
        // the frame-by-frame data to an external file (e.g. `sendcmd` overlay file).
        // For now, we stub a basic dynamic expression.

        return {
            xExpression: `lerp(iw/2-ow/2, ${plans[0].x}*iw, t/10)`,
            yExpression: `lerp(ih/2-oh/2, ${plans[0].y}*ih, t/10)`
        };
    }
}
