export interface FrameRecord {
  index: number;
  timestampSec: number;
  path?: string;
  buffer?: Buffer;
}
