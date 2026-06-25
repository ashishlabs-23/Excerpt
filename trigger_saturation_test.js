const urls = [
  "https://youtu.be/1kvknZoU--M",
  "https://www.youtube.com/watch?v=1BwqkxTBNWI",
  "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  "https://www.youtube.com/watch?v=9bZkp7q19f0"
];

const apiBase = "http://localhost:8010/api/video";

async function runSaturation() {
  console.log(`\n[Neural Saturation]: Initiating 15nd Sequence Burst...`);
  
  for (let i = 0; i < 15; i++) {
    const videoUrl = urls[i % urls.length];
    const intent = ['viral', 'educational', 'action'][i % 3];
    
    console.log(`[Neural Saturation]: Injecting job ${i + 1}/15...`);
    try {
      const response = await fetch(`${apiBase}/generate-clips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, numClips: 1, intent, purge: false })
      });
      const data = await response.json();
      console.log(`[Neural Saturation]: Job ${i + 1} synchronized -> ${data.jobId}`);
    } catch (err) {
      console.error(`[Neural Saturation]: Job ${i + 1} failed:`, err.message);
    }
    // Very fast burst
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`\n[Neural Saturation]: Sequence burst complete. Observing queue throughput.`);
}

runSaturation();
