const http = require('https');

function poll() {
  http.get('https://excerpt-api.onrender.com/health/workers', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const json = JSON.parse(data);
          if (json.workers && json.workers.length === 3) {
            const uptime = json.workers[0].uptimeSeconds;
            if (uptime < 120) {
              console.log('✅ Deploy Success: API and Workers started with NEW deployment!');
              console.log(JSON.stringify(json, null, 2));
              process.exit(0);
            } else {
              console.log(`Still waiting for new deployment... (Current uptime: ${uptime}s)`);
            }
          }
        } catch (e) {}
      }
      setTimeout(poll, 15000);
    });
  }).on('error', (err) => {
    console.log(`Error: ${err.message}. Retrying...`);
    setTimeout(poll, 15000);
  });
}

console.log('Polling Render API for successful NEW deploy...');
poll();
