import { BoundingBox, PersistentTrack, SaliencyType, Vector2 } from './SpatialIntelligenceTypes';

export interface RawDetection {
    type: SaliencyType;
    bbox: BoundingBox;
    confidence: number;
}

export class PersistentTrackManager {
    private tracks: Map<number, PersistentTrack> = new Map();
    private nextTrackId = 1;
    
    // Thresholds
    private readonly IOU_MATCH_THRESHOLD = 0.3;
    private readonly MAX_LOST_FRAMES = 15;

    public updateTracks(detections: RawDetection[], fps: number = 30): PersistentTrack[] {
        const deltaTime = 1.0 / fps;
        
        // 1. Age existing tracks and mark them tentatively lost
        for (const [id, track] of this.tracks.entries()) {
            track.age += 1;
            track.lostFrames += 1;
            track.occluded = track.lostFrames > 0;
            
            // Predict new position based on velocity if lost
            if (track.occluded) {
                track.bbox.x += track.velocity.x * deltaTime;
                track.bbox.y += track.velocity.y * deltaTime;
            }
        }

        // 2. Associate detections with tracks
        const unassignedDetections = new Set(detections);
        
        for (const [id, track] of this.tracks.entries()) {
            let bestMatch: RawDetection | null = null;
            let highestIou = 0;

            for (const detection of unassignedDetections) {
                // Only match same type
                if (detection.type !== track.type) continue;

                const iou = this.calculateIOU(track.bbox, detection.bbox);
                if (iou > highestIou && iou >= this.IOU_MATCH_THRESHOLD) {
                    highestIou = iou;
                    bestMatch = detection;
                }
            }

            if (bestMatch) {
                // Update track with new detection
                const newVelocity = {
                    x: (bestMatch.bbox.x - track.bbox.x) / deltaTime,
                    y: (bestMatch.bbox.y - track.bbox.y) / deltaTime
                };
                
                track.acceleration = {
                    x: (newVelocity.x - track.velocity.x) / deltaTime,
                    y: (newVelocity.y - track.velocity.y) / deltaTime
                };
                
                track.velocity = newVelocity;
                track.bbox = { ...bestMatch.bbox };
                track.confidence = bestMatch.confidence;
                track.lostFrames = 0;
                track.occluded = false;
                
                unassignedDetections.delete(bestMatch);
            }
        }

        // 3. Create new tracks for unassigned detections
        for (const detection of unassignedDetections) {
            const newTrack: PersistentTrack = {
                id: this.nextTrackId++,
                type: detection.type,
                bbox: { ...detection.bbox },
                confidence: detection.confidence,
                velocity: { x: 0, y: 0 },
                acceleration: { x: 0, y: 0 },
                age: 1,
                lostFrames: 0,
                occluded: false
            };
            this.tracks.set(newTrack.id, newTrack);
        }

        // 4. Prune dead tracks
        for (const [id, track] of this.tracks.entries()) {
            if (track.lostFrames > this.MAX_LOST_FRAMES) {
                this.tracks.delete(id);
            }
        }

        // Return a copy of active tracks
        return Array.from(this.tracks.values()).map(t => ({ ...t, bbox: { ...t.bbox }, velocity: { ...t.velocity }, acceleration: { ...t.acceleration } }));
    }

    private calculateIOU(boxA: BoundingBox, boxB: BoundingBox): number {
        const xA = Math.max(boxA.x, boxB.x);
        const yA = Math.max(boxA.y, boxB.y);
        const xB = Math.min(boxA.x + boxA.w, boxB.x + boxB.w);
        const yB = Math.min(boxA.y + boxA.h, boxB.y + boxB.h);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        
        if (interArea === 0) return 0;

        const boxAArea = boxA.w * boxA.h;
        const boxBArea = boxB.w * boxB.h;

        return interArea / (boxAArea + boxBArea - interArea);
    }
}
