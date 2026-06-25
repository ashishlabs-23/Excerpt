const fs = require('fs');

function searchErrors() {
    const content = fs.readFileSync('api_v8.log', 'utf8');
    const lines = content.split('\n');
    const matches = lines.filter(line => 
        line.includes('error') || 
        line.includes('failed') || 
        line.includes('crash') || 
        line.includes('exception')
    );
    console.log("ERRORS COUNT:", matches.length);
    console.log("LAST 15 ERRORS:");
    matches.slice(-15).forEach(m => console.log(m));
}
searchErrors();
