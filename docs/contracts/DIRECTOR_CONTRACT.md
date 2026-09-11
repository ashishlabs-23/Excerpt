# DIRECTOR CONTRACT
# Excerpt — Director AI + Smart Reframe Engine (Step 8)

> **Status**: COMPLETE
> The Director AI subsystem has been deployed inside `@excerpt/clipping-core`. It translates `PerceptionFrames` into a schema-versioned `CameraPlan`, dictating dynamic frame-by-frame crop coordinates while rigorously enforcing smoothing bounds and fallback logic.

## 1. Fallback Precedence 

To guarantee framing reliability when AI tracking fails, the engine enforces a strict 4-level fallback sequence for every frame:
1. **ACTIVE_SPEAKER**: Engaged when a face and speaker track map with high confidence (>0.8). Center-frames the active speaker.
2. **TWO_SPEAKER**: Engaged when exactly two confident speakers are detected simultaneously (split framing logic).
3. **WIDE_SHOT**: Engaged when >2 speakers are detected, or a face is present but confidence is low. 
4. **CENTER_CROP**: Absolute baseline. Engaged when no usable tracking data exists.

The `CameraKeyframe` payload explicitly logs the `FramingLevel` used for that exact timestamp, guaranteeing complete auditability if a clip renders poorly.

## 2. Temporal Smoothing & Anti-Jitter

"Prevent jitter" has been formalized into strict, configurable mathematical boundaries via `DirectorConfig`:
- **Jitter Threshold (`jitterThresholdPx`)**: A deadzone. If the mathematically ideal crop moves by fewer pixels than this threshold, the camera is forcibly locked to the previous coordinate to eliminate micro-shake.
- **Velocity Ceiling (`maxVelocityPxPerSec`)**: If a subject jumps aggressively across the frame, the camera calculates the required pan. If the theoretical speed exceeds the ceiling, the pan is clamped, forcing a smooth, cinematic camera drag rather than an instantaneous teleport.

## 3. Headroom Safety 

The engine actively checks face bounding boxes against the `headroomPaddingRatio`. It vertically offsets the crop window to ensure standard facial framing, explicitly guarding against numeric boundaries that would result in head or chin decapitation in vertical (9:16) outputs.

## 4. Compute Ceilings 

Running high-frequency face tracking on long videos destroys budgets and memory. The `ComputeCeiling` utility calculates a dynamic frame-sampling rate (`Hz`) inversely proportional to the media duration, hard-capped between 1Hz and 10Hz. This ensures short clips get high-fidelity tracking, while 3-hour podcasts remain securely within the `Step 0.5` resource ceilings.

## 5. Test Verification

5 explicit edge-cases in `director.test.ts` continuously assert the engine:
1. **Strict Precedence**: A synthetic multi-state clip successfully forces the engine to assign Level 1, 2, 3, and 4 to consecutive frames without skipping levels.
2. **Bounds Protection**: Attempting to frame a face explicitly near the top bounds of the frame successfully triggers the math clamp, preventing decapitation.
3. **Velocity Capping**: A simulated subject moving 1500px in 0.1s is successfully clamped to the 500px/s config ceiling, outputting a controlled 50px delta.
4. **Jitter Protection**: A simulated subject oscillating by 30px is completely ignored (0 delta) due to the 50px `jitterThresholdPx` lock.
5. **Determinism**: The engine is purely functional. Identical frames yield byte-identical `CameraPlan` objects.
