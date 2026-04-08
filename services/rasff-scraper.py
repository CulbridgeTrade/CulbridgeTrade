#!/usr/bin/env python3
"""
Culbridge EU RASFF Alerts Scraper
Daily cron job: download ZIP → unzip CSV → filter Nigeria → store alerts for fast commodity lookup
"""

import requests
import zipfile
import pandas as pd
from io import BytesIO
import sqlite3
import os
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_PATH = os.getenv('RASFF_DB', 'culbridge.db')
ZIP_URL = 'https://food.ec.europa.eu/system/files/2024-01/rasff_202401_en.zip'  # Update monthly

def fetch_rasff_latest():
    """Download latest RASFF ZIP, extract CSV, filter Nigeria"""
    try:
        resp = requests.get(ZIP_URL, timeout=60)
        resp.raise_for_status()
        
        with zipfile.ZipFile(BytesIO(resp.content)) as z:
            csv_file = z.namelist()[0]
            df = pd.read_csv(z.open(csv_file), low_memory=False)
        
        # Filter Nigeria alerts
        ng_df = df[df['notifCountry'].str.contains('Nigeria', na=False, case=False)]
        
        # Select key columns
        alerts = ng_df[[
            'alertDate', 'prodCode', 'prodDesc', 'riskDecided', 'notifCountry', 'prodCat'
        ]].to_dict('records')
        
        logger.info(f"Fetched {len(alerts)} Nigeria RASFF alerts")
        return alerts
        
    except Exception as e:
        logger.error(f"RASFF fetch failed: {e}")
        return []

def store_rasff_alerts(alerts):
    """Store filtered alerts in SQLite for fast lookup"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rasff_alerts (
            id INTEGER PRIMARY KEY,
            alert_date TEXT,
            prod_code TEXT,
            prod_desc TEXT,
            risk TEXT,
            notif_country TEXT,
            prod_cat TEXT,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Clear old data (>90 days)
    cursor.execute("DELETE FROM rasff_alerts WHERE fetched_at < datetime('now', '-90 days')")
    
    # Insert new alerts
    for alert in alerts:
        cursor.execute('''
            INSERT INTO rasff_alerts (alert_date, prod_code, prod_desc, risk, notif_country, prod_cat)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (alert.get('alertDate'), alert.get('prodCode'), alert.get('prodDesc'), 
              alert.get('riskDecided'), alert.get('notifCountry'), alert.get('prodCat')))
    
    conn.commit()
    conn.close()
    logger.info(f"Stored {len(alerts)} RASFF alerts")

def query_rasff_commodity(commodity: str):
    """Query DB for commodity-specific alerts"""
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT * FROM rasff_alerts WHERE prod_desc LIKE ? ORDER BY fetched_at DESC LIMIT 10",
        conn, params=[f'%{commodity}%']
    )
    conn.close()
    return df.to_dict('records')

if __name__ == '__main__':
    alerts = fetch_rasff_latest()
    store_rasff_alerts(alerts)
    
    # Test query
    sesame = query_rasff_commodity('sesame')
    print(f"Sesame alerts: {len(sesame)}")

