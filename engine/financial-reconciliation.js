/**
 * Financial Reconciliation Layer
 * 
 * Handles:
 * - Live FX rate fetching
 * - Payment verification against Remita
 * - Fee calculation with audit trail
 * - Partial payments and adjustments
 */

const crypto = require('crypto');

// Simulated FX rate cache (in production, fetch from live API)
const FX_RATE_CACHE = {
  'USD/NGN': { rate: 1550.00, timestamp: new Date().toISOString() },
  'EUR/NGN': { rate: 1680.00, timestamp: new Date().toISOString() },
  'GBP/NGN': { rate: 1950.00, timestamp: new Date().toISOString() },
  'USD/EUR': { rate: 0.92, timestamp: new Date().toISOString() }
};

// Fee structure
const FEE_STRUCTURE = {
  nes_levy: {
    rate: 0.01, // 1% of FOB
    min: 50000,
    max: 500000
  },
  duty: {
    rate: 0.20, // 20% (simplified - actual varies by HS chapter)
    varies_by: ['hs_chapter', 'product_type']
  },
  processing_fee: 15000,
  inspection_fee: 10000,
  clearance_fee: 5000,
  naqs_fee: 2500,
  nepc_fee: 5000,
  nafdac_fee: 10000,
  son_fee: 7500
};

// Simulated Remita payment records
const REMITA_PAYMENTS = {
  'PAY-CB-001': {
    payment_ref: 'PAY-CB-001',
    amount: 215000,
    currency: 'NGN',
    status: 'COMPLETED',
    paid_at: '2024-03-20T10:00:00Z',
    channel: 'BANK_TRANSFER'
  },
  'PAY-CB-002': {
    payment_ref: 'PAY-CB-002',
    amount: 180000,
    currency: 'NGN',
    status: 'PENDING',
    paid_at: null,
    channel: 'BANK_TRANSFER'
  }
};

/**
 * Get live FX rate (with fallback to cache)
 * @param {string} from - Source currency
 * @param {string} to - Target currency
 * @returns {Object} FX rate with timestamp
 */
async function getFXRate(from = 'USD', to = 'NGN') {
  const key = `${from}/${to}`;
  
  // In production, call live API
  // const liveRate = await fetch(`https://api.exchange rate.com/latest?from=${from}&to=${to}`);
  
  const cached = FX_RATE_CACHE[key];
  
  if (cached) {
    // Check if stale (> 1 hour)
    const hourAgo = new Date(Date.now() - 3600000);
    if (new Date(cached.timestamp) < hourAgo) {
      console.log(`[FX] Warning: Using stale rate (${cached.timestamp})`);
    }
    return cached;
  }
  
  // Fallback to USD base
  if (from !== 'USD' && to !== 'USD') {
    const fromUSD = FX_RATE_CACHE[`USD/${to}`]?.rate || 1;
    const toUSD = FX_RATE_CACHE[`USD/${from}`]?.rate || 1;
    return {
      rate: fromUSD / toUSD,
      timestamp: new Date().toISOString(),
      source: 'calculated'
    };
  }
  
  return { rate: 1, timestamp: new Date().toISOString(), source: 'fallback' };
}

/**
 * Calculate fees for a shipment
 * @param {Object} shipment - Shipment data
 * @returns {Object} Calculated fees with audit trail
 */
async function calculateFees(shipment) {
  const {
    fob_value = 0,
    currency = 'USD',
    hs_code = '',
    product_type = 'general'
  } = shipment;
  
  const result = {
    shipment_id: shipment.id,
    calculated_at: new Date().toISOString(),
    input: {
      fob_value,
      currency,
      hs_code,
      product_type
    },
    fees: {},
    total_ngn: 0,
    exchange_rate: null,
    audit_trail: []
  };
  
  // Get FX rate
  const fxRate = await getFXRate(currency, 'NGN');
  result.exchange_rate = fxRate;
  
  // Convert FOB to NGN
  const fobNgn = fob_value * fxRate.rate;
  result.audit_trail.push({
    action: 'FX_CONVERSION',
    from: currency,
    to: 'NGN',
    rate: fxRate.rate,
    value: fob_value,
    result: fobNgn
  });
  
  // Calculate NES Levy
  let nesLevy = Math.max(
    FEE_STRUCTURE.nes_levy.min,
    Math.min(fobNgn * FEE_STRUCTURE.nes_levy.rate, FEE_STRUCTURE.nes_levy.max)
  );
  result.fees.nes_levy = {
    amount: nesLevy,
    description: 'National Economic Stimulation Levy',
    rate_applied: FEE_STRUCTURE.nes_levy.rate,
    base_value: fobNgn
  };
  result.audit_trail.push({
    action: 'NES_LEVY_CALC',
    rate: FEE_STRUCTURE.nes_levy.rate,
    calculated: nesLevy
  });
  
  // Calculate Duty (simplified - varies by HS chapter)
  const chapter = hs_code?.substring(0, 2) || '00';
  let dutyRate = 0.20; // default
  if (['12', '18'].includes(chapter)) dutyRate = 0.05; // agro exports
  if (['84', '85'].includes(chapter)) dutyRate = 0.25; // machinery
  
  const duty = fobNgn * dutyRate;
  result.fees.duty = {
    amount: duty,
    description: 'Import Duty',
    rate_applied: dutyRate,
    hs_chapter: chapter,
    base_value: fobNgn
  };
  result.audit_trail.push({
    action: 'DUTY_CALC',
    chapter,
    rate: dutyRate,
    calculated: duty
  });
  
  // Agency fees
  result.fees.processing_fee = {
    amount: FEE_STRUCTURE.processing_fee,
    description: 'Processing Fee'
  };
  result.fees.inspection_fee = {
    amount: FEE_STRUCTURE.inspection_fee,
    description: 'Inspection Fee'
  };
  result.fees.clearance_fee = {
    amount: FEE_STRUCTURE.clearance_fee,
    description: 'Clearance Fee'
  };
  result.fees.naqs_fee = {
    amount: FEE_STRUCTURE.naqs_fee,
    description: 'NAQS Processing Fee'
  };
  result.fees.nepc_fee = {
    amount: FEE_STRUCTURE.nepc_fee,
    description: 'NEPC Fee'
  };
  result.fees.nafdac_fee = {
    amount: FEE_STRUCTURE.nafdac_fee,
    description: 'NAFDAC Fee'
  };
  result.fees.son_fee = {
    amount: FEE_STRUCTURE.son_fee,
    description: 'SON Fee'
  };
  
  // Calculate total
  result.total_ngn = Object.values(result.fees).reduce((sum, fee) => sum + fee.amount, 0);
  
  // Generate payment reference
  result.payment_ref = `PAY-${shipment.id}-${Date.now()}`;
  
  result.audit_trail.push({
    action: 'TOTAL_CALC',
    total: result.total_ngn,
    payment_ref: result.payment_ref
  });
  
  return result;
}

/**
 * Verify payment against Remita
 * @param {string} paymentRef - Payment reference
 * @param {number} expectedAmount - Expected amount in NGN
 * @returns {Object} Payment verification result
 */
async function verifyPayment(paymentRef, expectedAmount) {
  const result = {
    payment_ref: paymentRef,
    verified: false,
    status: 'UNKNOWN',
    verified_at: new Date().toISOString(),
    details: {},
    errors: []
  };
  
  // Simulate Remita API call
  const payment = REMITA_PAYMENTS[paymentRef];
  
  if (!payment) {
    result.errors.push(`Payment reference ${paymentRef} not found in Remita`);
    result.status = 'NOT_FOUND';
    return result;
  }
  
  result.details = payment;
  
  // Check status
  if (payment.status !== 'COMPLETED') {
    result.errors.push(`Payment status: ${payment.status}`);
    result.status = payment.status;
    return result;
  }
  
  // Check amount
  if (Math.abs(payment.amount - expectedAmount) > 100) {
    result.errors.push(`Amount mismatch: expected ${expectedAmount}, received ${payment.amount}`);
    result.status = 'AMOUNT_MISMATCH';
    return result;
  }
  
  result.verified = true;
  result.status = 'VERIFIED';
  
  return result;
}

/**
 * Reconcile financial transaction
 * @param {Object} shipment - Shipment data
 * @param {Object} feeCalculation - Fee calculation result
 * @param {string} paymentRef - Payment reference
 * @returns {Object} Reconciliation result
 */
async function reconcilePayment(shipment, feeCalculation, paymentRef) {
  const result = {
    shipment_id: shipment.id,
    payment_ref: paymentRef,
    reconciled: false,
    reconciled_at: new Date().toISOString(),
    steps: [],
    final_status: 'UNKNOWN'
  };
  
  // Step 1: Verify payment against Remita
  const paymentVerification = await verifyPayment(paymentRef, feeCalculation.total_ngn);
  result.steps.push({
    step: 'PAYMENT_VERIFICATION',
    ...paymentVerification
  });
  
  if (!paymentVerification.verified) {
    result.final_status = 'PAYMENT_FAILED';
    return result;
  }
  
  // Step 2: Store FX rate used (audit requirement)
  result.steps.push({
    step: 'FX_RATE_STORED',
    rate: feeCalculation.exchange_rate.rate,
    timestamp: feeCalculation.exchange_rate.timestamp,
    source: feeCalculation.exchange_rate.source
  });
  
  // Step 3: Verify fee calculation integrity
  const recalculated = await calculateFees(shipment);
  const amountMatches = Math.abs(recalculated.total_ngn - feeCalculation.total_ngn) < 100;
  
  result.steps.push({
    step: 'FEE_INTEGRITY_CHECK',
    original_total: feeCalculation.total_ngn,
    recalculated_total: recalculated.total_ngn,
    matches: amountMatches
  });
  
  if (!amountMatches) {
    result.final_status = 'FEE_MISMATCH';
    result.errors = ['Calculated fees differ from stored values'];
    return result;
  }
  
  result.reconciled = true;
  result.final_status = 'RECONCILED';
  
  return result;
}

/**
 * Handle partial payment
 * @param {Object} paymentData - Payment data
 * @returns {Object} Partial payment handling result
 */
async function handlePartialPayment(paymentData) {
  const { paymentRef, paidAmount, expectedAmount } = paymentData;
  
  const result = {
    payment_ref: paymentRef,
    paid: paidAmount,
    expected: expectedAmount,
    remaining: expectedAmount - paidAmount,
    status: 'PARTIAL',
    action_required: null,
    created_at: new Date().toISOString()
  };
  
  const percentagePaid = (paidAmount / expectedAmount) * 100;
  
  if (percentagePaid >= 95) {
    // Within tolerance - consider paid
    result.status = 'PAID';
    result.action_required = 'PROCESS_WITH_OVERRIDE';
    result.remaining = 0;
  } else if (percentagePaid >= 50) {
    // Partial - requires manual approval
    result.status = 'PARTIAL_REQUIRES_APPROVAL';
    result.action_required = 'MANUAL_REVIEW_REQUIRED';
  } else {
    // Insufficient - reject
    result.status = 'INSUFFICIENT';
    result.action_required = 'REJECT_PAYMENT';
  }
  
  return result;
}

module.exports = {
  getFXRate,
  calculateFees,
  verifyPayment,
  reconcilePayment,
  handlePartialPayment,
  FEE_STRUCTURE
};

// Test execution
if (require.main === module) {
  console.log('=== Financial Reconciliation Test ===\n');
  
  // Test 1: Fee calculation
  console.log('Test 1: Fee calculation');
  const shipment = {
    id: 'TEST-SHIP-001',
    fob_value: 10000,
    currency: 'USD',
    hs_code: '18010000'
  };
  
  const fees = calculateFees(shipment).then(result => {
    console.log('Total:', result.total_ngn);
    console.log('Payment Ref:', result.payment_ref);
    
    // Test 2: Payment verification
    console.log('\nTest 2: Payment verification');
    verifyPayment('PAY-CB-001', result.total_ngn).then(verification => {
      console.log(JSON.stringify(verification, null, 2));
    });
  });
}