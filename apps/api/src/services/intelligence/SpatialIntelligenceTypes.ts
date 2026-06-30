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

export interface InterestRegion {
    id: string; // Unique ID (e.g. tracking ID or semantic tag)
    type: SaliencyType | 'speaker' | 'slides' | 'crosshair' | 'ocr' | 'saliency_hotspot';
    bbox: BoundingBox;
    confidence: number;
    weight: number; // 0.0 to 1.0 importance factor
}

export type LayoutType = 'single' | 'split' | 'triple' | 'pip' | 'safe_mode';

export interface CropPlan {
    frameIndex: number;
    timestamp: number;
    layout: LayoutType;
    focalRegions: InterestRegion[];
    cameraMotion: CameraMotion;
    confidence: CropConfidence;
    compositionStrategy: 'rule_of_thirds' | 'center' | 'lead_room' | 'conversation_balance' | 'safe_mode';
}

export interface RenderPlan {
    frameIndex: number;
    timestamp: number;
    x: number; // Top-left x
    y: number; // Top-left y
    w: number; // Width
    h: number; // Height
    scale: number;
}

export interface SpatialAdapter {
    generateInterestRegions(tracks: PersistentTrack[]): InterestRegion[];
}
