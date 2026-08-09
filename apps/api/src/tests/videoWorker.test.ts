import { awaitRenderJobsAndFinalize } from '../workers/videoWorker';

describe('Video Worker - Orchestration Loop', () => {
  let mockDb: any;
  let mockSleep: jest.Mock;
  let currentTime = 1000000;

  beforeEach(() => {
    currentTime = 1000000;
    jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
    
    mockSleep = jest.fn().mockImplementation(async (ms) => {
      currentTime += ms;
    });

    mockDb = {
      getSupabase: jest.fn(),
      updateJob: jest.fn().mockResolvedValue(true)
    };
    
    // Default environment variables
    process.env.PIPELINE_DELIVERY_POLICY = 'at_least_one';
    process.env.PIPELINE_DELIVERY_THRESHOLD = '0.8';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockDb = (renderJobs: any[], clips: any[]) => {
    mockDb.getSupabase.mockImplementation(() => ({
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn((field, val) => ({ data: table === 'render_jobs' ? renderJobs : clips })),
          in: jest.fn((field, vals) => ({ data: table === 'clips' ? clips : renderJobs }))
        }))
      }))
    }));
  };

  it('Scenario 1: 3/3 render success -> completed, delivery 3/3', async () => {
    createMockDb(
      [
        { id: 'rj1', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c1' },
        { id: 'rj2', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c2' },
        { id: 'rj3', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c3' }
      ],
      [
        { id: 'c1', status: 'uploaded', storage_path: 's3://bucket/c1.mp4' },
        { id: 'c2', status: 'uploaded', storage_path: 's3://bucket/c2.mp4' },
        { id: 'c3', status: 'uploaded', storage_path: 's3://bucket/c3.mp4' }
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 3, [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], [], {}, 10000, mockSleep);
    
    expect(result.finalStatus).toBe('completed');
    expect(result.deliverySummary.uploaded).toBe(3);
    expect(result.deliverySummary.failed).toBe(0);
    expect(mockSleep).not.toHaveBeenCalled(); // Exits immediately because all 3 are terminal
  });

  it('Scenario 2: 2/3 success, 1 failed (Policy: at_least_one) -> completed', async () => {
    createMockDb(
      [
        { id: 'rj1', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c1' },
        { id: 'rj2', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c2' },
        { id: 'rj3', status: 'failed', updated_at: new Date().toISOString(), clip_id: 'c3' }
      ],
      [
        { id: 'c1', status: 'uploaded', storage_path: 's3://bucket/c1.mp4' },
        { id: 'c2', status: 'uploaded', storage_path: 's3://bucket/c2.mp4' },
        { id: 'c3', status: 'pending', storage_path: null }
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 3, [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], [], {}, 10000, mockSleep);
    
    expect(result.finalStatus).toBe('completed');
    expect(result.deliverySummary.uploaded).toBe(2);
    expect(result.deliverySummary.failed).toBe(1);
  });

  it('Scenario 3: 2/3 success, 1 failed (Policy: all) -> failed', async () => {
    process.env.PIPELINE_DELIVERY_POLICY = 'all';
    createMockDb(
      [
        { id: 'rj1', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c1' },
        { id: 'rj2', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c2' },
        { id: 'rj3', status: 'failed', updated_at: new Date().toISOString(), clip_id: 'c3' }
      ],
      [
        { id: 'c1', status: 'uploaded', storage_path: 's3://bucket/c1.mp4' },
        { id: 'c2', status: 'uploaded', storage_path: 's3://bucket/c2.mp4' },
        { id: 'c3', status: 'pending', storage_path: null }
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 3, [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], [], {}, 10000, mockSleep);
    
    expect(result.finalStatus).toBe('failed');
    expect(result.finalReason).toMatch(/Policy 'all' failed/);
  });

  it('Scenario 4: 0/3 success -> failed', async () => {
    createMockDb(
      [
        { id: 'rj1', status: 'failed', updated_at: new Date().toISOString(), clip_id: 'c1' },
        { id: 'rj2', status: 'failed', updated_at: new Date().toISOString(), clip_id: 'c2' },
        { id: 'rj3', status: 'failed', updated_at: new Date().toISOString(), clip_id: 'c3' }
      ],
      [
        { id: 'c1', status: 'pending', storage_path: null },
        { id: 'c2', status: 'pending', storage_path: null },
        { id: 'c3', status: 'pending', storage_path: null }
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 3, [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }], [], {}, 10000, mockSleep);
    
    expect(result.finalStatus).toBe('failed');
    expect(result.deliverySummary.uploaded).toBe(0);
    expect(result.deliverySummary.failed).toBe(3);
  });

  it('Scenario 5: Render worker crash (Heartbeat Timeout)', async () => {
    // 1 job is rendering, but its updated_at is 15 minutes old
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    createMockDb(
      [
        { id: 'rj1', status: 'rendering', updated_at: staleTime, clip_id: 'c1' },
      ],
      []
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 1, [{ id: 'c1' }], [], {}, 10 * 60 * 1000, mockSleep);
    
    // Watchdog should break the loop and proceed to fail the job since uploaded = 0
    expect(result.finalStatus).toBe('failed');
  });

  it('Scenario 6: Slow FFmpeg but active heartbeat (No timeout)', async () => {
    let callCount = 0;
    
    // The query returns rendering for the first 2 loops, updating the heartbeat
    mockDb.getSupabase.mockImplementation(() => ({
      from: jest.fn((table: string) => ({
        select: jest.fn(() => ({
          eq: jest.fn((field, val) => {
            if (table === 'render_jobs') {
              callCount++;
              if (callCount < 3) {
                return { data: [{ id: 'rj1', status: 'rendering', updated_at: new Date().toISOString(), clip_id: 'c1' }] };
              }
              return { data: [{ id: 'rj1', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c1' }] };
            }
            return { data: [] };
          }),
          in: jest.fn((field, vals) => ({ data: [{ id: 'c1', status: 'uploaded', storage_path: 's3://test' }] }))
        }))
      }))
    }));

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 1, [{ id: 'c1' }], [], {}, 10 * 60 * 1000, mockSleep);
    
    expect(result.finalStatus).toBe('completed');
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  it('Scenario 7: Render job reaches dead_letter -> Clean exit', async () => {
    createMockDb(
      [
        { id: 'rj1', status: 'dead_letter', updated_at: new Date().toISOString(), clip_id: 'c1' },
      ],
      [
        { id: 'c1', status: 'pending', storage_path: null },
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 1, [{ id: 'c1' }], [], {}, 10000, mockSleep);
    
    // Loop breaks because dead_letter is terminal
    expect(result.finalStatus).toBe('failed'); // 0 uploaded
    expect(result.deliverySummary.expected).toBe(1);
    expect(result.deliverySummary.failed).toBe(1);
  });

  it('Scenario 8: Invariant Violation (render_job=completed but clip!=uploaded)', async () => {
    createMockDb(
      [
        { id: 'rj1', status: 'completed', updated_at: new Date().toISOString(), clip_id: 'c1' },
      ],
      [
        { id: 'c1', status: 'pending', storage_path: null }, // Mismatch!
      ]
    );

    const result = await awaitRenderJobsAndFinalize(mockDb, 'job_123', 1, [{ id: 'c1' }], [], {}, 10000, mockSleep);
    
    expect(result.finalStatus).toBe('failed');
    expect(result.finalReason).toMatch(/INVARIANT_VIOLATION/);
  });

});
