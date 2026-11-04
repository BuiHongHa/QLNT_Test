import urllib.request
import urllib.parse
import json

try:
    url = "http://127.0.0.1:5000/api/dormroom/requests/1"
    payload = {"status": "REJECTED", "request_type": "ROOM_ADMIN"}
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'}, method='PUT')
    
    with urllib.request.urlopen(req) as response:
        print("Status Code:", response.getcode())
        print("Response JSON:", response.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print("Error Code:", e.code)
    print("Error Body:", e.read().decode('utf-8'))
except Exception as e:
    print("Error:", e)
