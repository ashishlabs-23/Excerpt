async function run() {
  process.env.EXCERPT_NEXUS_AUDIO = 'true';
  process.env.EXCERPT_NEXUS_VISUAL = 'true';
  process.env.EXCERPT_NEXUS_HOOK = 'true';
  process.env.EXCERPT_NEXUS_METADATA = 'true';
  process.env.EXCERPT_NEXUS_THUMBNAIL = 'false';
  process.env.EXCERPT_NEXUS_LEARNING = 'false';
  process.env.EXCERPT_FORCE_AUDIO_FAIL = 'true';
  process.env.EXCERPT_FORCE_VISUAL_FAIL = 'true';
  process.env.EXCERPT_FORCE_OLLAMA_JSON_FAIL = 'true';

  const { NexusRegistry } = await import('./services/nexus/NexusRegistry');

  const registry = NexusRegistry.getInstance();
  const result = await registry.analyzeClip(
    'missing-input.mp4',
    'Wait until you hear the reveal because this changes everything.',
    [
      { start: 0.1, end: 1.2, text: 'Wait until you hear the reveal' },
      { start: 1.2, end: 2.1, text: 'because this changes everything' },
    ],
    {
      runId: 'test-run',
      clipId: 'clip-01',
    }
  );

  if (result.signals.audio?.status !== 'skipped') {
    throw new Error('Audio failure did not downgrade to skipped.');
  }

  if (result.signals.visual?.status !== 'skipped') {
    throw new Error('Visual failure did not downgrade to skipped.');
  }

  if (!result.enhancements) {
    throw new Error('Enhancement payload was not returned.');
  }

  if (!result.enhancements.fallback_used) {
    throw new Error('Malformed Ollama JSON did not trigger a fallback enhancement.');
  }

  if (!result.metadata?.pipeline_summary) {
    throw new Error('Pipeline summary metadata was not produced.');
  }

  console.log('Resilience hardening test passed.');
  console.log(
    JSON.stringify(
      {
        audio_status: result.signals.audio?.status,
        visual_status: result.signals.visual?.status,
        enhancement_fallback_used: result.enhancements.fallback_used,
        pipeline_summary: result.metadata.pipeline_summary,
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
