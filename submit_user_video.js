const http = require('http');

const data = JSON.stringify({
  videoUrl: 'https://youtu.be/3ryID_SwU5E?si=-vPR97VL2GpKduPB',
  numClips: 2,
  purge: false
});

const options = {
  hostname: 'localhost',
  port: 8010,
  path: '/api/video/generate-clips',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log("Submitting video to Excerpt API:", data);

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (chunk) => {
    console.log(`BODY: ${chunk}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
