import fs from 'fs';
import path from 'path';
import { SourceArtifactManager, calculateContentHash } from '../../services/storage/SourceArtifactManager';

describe('P4.2 Shared Immutable Source Artifacts', () => {
  const testDir = path.resolve(process.cwd(), 'temp', 'test_source_artifacts');
  const sampleFilePath = path.join(testDir, 'sample.mp4');
  let mockStorageService: any;
  let sourceManager: SourceArtifactManager;

  const uploadedObjects = new Map<string, { buffer: Buffer; contentType: string }>();

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    // Create a mock media file for testing
    fs.writeFileSync(sampleFilePath, Buffer.from('EXCERPT_SOURCE_MEDIA_BYTE_STREAM_TEST_V4'));

    mockStorageService = {
      uploadFile: jest.fn(async (filePath: string, key: string) => {
        const buffer = fs.readFileSync(filePath);
        uploadedObjects.set(key, { buffer, contentType: 'video/mp4' });
        return `https://storage.excerpt.ai/${key}`;
      }),
      getFileStream: jest.fn(async (key: string) => {
        const obj = uploadedObjects.get(key);
        if (!obj) return null;
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(obj.buffer);
        stream.push(null);
        return {
          stream,
          contentLength: obj.buffer.length,
          contentType: obj.contentType,
          statusCode: 200,
        };
      }),
      createSignedUrl: jest.fn(async (key: string) => `https://signed.storage.excerpt.ai/${key}`),
    };

    sourceManager = new SourceArtifactManager(mockStorageService);
    // Mock ffprobe validation so test runs fast without external media file dependencies
    jest.spyOn(sourceManager, 'validateSourceFile').mockImplementation(async (filePath: string) => {
      const hash = await calculateContentHash(filePath);
      return {
        valid: true,
        durationSec: 60,
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        sizeBytes: fs.statSync(filePath).size,
        contentHash: hash,
      };
    });
  });

  afterAll(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test('hashes actual file bytes accurately with SHA-256', async () => {
    const hash = await calculateContentHash(sampleFilePath);
    expect(hash).toBeDefined();
    expect(hash.length).toBe(64); // SHA-256 hex string length
  });

  test('Acceptance Gate: 10 jobs publishing the same video produce exactly 1 source artifact', async () => {
    const canonicalUrl = 'https://www.youtube.com/watch?v=sample123';
    uploadedObjects.clear();
    mockStorageService.uploadFile.mockClear();

    // 10 concurrent or sequential jobs publish the same file
    const manifests = await Promise.all(
      Array.from({ length: 10 }, () =>
        sourceManager.publishSourceArtifact(sampleFilePath, canonicalUrl)
      )
    );

    const firstHash = manifests[0].contentHash;
    expect(firstHash).toBeDefined();

    // All 10 manifests share the exact same contentHash and storageKey
    for (const m of manifests) {
      expect(m.contentHash).toBe(firstHash);
      expect(m.storageKey).toBe(`sources/${firstHash}/source.mp4`);
    }

    // Exact invariant: 1 source + 10 jobs -> exactly 1 upload to storage
    expect(mockStorageService.uploadFile).toHaveBeenCalledTimes(1);
    expect(uploadedObjects.has(`sources/${firstHash}/source.mp4`)).toBe(true);
  });

  test('Render worker acquires source from Object Storage without hitting external URLs', async () => {
    const hash = await calculateContentHash(sampleFilePath);
    const storageKey = `sources/${hash}/source.mp4`;

    const workerTargetDir = path.join(testDir, 'worker_render_slot');
    const result = await sourceManager.acquireLocalSource(storageKey, workerTargetDir);

    expect(result.localPath).toBeDefined();
    expect(fs.existsSync(result.localPath)).toBe(true);

    const acquiredBytes = fs.readFileSync(result.localPath);
    const sourceBytes = fs.readFileSync(sampleFilePath);
    expect(acquiredBytes.equals(sourceBytes)).toBe(true);
  });
});
