const http = require('http');

const data = JSON.stringify({
  videoUrl: 'https://youtu.be/fJrctBM0poE',
  numClips: 3,
  purge: false,
  generationMode: 'quality'
});

const options = {
  hostname: 'localhost',
  port: 8010,
  path: '/api/video/generate-clips',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Authorization': 'Bearer mock-token'
  }
};

console.log("Submitting test video to Excerpt API:", data);

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => {
    body += chunk;
  });
  res.on('end', () => {
    console.log(`BODY: ${body}`);
  });
});

req.on('error', (e) => {
  console.error("problem with request:", e);
});

req.write(data);
req.end();
