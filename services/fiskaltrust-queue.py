#!/usr/bin/env python3
"""
Culbridge fiskaltrust OSS - EU Fiscal Compliance (NL/DE)
"""

from fiskaltrust import Queue
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import os
from typing import Dict
import logging

app = FastAPI(title="Culbridge fiskaltrust Signing Service")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# TID per country - replace with real TIDs
TIDS = {
  'NL': os.getenv('FISKA_TRUST_NL_TID', 'NL:demo-tid'),
  'DE': os.getenv('FISKA_TRUST_DE_TID', 'DE:demo-tid'),
}

class InvoiceData(BaseModel):
  amount: float
  hsCode: str
  country: str  # NL or DE
  reference: str

def sign_export_invoice(invoice_data: Dict) -> Dict:
    try:
        tid = TIDS.get(invoice_data['country'])
        if not tid:
            raise ValueError("Unsupported country")
        
        queue = Queue(tid)
        signed = queue.SignExportInvoice({
          'amount': invoice_data['amount'],
          'hsCode': invoice_data['hsCode'],
          'reference': invoice_data['reference']
        })
        
        logger.info(f"Signed invoice for {invoice_data['hsCode']} -> {invoice_data['country']}")
        return signed
    except Exception as e:
        logger.error(f"fiskaltrust signing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/sign-invoice")
async def sign_invoice_endpoint(data: InvoiceData):
    signed = sign_export_invoice(data.dict())
    return {
      'status': 'signed',
      'signature': signed,
      'tid': data.country,
      'timestamp': str(pd.Timestamp.now())
    }

@app.get("/health")
async def health():
    return {"status": "ready", "queues": list(TIDS.keys())}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)

