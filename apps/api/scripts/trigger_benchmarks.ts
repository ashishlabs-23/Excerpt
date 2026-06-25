import fetch from 'node-fetch';

const URLs = [
  'https://www.youtube.com/live/X7158uQk1yI', // Full match
  'https://youtu.be/mxTJRptlBlk', // Highlights
  'https://youtu.be/gjvOfgTz6cc', // Goals
  'https://youtu.be/1nORGVL0Ito', // Counterattack
  'https://youtu.be/3DGztcamZWA'  // VAR
];

async function triggerJobs() {
  console.log("Submitting 5 benchmark videos to Excerpt API...");
  const jobIds = [];
  
  for (const url of URLs) {
    try {
      const response = await fetch('http://localhost:8010/api/video/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl: url, user_id: 'test_audit_user' })
      });
      
      const data = await response.json();
      console.log(`Submitted ${url}:`, data);
      
      if (data.jobId) {
        jobIds.push(data.jobId);
      }
    } catch (e) {
      console.error(`Failed to submit ${url}:`, e);
    }
  }
  
  console.log("All jobs submitted. Job IDs:", jobIds);
}

triggerJobs();
