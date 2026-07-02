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
            console.log('✅ Deploy Success: API and Workers started.');
            console.log(JSON.stringify(json, null, 2));
            process.exit(0);
          }
        } catch (e) {}
      }
      console.log(`Still waiting... Status: ${res.statusCode}`);
      setTimeout(poll, 15000);
    });
  }).on('error', (err) => {
    console.log(`Error: ${err.message}. Retrying...`);
    setTimeout(poll, 15000);
  });
}

console.log('Polling Render API for successful deploy...');
poll();
