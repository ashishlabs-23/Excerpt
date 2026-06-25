
async function testKey() {
    const key = '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';
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: 'claude-3-haiku-20240307',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hello' }]
        })
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
}

testKey();
