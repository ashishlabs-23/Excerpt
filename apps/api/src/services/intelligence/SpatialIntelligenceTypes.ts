export type SaliencyType = 'face' | 'ball' | 'chart' | 'scoreboard' | 'gameplay' | 'person' | 'object';

export interface BoundingBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Vector2 {
    x: number;
    y: number;
}

export interface TrackingConfidence {
    id: number;
    score: number;
    reason?: string;
}

export interface CropConfidence {
    score: number;
    stability: number;
    reason?: string;
}

export interface SceneConfidence {
    score: number;
    type: 'hard_cut' | 'soft_cut' | 'fade' | 'transition' | 'replay' | 'camera_switch';
}

export interface VisualConfidence {
    tracking: TrackingConfidence[];
    crop: CropConfidence;
    scene?: SceneConfidence;
}

export interface PersistentTrack {
    id: number;
    type: SaliencyType;
    bbox: BoundingBox;
    confidence: number;
    velocity: Vector2;
    acceleration: Vector2;
    age: number;
    lostFrames: number;
    occluded: boolean;
}

export interface CameraMotion {
    panX: number;
    panY: number;
    zoom: number;
    rotation: number;
    confidence: number;
}

export interface CropPlan {
    frameIndex: number;
    timestamp: number;
    layout: 'single' | 'split' | 'presentation' | 'sports';
    regions: PersistentTrack[];
    cameraMotion: CameraMotion;
    reason: string;
    confidence: CropConfidence;
    centerX: number;
    centerY: number;
    zoom: number;
}

export interface SpatialAdapter {
    evaluateRegions(tracks: PersistentTrack[]): PersistentTrack[];
}
