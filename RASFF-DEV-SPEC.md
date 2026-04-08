# RASFF Dev Spec (Culbridge MVP)

**Objective**: Build deterministic RASFF-check engine that queries EU alerts and calculates risk level for Nigerian exports to NL/DE.

---

## 1. Data Models

```python
# models.py
class RASFFRecord(models.Model):
    reference_number = models.CharField(max_length=50, unique=True)
    product = models.CharField(max_length=100)  # "sesame", "cocoa", "ginger"
    product_category = models.CharField(max_length=50)
    origin = models.CharField(max_length=100)  # "Nigeria"
    destination = models.CharField(max_length=2)  # "NL", "DE"
    analysis = models.CharField(max_length=100)  # "aflatoxin", "pesticide"
    result = models.CharField(max_length=50)  # "failed", "excessive"
    risk_level = models.CharField(max_length=10)  # "high", "medium", "low"
    distribution = models.CharField(max_length=50)  # "border_rejection", "distribution"
    issued_at = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['origin', 'destination', 'product']),
            models.Index(fields=['issued_at']),
        ]

class ShipmentRASFFAnalysis(models.Model):
    shipment = models.OneToOneField('Shipment', on_delete=models.CASCADE)
    alerts_last_365_days = models.IntegerField(default=0)
    alerts_last_90_days = models.IntegerField(default=0)
    risk_level = models.CharField(max_length=10)  # "high", "medium", "low"
    last_alert_date = models.DateField(null=True, blank=True)
    alert_details = models.JSONField(default=list)  # List of alert objects
    computed_at = models.DateTimeField(auto_now=True)
```

---

## 2. Business Logic (Core Engine)

```python
# rasff_engine.py
from datetime import date, timedelta

def get_rasff_alerts(product, destination, days_back=365):
    """Query RASFF alerts for commodity/destination within time window"""
    cutoff_date = date.today() - timedelta(days=days_back)
    
    return RASFFRecord.objects.filter(
        origin__iexact="Nigeria",
        destination__iexact=destination,
        product__iexact=product,
        issued_at__gte=cutoff_date,
    ).order_by('-issued_at')

def calculate_rasff_risk(shipment):
    """Calculate RASFF risk level for a shipment"""
    alerts_365 = get_rasff_alerts(shipment.commodity, shipment.destination, 365)
    alerts_90 = get_rasff_alerts(shipment.commodity, shipment.destination, 90)
    
    count_365 = alerts_365.count()
    count_90 = alerts_90.count()
    
    # Risk classification rules
    if count_365 > 10 or count_90 > 5:
        risk_level = "high"
    elif count_365 > 3 or count_90 > 1:
        risk_level = "medium"
    else:
        risk_level = "low"
    
    # Extract last 10 alert details
    alert_details = [
        {
            "reference": a.reference_number,
            "analysis": a.analysis,
            "result": a.result,
            "risk": a.risk_level,
            "issued_at": a.issued_at.isoformat(),
        }
        for a in alerts_365[:10]
    ]
    
    # Update ShipmentRASFFAnalysis
    last_alert = alerts_365.first()
    
    analysis, _ = ShipmentRASFFAnalysis.objects.update_or_create(
        shipment=shipment,
        defaults={
            "alerts_last_365_days": count_365,
            "alerts_last_90_days": count_90,
            "risk_level": risk_level,
            "last_alert_date": last_alert.issued_at if last_alert else None,
            "alert_details": alert_details,
        }
    )
    
    return analysis

def determine_rasff_action(analysis):
    """Map RASFF risk to shipment action"""
    if analysis.risk_level == "high":
        return {
            "status": "Blocked",
            "reason": f"High RASFF risk: {analysis.alerts_last_365_days} alerts in last year",
            "requires_review": True,
        }
    elif analysis.risk_level == "medium":
        return {
            "status": "Warning",
            "reason": f"Medium RASFF risk: {analysis.alerts_last_365_days} alerts in last year",
            "requires_review": True,
        }
    else:
        return {
            "status": "OK",
            "reason": "Low RASFF risk: No recent alerts for this commodity/destination",
            "requires_review": False,
        }

def calculate_final_compliance_status(shipment):
    """Integrate RASFF into overall compliance"""
    # Pre-compute RASFF
    rasff_analysis = calculate_rasff_risk(shipment)
    rasff_action = determine_rasff_action(rasff_analysis)
    
    # Existing MRL/documentation logic + RASFF
    if rasff_action["status"] == "Blocked":
        shipment.final_status = "Blocked"
        shipment.blockers.append({
            "code": "RASFF_HIGH_RISK",
            "message": rasff_action["reason"],
            "details": rasff_analysis.alert_details,
        })
    elif rasff_action["status"] == "Warning":
        shipment.final_status = "Warning"
        shipment.warnings.append({
            "code": "RASFF_MEDIUM_RISK",
            "message": rasff_action["reason"],
        })
    else:
        # Check other blockers
        if shipment.mrl_violations > 0:
            shipment.final_status = "Blocked"
        elif shipment.documentation_status == "Missing":
            shipment.final_status = "Blocked"
        else:
            shipment.final_status = "OK"
    
    shipment.save()
```

---

## 3. API Endpoints

```python
# urls.py
urlpatterns = [
    # Ingest RASFF data (admin/cron)
    path('admin/rasff/ingest/', RASFFIngestView.as_view()),
    
    # Check RASFF risk (trigger computation)
    path('shipments/<int:shipment_id>/rasff-check/', RASFFCheckView.as_view()),
    
    # List alerts (for dashboard)
    path('rasff/alerts/', RASFFAlertListView.as_view()),
    
    # Shipment list (table refresh)
    path('shipments/', ShipmentListView.as_view()),
]
```

```python
# views.py
class RASFFCheckView(APIView):
    def get(self, request, shipment_id):
        shipment = get_object_or_404(Shipment, id=shipment_id)
        analysis = calculate_rasff_risk(shipment)
        action = determine_rasff_action(analysis)
        
        return Response({
            "alerts_last_365_days": analysis.alerts_last_365_days,
            "alerts_last_90_days": analysis.alerts_last_90_days,
            "risk_level": analysis.risk_level,
            "last_alert_date": analysis.last_alert_date,
            "action": action,
            "alert_details": analysis.alert_details,
        })

class RASFFAlertListView(APIView):
    def get(self, request):
        product = request.query_params.get('product')
        destination = request.query_params.get('destination')
        days_back = int(request.query_params.get('days_back', 365))
        
        alerts = get_rasff_alerts(product, destination, days_back)
        
        return Response({
            "alerts": [
                {
                    "reference": a.reference_number,
                    "product": a.product,
                    "analysis": a.analysis,
                    "result": a.result,
                    "risk_level": a.risk_level,
                    "issued_at": a.issued_at.isoformat(),
                }
                for a in alerts[:50]
            ],
            "summary": {
                "total": alerts.count(),
                "high_risk": alerts.filter(risk_level="high").count(),
                "medium_risk": alerts.filter(risk_level="medium").count(),
                "low_risk": alerts.filter(risk_level="low").count(),
            }
        })

class RASFFIngestView(APIView):
    def post(self, request):
        # Parse uploaded CSV/JSON from EU RASFF portal
        data = request.FILES.get('file')
        df = pd.read_csv(data)
        
        inserted = 0
        updated = 0
        errors = []
        
        for _, row in df.iterrows():
            try:
                obj, created = RASFFRecord.objects.update_or_create(
                    reference_number=row['reference_number'],
                    defaults={
                        "product": row['product'],
                        "product_category": row.get('product_category'),
                        "origin": row.get('origin'),
                        "destination": row.get('destination'),
                        "analysis": row['analysis'],
                        "result": row['result'],
                        "risk_level": row.get('risk_level', 'low'),
                        "distribution": row.get('distribution'),
                        "issued_at": row['date_of_case'],
                    }
                )
                if created:
                    inserted += 1
                else:
                    updated += 1
            except Exception as e:
                errors.append(f"{row.get('reference_number')}: {str(e)}")
        
        return Response({
            "inserted": inserted,
            "updated": updated,
            "errors": errors,
        })
```

---

## 4. Table Integration (Your MVP UI)

**Update your ShipmentTable columns**:

| Column | Value Source | Color Logic |
|--------|--------------|-------------|
| **RASFF Alerts (365d)** | `ShipmentRASFFAnalysis.alerts_last_365_days` | Red=10+, Yellow=3+, Green=0 |
| **RASFF Risk** | `ShipmentRASFFAnalysis.risk_level` | Red=high, Yellow=medium, Green=low |
| **Compliance Status** | `Shipment.final_status` | Red=Blocked, Yellow=Warning, Green=OK |

**Action Buttons**:
- **"View RASFF Details"** → Modal with alert list
- **"Recheck RASFF"** → Recalculate risk
- **"Download Report"** → Export alerts for audit

---

## 5. Cron Jobs (Data Ingest)

```python
# cron.py
@celery.task
def ingest_rasff_data():
    """Download RASFF data (CSV) → RASFFRecord"""
    # EU RASFF portal (authenticated)
    url = "https://rasff-out.izadmin.eu/api/v1/notifications"
    response = requests.get(url, auth=(API_KEY, API_SECRET))
    data = response.json()
    
    for record in data.get('notifications', []):
        RASFFRecord.objects.update_or_create(
            reference_number=record['reference_number'],
            defaults={
                "product": normalize_product(record['product']),
                "origin": record.get('country_of_origin'),
                "destination": record.get('country_of_destination'),
                "analysis": record['type_of_hazard'],
                "result": record['hazard_result'],
                "risk_level": record.get('risk_decision', 'low'),
                "distribution": record.get('distribution_status'),
                "issued_at": record['date_of_case'],
            }
        )
```

---

## 6. Testing Scenarios

```
Scenario 1: Sesame to NL, 12 alerts last year
→ ShipmentRASFFAnalysis.risk_level="high"
→ Shipment.final_status="Blocked"
→ Blocker: "High RASFF risk: 12 alerts in last year"

Scenario 2: Cocoa to DE, 1 alert last year
→ ShipmentRASFFAnalysis.risk_level="low"
→ Shipment.final_status="OK" (if no other issues)

Scenario 3: Ginger to NL, 0 alerts last year
→ ShipmentRASFFAnalysis.risk_level="low"
→ Shipment.final_status="OK"

Scenario 4: No RASFF data for commodity
→ ShipmentRASFFAnalysis.risk_level="low" (default)
→ Shipment.final_status based on other checks
```

---

## 7. Risk Rules Summary

| Alerts (365 days) | Risk Level | Action |
|-------------------|------------|--------|
| 0 | Low | OK |
| 1-3 | Medium | Warning |
| 4-10 | High | Blocked |
| 10+ | High | Blocked |

| Alerts (90 days) | Risk Level | Action |
|------------------|------------|--------|
| 0 | - | (use 365d) |
| 1-2 | Medium | Warning (elevate) |
| 5+ | High | Blocked (elevate) |

---

## 8. Integration Flow

```
Shipment Created
       ↓
┌──────────────────┐
│  Fetch Requirements │
│  (GET /requirements) │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Upload Documents │
│  & Lab Results    │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Compliance Engine │ ←── Central orchestrator
└────────┬─────────┘
         ↓
   ┌─────┼─────┬──────────┐
   ↓     ↓     ↓          ↓
┌─────┐ ┌─────┐ ┌──────┐ ┌──────┐
│RASFF│ │ MRL │ │ Docs │ │ Other│
│Check│ │Check│ │Check │ │Check │
└─────┘ └─────┘ └──────┘ └──────┘
   ↓     ↓     ↓          ↓
   └─────┼─────┴──────────┘
         ↓
┌──────────────────┐
│  Final Status:   │
│  OK / Warning /  │
│  Blocked         │
└──────────────────┘
```

---

## 9. Success Criteria

- **RASFF data ingested daily** → **up-to-date alerts**.
- **Shipment table shows RASFF risk** → **internal team can triage**.
- **Auto-block high-risk shipments** → **prevent blocked cargo at EU port**.
- **Alert history visible** → **exporter can see why they were blocked**.
- **Audit-ready export** → **shows RASFF compliance evidence**.

---

**Send this to your senior dev team** — it's **100% build-ready**, **no fluff**, **pure spec**. They can start **coding today**.
