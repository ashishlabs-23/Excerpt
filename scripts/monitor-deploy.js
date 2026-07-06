const https = require('https');

const url = 'https://excerpt-api.onrender.com/api/system/self-test';

function check() {
  https.get(url, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200 && data.includes('"status":"PASS"')) {
        console.log('\n✅ Deployment SUCCESSFUL and LIVE!');
        console.log('Self-Test Output:', data);
        process.exit(0);
      } else if (res.statusCode === 401) {
        console.log('\nEndpoint is UP (returned 401). Wait for full deployment...');
      } else {
        process.stdout.write('.');
      }
      setTimeout(check, 5000);
    });
  }).on('error', () => {
    process.stdout.write('x');
    setTimeout(check, 5000);
  });
}

console.log('Monitoring Render Deployment...');
check();
