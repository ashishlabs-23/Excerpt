import requests
import json

def test_ollama():
    url = "http://localhost:11434/api/chat"
    payload = {
        "model": "qwen2.5-coder:7b",
        "messages": [
            {"role": "system", "content": "Return a JSON object with a field 'status' set to 'ok' and 'test' set to true. No extra text."},
            {"role": "user", "content": "Generate the JSON."}
        ],
        "stream": False
    }
    
    try:
        print(f"Connecting to Ollama at {url}...")
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        
        content = response.json()['message']['content'].strip()
        print(f"Raw Response: {content}")
        
        # Simple cleanup as done in viral_pipeline.py
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
            
        data = json.loads(content)
        print(f"Parsed JSON: {data}")
        
        if data.get('status') == 'ok' and data.get('test') is True:
            print("Ollama Test: SUCCESS")
            return True
        else:
            print("Ollama Test: FAILED (Unexpected content)")
            return False
            
    except Exception as e:
        print(f"Ollama Test: ERROR - {e}")
        return False

if __name__ == "__main__":
    test_ollama()
