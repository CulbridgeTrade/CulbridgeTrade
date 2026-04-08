from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
import requests
import pandas as pd
import zipfile
from io import BytesIO
from bs4 import BeautifulSoup
from typing import Dict, List
from datetime import datetime
from enum import Enum
import os
import logging

app = FastAPI(title="Culbridge Compliance Microservice")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ComplianceStatus(str, Enum):
    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"

class Shipment(BaseModel):
    id: str
    exporter_name: str
    commodity: str
    destination_country: str
    nepc_verified: bool
    rasff_count: int
    lab_result: str = "Pending"
    compliance_status: ComplianceStatus = ComplianceStatus.FAILED
    fix_suggestions: Dict[str, str] = {}

class ComplianceResult(BaseModel):
    compliance: ComplianceStatus
    nepc: Dict
    rasff_alerts: List
    fiskaltrust_signed_invoice: Dict = None
    audit_trail: List[str] = []

# Placeholder OCR - replace with Tesseract integration
async def ocr_extract(file: UploadFile):
    logger.info(f"OCR processing {file.filename}")
    # Simulate OCR
    return {
        'company_name': 'ABC Exports Ltd',
        'commodity': 'Sesame Seeds',
        'invoice_data': {'amount': 1250.50, 'hsCode': '1207.40'}
    }

def scrape_nepc_exporter(company_name: str) -> Dict:
    session = requests.Session()
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    try:
        session.get('https://nepc.gov.ng/verify-exporter/', headers=headers, timeout=10)
        data = {'search': company_name}
        resp = session.post('https://nepc.gov.ng/verify-exporter/', data=data, headers=headers, timeout=15)
        soup = BeautifulSoup(resp.text, 'html.parser')
        result_div = soup.find('div', class_='search-result')
        status = result_div.get_text(strip=True)[:200] if result_div else 'No match found'
        verified = 'verified' in status.lower() or 'approved' in status.lower()
        return {'company': company_name, 'status': status, 'verified': verified}
    except Exception as e:
        logger.error(f"NEPC scrape failed: {e}")
        return {'company': company_name, 'status': f'Error: {str(e)}', 'verified': False}

def fetch_rasff_latest() -> List[Dict]:
    try:
        zip_url = 'https://food.ec.europa.eu/system/files/2024-01/rasff_202401_en.zip'  # Update monthly
        resp = requests.get(zip_url, timeout=60)
        resp.raise_for_status()
        with zipfile.ZipFile(BytesIO(resp.content)) as z:
            df = pd.read_csv(z.open(z.namelist()[0]), low_memory=False)
        ng_alerts = df[df['notifCountry'].str.contains('Nigeria', na=False, case=False)]
        return ng_alerts[['alertDate', 'prodDesc', 'riskDecided', 'notifCountry']].to_dict('records')
    except Exception as e:
        logger.error(f"RASFF fetch failed: {e}")
        return []

@app.post("/compliance-check")
async def compliance_check(file: UploadFile = File(...)):
    """End-to-End Compliance Controller"""
    audit_trail = []
    
    # Step 1: OCR
    audit_trail.append(f"OCR extracted from {file.filename}")
    ocr_data = await ocr_extract(file)
    audit_trail.append(f"OCR: {ocr_data['commodity']} by {ocr_data['company_name']}")
    
    # Step 2: NEPC Verification
    audit_trail.append("Running NEPC verification...")
    nepc_result = scrape_nepc_exporter(ocr_data['company_name'])
    audit_trail.append(f"NEPC: {nepc_result['verified']}")
    
    if not nepc_result['verified']:
        return ComplianceResult(
            compliance=ComplianceStatus.BLOCKED,
            nepc=nepc_result,
            rasff_alerts=[],
            audit_trail=audit_trail
        )
    
    # Step 3: RASFF Risk Check
    audit_trail.append("Running RASFF risk check...")
    rasff_alerts = fetch_rasff_latest()
    commodity_alerts = [a for a in rasff_alerts if ocr_data['commodity'].lower() in a['prodDesc'].lower()]
    audit_trail.append(f"RASFF: {len(commodity_alerts)} alerts")
    
    if len(commodity_alerts) > 0:
        return ComplianceResult(
            compliance=ComplianceStatus.BLOCKED,
            nepc=nepc_result,
            rasff_alerts=commodity_alerts,
            audit_trail=audit_trail
        )
    
    # Step 4: fiskaltrust Signing (stub - replace with real TID)
    audit_trail.append("Running fiskaltrust invoice signing...")
    try:
        signed_invoice = {
            'signature': 'fiskaltrust_signed',
            'qrCode': 'QR_CODE_DATA',
            'timestamp': str(datetime.now()),
            'tid': 'DE:demo-tid'
        }
        audit_trail.append("fiskaltrust: Signed")
    except Exception as e:
        audit_trail.append(f"fiskaltrust failed: {e}")
        signed_invoice = None
    
    return ComplianceResult(
        compliance=ComplianceStatus.PASSED,
        nepc=nepc_result,
        rasff_alerts=[],
        fiskaltrust_signed_invoice=signed_invoice,
        audit_trail=audit_trail
    )

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)

