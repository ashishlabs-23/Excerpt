import { InterestRegion, PersistentTrack } from './SpatialIntelligenceTypes';

/**
 * Fuses non-human visual cues (OCR text, visual saliency maps, presentation slides, cursors) 
 * into InterestRegions to compete with face tracking.
 */
export class SaliencyEngine {
    
    // In a production environment, this takes raw OCR bounding boxes and saliency heatmaps
    // and converts them into normalized InterestRegions.
    public fuseSaliency(tracks: PersistentTrack[], ocrData: any[], heatmapData: any[]): InterestRegion[] {
        const regions: InterestRegion[] = [];

        // Mocking OCR ingestion
        if (ocrData && ocrData.length > 0) {
            for (const ocr of ocrData) {
                regions.push({
                    id: `ocr_${ocr.id}`,
                    type: 'ocr',
                    bbox: ocr.bbox,
                    confidence: ocr.confidence,
                    weight: 0.85 // High importance for readable text
                });
            }
        }

        // Mocking Visual Saliency hotspots (e.g. bright explosions in gaming)
        if (heatmapData && heatmapData.length > 0) {
            for (const hotspot of heatmapData) {
                regions.push({
                    id: `hotspot_${hotspot.id}`,
                    type: 'saliency_hotspot',
                    bbox: hotspot.bbox,
                    confidence: hotspot.intensity,
                    weight: 0.7 
                });
            }
        }

        return regions;
    }
}
