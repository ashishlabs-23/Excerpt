import { DatabaseService } from '../../services/supabaseService';
import { firebaseDb } from '../../services/firebaseService';
import { JobFinalizerService } from '../../services/render/JobFinalizerService';
import { JobStatus } from '../../utils/JobStateMachine';

describe('P4.4 Event-Driven Render Fan-In Coordination', () => {
  let db: DatabaseService;

  beforeAll(() => {
    db = new DatabaseService();
  });

  beforeEach(() => {
    firebaseDb.clearAllJobs();
  });

  it('correctly tracks terminal states and only claims when all jobs terminate', async () => {
    const singleJobId = `job_fan_in_seq_${Date.now()}`;
    // Seed parent job
    await db.updateJob(singleJobId, {
      status: JobStatus.WAITING_RENDER,
      expected_render_jobs: 3,
    });

    // Seed 3 render jobs in local queue array
    const queue = firebaseDb.readQueue();
    queue.render_jobs = Array.isArray(queue.render_jobs) ? queue.render_jobs : [];
    queue.render_jobs = queue.render_jobs.filter((rj: any) => rj.job_id !== singleJobId);
    queue.render_jobs.push(
      { id: `rj_1_${singleJobId}`, job_id: singleJobId, status: 'rendering' },
      { id: `rj_2_${singleJobId}`, job_id: singleJobId, status: 'rendering' },
      { id: `rj_3_${singleJobId}`, job_id: singleJobId, status: 'rendering' }
    );
    firebaseDb.writeQueue(queue);

    // First render job completes (1/3)
    firebaseDb.updateRenderJob(`rj_1_${singleJobId}`, { status: 'completed' });
    const r1 = await db.checkAndFinalizeRenderFanIn(singleJobId);
    expect(r1.claimed).toBe(false);
    expect(r1.status).toBe('in_progress');
    expect(r1.terminal_count).toBe(1);

    // Second render job fails (2/3)
    firebaseDb.updateRenderJob(`rj_2_${singleJobId}`, { status: 'failed' });
    const r2 = await db.checkAndFinalizeRenderFanIn(singleJobId);
    expect(r2.claimed).toBe(false);
    expect(r2.status).toBe('in_progress');
    expect(r2.terminal_count).toBe(2);

    // Third render job completes (3/3) -> all terminal!
    firebaseDb.updateRenderJob(`rj_3_${singleJobId}`, { status: 'completed' });
    const r3 = await db.checkAndFinalizeRenderFanIn(singleJobId);
    expect(r3.claimed).toBe(true);
    expect(r3.status).toBe('ready_for_delivery_validation');
    expect(r3.terminal_count).toBe(3);

    // An extra subsequent call should not re-claim
    const r4 = await db.checkAndFinalizeRenderFanIn(singleJobId);
    expect(r4.claimed).toBe(false);
  });

  it('Acceptance Gate: 10 render jobs completing simultaneously results in exactly one parent finalization', async () => {
    const concurrentJobId = `job_concurrent_${Date.now()}`;
    const totalJobs = 10;

    // Seed parent job waiting for 10 render jobs
    await db.updateJob(concurrentJobId, {
      status: JobStatus.WAITING_RENDER,
      expected_render_jobs: totalJobs,
      payload: {
        renderPlan: {
          jobId: concurrentJobId,
          requestedClips: totalJobs,
          acceptedCandidates: totalJobs,
          expectedArtifacts: totalJobs,
          renderJobs: Array.from({ length: totalJobs }, (_, i) => ({
            id: `clip_${i}_${concurrentJobId}`,
            clipId: `clip_${i}_${concurrentJobId}`,
            aspectRatio: '9:16',
            format: 'mp4',
            quality: 'high',
            expectedOutputs: { video: true, thumbnail: true, subtitle: false }
          })),
          deliveryPolicy: { allowPartialDelivery: true, minSuccessfulClips: 1 },
          createdAt: new Date().toISOString()
        }
      }
    });

    // Seed 10 render jobs and clips in completed/uploaded state
    const queue = firebaseDb.readQueue();
    queue.render_jobs = Array.isArray(queue.render_jobs) ? queue.render_jobs : [];
    queue.clips = queue.clips || {};

    for (let i = 0; i < totalJobs; i++) {
      const rjId = `rj_${i}_${concurrentJobId}`;
      const clipId = `clip_${i}_${concurrentJobId}`;
      queue.render_jobs.push({
        id: rjId,
        job_id: concurrentJobId,
        clip_id: clipId,
        status: 'completed'
      });
      queue.clips[clipId] = {
        id: clipId,
        job_id: concurrentJobId,
        status: 'uploaded',
        storage_path: `jobs/${concurrentJobId}/${clipId}.mp4`,
        video_url: `https://storage.local/jobs/${concurrentJobId}/${clipId}.mp4`,
      };
    }
    firebaseDb.writeQueue(queue);

    // 10 workers simultaneously attempt fan-in coordination
    const results = await Promise.all(
      Array.from({ length: totalJobs }, () => db.checkAndFinalizeRenderFanIn(concurrentJobId))
    );

    const winners = results.filter(r => r.claimed === true);
    const losers = results.filter(r => r.claimed === false);

    expect(winners.length).toBe(1);
    expect(losers.length).toBe(totalJobs - 1);
    expect(winners[0].status).toBe('ready_for_delivery_validation');

    // Run finalizer with the winning claim
    await JobFinalizerService.finalizeJob(db, concurrentJobId);

    const finalJob = await db.getJob(concurrentJobId);
    expect(finalJob.status).toBe('completed');
    expect(finalJob.progress).toBe(100);
  });

  test('P4.4 Edge-Case 1: Interrupted worker recovery across staggered job completions', async () => {
    const staggeredJobId = `job_staggered_${Date.now()}`;
    const totalJobs = 4;

    await db.updateJob(staggeredJobId, {
      status: 'waiting_render',
      expected_render_jobs: totalJobs,
      raw_clips_metadata: {
        fanIn: {
          totalClips: totalJobs,
          deliveryPolicy: { allowPartialDelivery: true, minSuccessfulClips: 1 },
          createdAt: new Date().toISOString()
        }
      }
    });

    const queue = firebaseDb.readQueue();
    queue.render_jobs = Array.isArray(queue.render_jobs) ? queue.render_jobs : [];
    queue.clips = queue.clips || {};

    // 1. First 2 jobs complete
    for (let i = 0; i < 2; i++) {
      const rjId = `rj_stag_${i}_${staggeredJobId}`;
      const clipId = `clip_stag_${i}_${staggeredJobId}`;
      queue.render_jobs.push({ id: rjId, job_id: staggeredJobId, clip_id: clipId, status: 'completed' });
      queue.clips[clipId] = { id: clipId, job_id: staggeredJobId, status: 'uploaded', video_url: `https://storage.local/${clipId}.mp4` };
    }
    firebaseDb.writeQueue(queue);

    // Fan-in check should NOT claim yet (2/4 done)
    const earlyCheck = await db.checkAndFinalizeRenderFanIn(staggeredJobId);
    expect(earlyCheck.claimed).toBe(false);
    expect(earlyCheck.status).toBe('in_progress');

    // 2. Worker restart / crash simulation: In-memory references dropped, state strictly in DB
    const freshDb = new DatabaseService();

    // 3. Remaining 2 jobs complete
    const freshQueue = firebaseDb.readQueue();
    for (let i = 2; i < totalJobs; i++) {
      const rjId = `rj_stag_${i}_${staggeredJobId}`;
      const clipId = `clip_stag_${i}_${staggeredJobId}`;
      freshQueue.render_jobs.push({ id: rjId, job_id: staggeredJobId, clip_id: clipId, status: 'completed' });
      freshQueue.clips[clipId] = { id: clipId, job_id: staggeredJobId, status: 'uploaded', video_url: `https://storage.local/${clipId}.mp4` };
    }
    firebaseDb.writeQueue(freshQueue);

    // Fan-in check after restart succeeds and claims
    const lateCheck = await freshDb.checkAndFinalizeRenderFanIn(staggeredJobId);
    expect(lateCheck.claimed).toBe(true);
    expect(lateCheck.status).toBe('ready_for_delivery_validation');

    await JobFinalizerService.finalizeJob(freshDb, staggeredJobId);
    const finalized = await freshDb.getJob(staggeredJobId);
    expect(finalized.status).toBe('completed');
  });

  test('P4.4 Edge-Case 2: Duplicate notification idempotency', async () => {
    const dupJobId = `job_dup_${Date.now()}`;
    const totalJobs = 2;

    await db.updateJob(dupJobId, {
      status: 'waiting_render',
      expected_render_jobs: totalJobs,
      raw_clips_metadata: {
        fanIn: {
          totalClips: totalJobs,
          deliveryPolicy: { allowPartialDelivery: true, minSuccessfulClips: 1 },
          createdAt: new Date().toISOString()
        }
      }
    });

    const queue = firebaseDb.readQueue();
    queue.render_jobs = Array.isArray(queue.render_jobs) ? queue.render_jobs : [];
    queue.clips = queue.clips || {};

    for (let i = 0; i < totalJobs; i++) {
      const rjId = `rj_dup_${i}_${dupJobId}`;
      const clipId = `clip_dup_${i}_${dupJobId}`;
      queue.render_jobs.push({ id: rjId, job_id: dupJobId, clip_id: clipId, status: 'completed' });
      queue.clips[clipId] = { id: clipId, job_id: dupJobId, status: 'uploaded', video_url: `https://storage.local/${clipId}.mp4` };
    }
    firebaseDb.writeQueue(queue);

    // First claim wins
    const claim1 = await db.checkAndFinalizeRenderFanIn(dupJobId);
    expect(claim1.claimed).toBe(true);
    await JobFinalizerService.finalizeJob(db, dupJobId);

    // Duplicated notifications arriving later must be no-ops
    const dupClaim1 = await db.checkAndFinalizeRenderFanIn(dupJobId);
    const dupClaim2 = await db.checkAndFinalizeRenderFanIn(dupJobId);
    expect(dupClaim1.claimed).toBe(false);
    expect(dupClaim2.claimed).toBe(false);

    const job = await db.getJob(dupJobId);
    expect(job.status).toBe('completed');
  });
});
