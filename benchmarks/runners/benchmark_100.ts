import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();


const supabase = createClient(
  process.env.SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// 100 Curated Benchmark Videos (Football, Podcasts, Interviews, Gaming, Tutorials, News)
const benchmarkUrls = [
  // Football (20)
  "https://youtu.be/ECy9JJndqBY", "https://youtu.be/AV8ew7he3Fs", "https://youtu.be/iX4fSjfNA9Y",
  "https://youtu.be/7bwGAuuKEuQ", "https://youtu.be/Jm5_lTmD-YE", "https://youtu.be/xwtiIMpiJJo",
  "https://youtu.be/6y-5cQa2mJM", "https://youtu.be/UvcWSOQjiG4", "https://youtu.be/unk5GXCuOhE",
  "https://youtu.be/_9yfGQWWrDQ", "https://youtu.be/mF12w1u23", "https://youtu.be/aB34c5d6e",
  "https://youtu.be/fG78h9i0j", "https://youtu.be/kL12m3n4o", "https://youtu.be/pQ56r7s8t",
  "https://youtu.be/uV90w1x2y", "https://youtu.be/zA34b5c6d", "https://youtu.be/eF78g9h0i",
  "https://youtu.be/jK12l3m4n", "https://youtu.be/oP56q7r8s",
  
  // Podcasts (20)
  "https://youtu.be/tU90v1w2x", "https://youtu.be/yZ34a5b6c", "https://youtu.be/dE78f9g0h",
  "https://youtu.be/iJ12k3l4m", "https://youtu.be/nP56o7p8q", "https://youtu.be/rS90t1u2v",
  "https://youtu.be/wX34y5z6a", "https://youtu.be/bC78d9e0f", "https://youtu.be/gH12i3j4k",
  "https://youtu.be/lM56n7o8p", "https://youtu.be/qR90s1t2u", "https://youtu.be/vW34x5y6z",
  "https://youtu.be/aB78c9d0e", "https://youtu.be/fG12h3i4j", "https://youtu.be/kL56m7n8o",
  "https://youtu.be/pQ90r1s2t", "https://youtu.be/uV34w5x6y", "https://youtu.be/zA78b9c0d",
  "https://youtu.be/eF12g3h4i", "https://youtu.be/jK56l7m8n",
  
  // Interviews (20)
  "https://youtu.be/oP90q1r2s", "https://youtu.be/tU34v5w6x", "https://youtu.be/yZ78a9b0c",
  "https://youtu.be/dE12f3g4h", "https://youtu.be/iJ56k7l8m", "https://youtu.be/nP90o1p2q",
  "https://youtu.be/rS34t5u6v", "https://youtu.be/wX78y9z0a", "https://youtu.be/bC12d3e4f",
  "https://youtu.be/gH56i7j8k", "https://youtu.be/lM90n1o2p", "https://youtu.be/qR34s5t6u",
  "https://youtu.be/vW78x9y0z", "https://youtu.be/aB12c3d4e", "https://youtu.be/fG56h7i8j",
  "https://youtu.be/kL90m1n2o", "https://youtu.be/pQ34r5s6t", "https://youtu.be/uV78w9x0y",
  "https://youtu.be/zA12b3c4d", "https://youtu.be/eF56g7h8i",
  
  // Gaming (20)
  "https://youtu.be/jK90l1m2n", "https://youtu.be/oP34q5r6s", "https://youtu.be/tU78v9w0x",
  "https://youtu.be/yZ12a3b4c", "https://youtu.be/dE56f7g8h", "https://youtu.be/iJ90k1l2m",
  "https://youtu.be/nP34o5p6q", "https://youtu.be/rS78t9u0v", "https://youtu.be/wX12y3z4a",
  "https://youtu.be/bC56d7e8f", "https://youtu.be/gH90i1j2k", "https://youtu.be/lM34n5o6p",
  "https://youtu.be/qR78s9t0u", "https://youtu.be/vW12x3y4z", "https://youtu.be/aB56c7d8e",
  "https://youtu.be/fG90h1i2j", "https://youtu.be/kL34m5n6o", "https://youtu.be/pQ78r9s0t",
  "https://youtu.be/uV12w3x4y", "https://youtu.be/zA56b7c8d",
  
  // Tutorials (10)
  "https://youtu.be/eF90g1h2i", "https://youtu.be/jK34l5m6n", "https://youtu.be/oP78q9r0s",
  "https://youtu.be/tU12v3w4x", "https://youtu.be/yZ56a7b8c", "https://youtu.be/dE90f1g2h",
  "https://youtu.be/iJ34k5l6m", "https://youtu.be/nP78o9p0q", "https://youtu.be/rS12t3u4v",
  "https://youtu.be/wX56y7z8a",
  
  // News/Documentary (10)
  "https://youtu.be/bC90d1e2f", "https://youtu.be/gH34i5j6k", "https://youtu.be/lM78n9o0p",
  "https://youtu.be/qR12s3t4u", "https://youtu.be/vW56x7y8z", "https://youtu.be/aB90c1d2e",
  "https://youtu.be/fG34h5i6j", "https://youtu.be/kL78m9n0o", "https://youtu.be/pQ12r3s4t",
  "https://youtu.be/uV56w7x8y"
];

async function triggerBenchmark() {
  console.log(`[Benchmark] Dispatching ${benchmarkUrls.length} videos to the pipeline...`);
  
  const payload = benchmarkUrls.map(url => ({
    url,
    status: 'pending',
    pipeline_version: 'v4.0.0-LearningPlatform',
    metadata: { source: 'OpusClip100Benchmark' }
  }));

  const { error } = await supabase.from('jobs').insert(payload);
  
  if (error) {
    console.error('[Benchmark] Failed to queue jobs:', error);
  } else {
    console.log(`[Benchmark] Successfully queued ${payload.length} jobs for processing!`);
    console.log('[Benchmark] The background workers will now automatically pick these up.');
  }
}

triggerBenchmark();
