import requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
import time
import os
from typing import Dict
import uvicorn

app = FastAPI(title="Culbridge NEPC Exporter Verification", version="1.0.0")

NEPC_URL = "https://nepc.gov.ng/verify-exporter/"
RATE_LIMIT_DELAY = float(os.getenv('NEPC_RATE_LIMIT', '1.0'))  # seconds

def scrape_nepc_exporter(company_name: str) -> Dict:
    session = requests.Session()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    try:
        # GET cookies and initial page
        session.get(NEPC_URL, headers=headers, timeout=10)
        
        # POST search
        data = {'search': company_name}
        resp = session.post(NEPC_URL, data=data, headers=headers, timeout=15)
        resp.raise_for_status()
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Parse results (adjust selector based on actual HTML)
        result_div = soup.find('div', class_='search-result') or soup.find('table', class_='results') or soup.find('div', {'id': 'results'})
        
        if result_div and result_div.get_text(strip=True):
            status = result_div.get_text(strip=True)[:200]  # truncate
            verified = 'verified' in status.lower() or 'approved' in status.lower()
        else:
            status = 'No match found'
            verified = False
            
        return {
            'company': company_name,
            'status': status,
            'verified': verified,
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
        }
    except Exception as e:
        return {
            'company': company_name,
            'status': f'Error: {str(e)}',
            'verified': False,
            'timestamp': time.strftime('%Y-%m-%d %H:%M:%S')
        }

@app.post("/nepc-verify")
async def verify_exporter(company: str):
    time.sleep(RATE_LIMIT_DELAY)  # Ethical rate limiting
    result = scrape_nepc_exporter(company)
    
    # Log for audit (in production, use structured logging)
    print(f"NEPC verification for '{company}': {result['verified']}")
    
    return result

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)

