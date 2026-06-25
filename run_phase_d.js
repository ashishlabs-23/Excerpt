const http = require('http');

const data = JSON.stringify({ videoUrl: 'https://youtu.be/TScGpotKXm4?si=5-i8wpGg3PE2eyuB', numClips: 1, purge: false });

const req = http.request({
    hostname: 'localhost',
    port: 8010,
    path: '/api/video/generate-clips',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, 'Authorization': 'Bearer mock-token' }
}, (res) => {
    let body = '';
    res.on('data', (c) => body += c);
    res.on('end', () => {
        const d = JSON.parse(body);
        const id = d.jobId || d.id;
        console.log(`Phase D Job Submitted: ${id}`);
        const int = setInterval(() => {
            http.get(`http://localhost:8010/api/video/status/${id}`, { headers: { 'Authorization': 'Bearer mock-token' } }, (pollRes) => {
                let pb = '';
                pollRes.on('data', c => pb += c);
                pollRes.on('end', () => {
                    const st = JSON.parse(pb);
                    console.log(`${new Date().toISOString()} -> ${st.status} (${st.progress}%)`);
                    if (st.status === 'completed' || st.status === 'failed') {
                        console.log(JSON.stringify(st.debug_data, null, 2));
                        clearInterval(int);
                    }
                });
            });
        }, 5000);
    });
});
req.write(data);
req.end();
