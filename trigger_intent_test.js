const videoUrl = "https://youtu.be/1kvknZoU--M";
const intents = ['viral', 'storyteller', 'educational', 'action'];
const apiBase = "http://localhost:8010/api/video";

async function runAudit() {
  console.log(`\n[Neural Audit]: Initiating 4-Dimensional Matrix Test...`);
  console.log(`[Neural Audit]: Target URL: ${videoUrl}\n`);

  // Step 1: Purge existing neural fragments for a clean audit
  console.log(`[Neural Audit]: Vaporizing redundant fragments (Neural Flush)...`);
  await fetch(`${apiBase}/purge`, { method: "POST" });

  // Step 2: Trigger Intent Matrix
  for (const intent of intents) {
    console.log(`[Neural Audit]: Uploading intention segment: [${intent.toUpperCase()}]...`);
    try {
      const response = await fetch(`${apiBase}/generate-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, numClips: 2, intent })
      });
      const data = await response.json();
      console.log(`[Neural Audit]: ${intent.toUpperCase()} sequence synchronized. -> JobId: ${data.jobId}`);
    } catch (err) {
      console.error(`[Neural Audit]: ${intent.toUpperCase()} sequence failed:`, err.message);
    }
    // Small delay between submissions to avoid race conditions in queue registration
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n[Neural Audit]: Matrix Test Sync Complete. Pipeline active.`);
}

runAudit();
