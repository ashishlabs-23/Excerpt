
const axios = require('axios');

const jobId = process.argv[2];
if (!jobId) {
    console.error('Please provide a jobId');
    process.exit(1);
}

async function checkStatus() {
    try {
        const response = await axios.get(`http://localhost:8000/api/video/status/${jobId}`);
        console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Error checking status:', error.message);
    }
}

checkStatus();
