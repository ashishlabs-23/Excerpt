import fs from 'fs';
import path from 'path';
import { VisualFrameData } from './BroadcastGraphicsDetector';

export class VisualDebugger {
  public generateReport(frames: VisualFrameData[]): string {
    const lines: string[] = [];
    lines.push(`================================================================================`);
    lines.push(`                    EXCERPT VISUAL TIMELINE DEBUGGER (DEV MODE)                  `);
    lines.push(`================================================================================`);
    lines.push(`| Sec | Segment Type | Text Dens | Motion | Players | Field | Gameplay Dens | Score |`);
    lines.push(`|-----|--------------|-----------|--------|---------|-------|---------------|-------|`);

    for (const f of frames) {
      const fieldStr = f.field_visible ? '  YES  ' : '  NO   ';
      const segmentStr = f.graphic_type !== 'none' ? `graphic (${f.graphic_type})` : 'gameplay';
      const padding = 12 - segmentStr.length;
      const typeStr = segmentStr + ' '.repeat(Math.max(0, padding));
      const score = Math.round(f.confidence * 100);

      lines.push(
        `| ${String(f.second).padStart(3, ' ')} ` +
        `| ${typeStr} ` +
        `|   ${f.text_density.toFixed(2)}    ` +
        `|  ${f.motion_score.toFixed(2)}  ` +
        `|   ${String(f.player_count).padStart(2, ' ')}    ` +
        `|${fieldStr}` +
        `|      ${String(Math.round(f.player_density * 30 + (f.field_visible ? 30 : 0) + f.motion_score * 30)).padStart(3, ' ')}      ` +
        `|  ${String(score).padStart(3, ' ')}  |`
      );
    }
    lines.push(`================================================================================`);

    const finalReport = lines.join('\n');
    
    // Save report to disk
    const reportPath = path.join(process.cwd(), 'temp', 'visual_debugger_output.txt');
    try {
      const dir = path.dirname(reportPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(reportPath, finalReport, 'utf8');
      console.log(`[VisualDebugger]: Saved developer visual timeline report to ${reportPath}`);
    } catch (err) {
      console.warn(`[VisualDebugger]: Failed to save report to file:`, err);
    }

    return finalReport;
  }
}

export const visualDebugger = new VisualDebugger();
