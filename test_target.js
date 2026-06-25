const http = require('http');

const data = JSON.stringify({
  videoUrl: 'https://youtu.be/TScGpotKXm4?si=5-i8wpGg3PE2eyuB',
  numClips: 1,
  purge: false
});

const options = {
  hostname: 'localhost',
  port: 8010,
  path: '/api/video/generate-clips',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'Authorization': 'Bearer mock-token'
  }
};

let jobId = null;

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
        const responseData = JSON.parse(body);
        console.log("Job Submitted. Response:", responseData);
        jobId = responseData.jobId || responseData.id;
        if (jobId) {
            pollStatus(jobId);
        }
    } catch (e) {
        console.log("Failed to parse response:", body);
    }
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();

function pollStatus(id) {
    const pollOptions = {
        hostname: 'localhost',
        port: 8010,
        path: `/api/video/status/${id}`,
        method: 'GET',
        headers: {
          'Authorization': 'Bearer mock-token'
        }
    };

    const interval = setInterval(() => {
        const pollReq = http.request(pollOptions, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                try {
                    const statusData = JSON.parse(body);
                    console.log(`Status of ${id}: ${statusData.status} | Progress: ${statusData.progress}%`);
                    if (statusData.status === 'completed' || statusData.status === 'failed') {
                        clearInterval(interval);
                        console.log("Final State:", JSON.stringify(statusData, null, 2));
                    }
                } catch (e) {
                    console.log("Poll failed to parse:", body);
                }
            });
        });
        pollReq.on('error', (e) => console.log("Poll error:", e.message));
        pollReq.end();
    }, 5000);
}
