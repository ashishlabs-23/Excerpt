const videoUrl = "https://www.youtube.com/watch?v=1BwqkxTBNWI";
const numClips = 3;

async function triggerJob() {
  console.log(`[Neural Link]: Triggering 1GB Burst Test...`);
  try {
    const response = await fetch("http://localhost:8010/api/video/generate-clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, numClips })
    });
    const data = await response.json();
    console.log(`[Neural Link]: Job Triggered Success! ->`, data);
  } catch (error) {
    console.error(`[Neural Link]: Trigger Failed ->`, error.message);
  }
}

triggerJob();
