// Trigger script for Excerpt API
const axios = require('axios');

const VIDEO_URL = 'https://youtu.be/LhpZJwUboeI?si=Bc4R1dkk5fAO9Aqe';
const API_URL = 'http://localhost:8010/api/video/process';

async function trigger() {
  console.log(`[Trigger]: Submitting job for ${VIDEO_URL}...`);
  try {
    const response = await axios.post(API_URL, {
      videoUrl: VIDEO_URL,
      numClips: 3
    });
    console.log('[Trigger]: Success! Job ID:', response.data.jobId);
  } catch (err) {
    console.error('[Trigger]: Failed to submit job:', err.response?.data || err.message);
  }
}

trigger();
