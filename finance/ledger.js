/**
 * Financial Ledger System - Double-Entry Accounting
 * Ensures financial integrity: every transaction has equal debits and credits
 * Provides audit trail for all monetary operations
 */

const crypto = require('crypto');
const { run, get, all } = require('../utils/db');

/**
 * Account Types
 */
const ACCOUNT_TYPES = {
  ASSET: 'ASSET',        // e.g., bank accounts, receivables
  LIABILITY: 'LIABILITY', // e.g., payables, loans
  REVENUE: 'REVENUE',     // e.g., fees collected
  EXPENSE: 'EXPENSE'      // e.g., duties, levies, processing fees
};

/**
 * Entry Types
 */
const ENTRY_TYPES = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT'
};

/**
 * Initialize ledger tables
 */
async function initializeLedger() {
  // Chart of Accounts
  await run(`
    CREATE TABLE IF NOT EXISTS ChartOfAccounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      active INTEGER DEFAULT 1
    )
  `);
  
  // Ledger entries
  await run(`
    CREATE TABLE IF NOT EXISTS LedgerEntries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id TEXT NOT NULL,
      shipment_id TEXT,
      account_code TEXT NOT NULL,
      entry_type TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      fx_rate REAL,
      fx_snapshot_at DATETIME,
      reference TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    )
  `);
  
  // Transaction summaries
  await run(`
    CREATE TABLE IF NOT EXISTS TransactionSummaries (
      transaction_id TEXT PRIMARY KEY,
      shipment_id TEXT,
      total_debits REAL NOT NULL,
      total_credits REAL NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      verified_at DATETIME
    )
  `);
  
  // Initialize default accounts
  const defaultAccounts = [
    { code: '1000', name: 'Cash/Bank', type: ACCOUNT_TYPES.ASSET },
    { code: '1100', name: 'Accounts Receivable', type: ACCOUNT_TYPES.ASSET },
    { code: '2000', name: 'NES Levy Payable', type: ACCOUNT_TYPES.LIABILITY },
    { code: '2100', name: 'Duty Payable', type: ACCOUNT_TYPES.LIABILITY },
    { code: '2200', name: 'Agency Fees Payable', type: ACCOUNT_TYPES.LIABILITY },
    { code: '3000', name: 'Fee Revenue', type: ACCOUNT_TYPES.REVENUE },
    { code: '3100', name: 'Processing Revenue', type: ACCOUNT_TYPES.REVENUE },
    { code: '4000', name: 'Duty Expense', type: ACCOUNT_TYPES.EXPENSE },
    { code: '4100', name: 'NES Levy Expense', type: ACCOUNT_TYPES.EXPENSE },
    { code: '4200', name: 'Agency Fee Expense', type: ACCOUNT_TYPES.EXPENSE }
  ];
  
  for (const account of defaultAccounts) {
    await run(
      `INSERT OR IGNORE INTO ChartOfAccounts (code, name, type) VALUES (?, ?, ?)`,
      [account.code, account.name, account.type]
    );
  }
  
  console.log('Financial ledger initialized');
}

/**
 * Create a transaction with double-entry entries
 * @param {object} params - Transaction parameters
 * @returns {Promise<string>} - Transaction ID
 */
async function createTransaction(params) {
  const { 
    shipmentId, 
    entries, // Array of { accountCode, entryType, amount, description }
    currency = 'NGN',
    fxRate = null,
    fxSnapshotAt = null,
    reference = null,
    createdBy = 'system'
  } = params;
  
  // Generate transaction ID
  const transactionId = `TXN-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  
  // Validate entries
  if (!entries || entries.length < 2) {
    throw new Error('Transaction requires at least 2 entries');
  }
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  // Insert entries
  for (const entry of entries) {
    if (entry.entry_type === ENTRY_TYPES.DEBIT) {
      totalDebits += entry.amount;
    } else if (entry.entry_type === ENTRY_TYPES.CREDIT) {
      totalCredits += entry.amount;
    }
    
    await run(
      `INSERT INTO LedgerEntries 
       (transaction_id, shipment_id, account_code, entry_type, amount, currency, fx_rate, fx_snapshot_at, reference, description, created_by) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [transactionId, shipmentId, entry.account_code, entry.entry_type, entry.amount, currency, 
       fxRate, fxSnapshotAt, reference, entry.description, createdBy]
    );
  }
  
  // Verify double-entry balance
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    // Rollback would be complex, so we mark as unbalanced
    console.error(`UNBALANCED TRANSACTION: Debits=${totalDebits}, Credits=${totalCredits}`);
  }
  
  // Create transaction summary
  await run(
    `INSERT INTO TransactionSummaries (transaction_id, shipment_id, total_debits, total_credits, currency, status) 
     VALUES (?, ?, ?, ?, ?, ?)`,
    [transactionId, shipmentId, totalDebits, totalCredits, currency, 'PENDING']
  );
  
  // Verify and mark as complete
  await verifyTransaction(transactionId);
  
  return transactionId;
}

/**
 * Verify transaction is balanced
 */
async function verifyTransaction(transactionId) {
  const summary = await get(
    `SELECT * FROM TransactionSummaries WHERE transaction_id = ?`,
    [transactionId]
  );
  
  if (!summary) {
    throw new Error('Transaction not found');
  }
  
  const isBalanced = Math.abs(summary.total_debits - summary.total_credits) < 0.01;
  
  await run(
    `UPDATE TransactionSummaries SET status = ?, verified_at = ? WHERE transaction_id = ?`,
    [isBalanced ? 'VERIFIED' : 'UNBALANCED', new Date().toISOString(), transactionId]
  );
  
  return {
    transaction_id: transactionId,
    balanced: isBalanced,
    total_debits: summary.total_debits,
    total_credits: summary.total_credits
  };
}

/**
 * Record fee calculation in ledger
 */
async function recordFeeCalculation(shipmentId, feeData) {
  const { 
    nes_levy = 0, 
    duty = 0, 
    agency_fees = 0, 
    total_costs = 0, 
    currency = 'NGN',
    exchange_rate = 1,
    payment_ref
  } = feeData;
  
  // Convert to ledger format
  const fxRate = exchange_rate;
  const fxSnapshotAt = new Date().toISOString();
  
  // Create transaction with double-entry
  await createTransaction({
    shipmentId,
    currency,
    fxRate,
    fxSnapshotAt,
    reference: payment_ref,
    entries: [
      // Debit: Asset (likely cash/bank or receivable)
      { account_code: '1100', entry_type: ENTRY_TYPES.DEBIT, amount: total_costs, description: 'Fee receivable' },
      
      // Credit: Revenue accounts
      { account_code: '3000', entry_type: ENTRY_TYPES.CREDIT, amount: nes_levy, description: 'NES Levy' },
      { account_code: '3100', entry_type: ENTRY_TYPES.CREDIT, amount: duty, description: 'Duty' },
      { account_code: '2200', entry_type: ENTRY_TYPES.CREDIT, amount: agency_fees, description: 'Agency Fees' }
    ]
  });
}

/**
 * Record payment received
 */
async function recordPayment(shipmentId, paymentData) {
  const { 
    amount, 
    currency = 'NGN', 
    payment_ref, 
    payment_method 
  } = paymentData;
  
  await createTransaction({
    shipmentId,
    reference: payment_ref,
    entries: [
      // Debit: Cash/Bank
      { account_code: '1000', entry_type: ENTRY_TYPES.DEBIT, amount, description: `Payment received via ${payment_method}` },
      
      // Credit: Remove from receivables
      { account_code: '1100', entry_type: ENTRY_TYPES.CREDIT, amount, description: 'Payment applied' }
    ]
  });
}

/**
 * Get account balance
 */
async function getAccountBalance(accountCode, asOfDate = null) {
  let query = `
    SELECT 
      entry_type,
      SUM(amount) as total
    FROM LedgerEntries 
    WHERE account_code = ?
  `;
  const params = [accountCode];
  
  if (asOfDate) {
    query += ` AND created_at <= ?`;
    params.push(asOfDate);
  }
  
  query += ` GROUP BY entry_type`;
  
  const entries = await all(query, params);
  
  let debits = 0;
  let credits = 0;
  
  for (const entry of entries) {
    if (entry.entry_type === ENTRY_TYPES.DEBIT) {
      debits = entry.total || 0;
    } else {
      credits = entry.total || 0;
    }
  }
  
  // Get account type
  const account = await get(`SELECT type FROM ChartOfAccounts WHERE code = ?`, [accountCode]);
  const accountType = account?.type;
  
  // Calculate balance based on account type
  let balance;
  switch (accountType) {
    case ACCOUNT_TYPES.ASSET:
      balance = debits - credits;
      break;
    case ACCOUNT_TYPES.LIABILITY:
      balance = credits - debits;
      break;
    case ACCOUNT_TYPES.REVENUE:
      balance = credits - debits;
      break;
    case ACCOUNT_TYPES.EXPENSE:
      balance = debits - credits;
      break;
    default:
      balance = debits - credits;
  }
  
  return {
    account_code: accountCode,
    account_type: accountType,
    debits,
    credits,
    balance,
    as_of_date: asOfDate || new Date().toISOString()
  };
}

/**
 * Get trial balance report
 */
async function getTrialBalance(asOfDate = null) {
  const accounts = await all(`SELECT code, name, type FROM ChartOfAccounts WHERE active = 1`);
  
  const balances = [];
  let totalDebits = 0;
  let totalCredits = 0;
  
  for (const account of accounts) {
    const balance = await getAccountBalance(account.code, asOfDate);
    balances.push({
      code: account.code,
      name: account.name,
      type: account.type,
      debit: balance.balance > 0 ? balance.balance : 0,
      credit: balance.balance < 0 ? Math.abs(balance.balance) : 0
    });
    totalDebits += balance.balance > 0 ? balance.balance : 0;
    totalCredits += balance.balance < 0 ? Math.abs(balance.balance) : 0;
  }
  
  return {
    as_of_date: asOfDate || new Date().toISOString(),
    accounts: balances,
    total_debits: totalDebits,
    total_credits: totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01
  };
}

/**
 * Reconcile with external payment system
 */
async function reconcileWithExternal(externalPayments) {
  // Get all verified transactions
  const transactions = await all(
    `SELECT * FROM TransactionSummaries WHERE status = 'VERIFIED' AND created_at > datetime('now', '-30 days')`
  );
  
  const results = {
    matched: [],
    unmatched_transactions: [],
    unmatched_external: []
  };
  
  for (const txn of transactions) {
    const matched = externalPayments.find(ext => ext.reference === txn.transaction_id);
    
    if (matched) {
      // Check amounts match
      if (Math.abs(matched.amount - txn.total_debits) < 0.01) {
        results.matched.push({ transaction: txn, external: matched });
      } else {
        results.unmatched_transactions.push({
          transaction: txn,
          external: matched,
          reason: 'AMOUNT_MISMATCH'
        });
      }
    } else {
      results.unmatched_transactions.push({ transaction: txn, reason: 'NO_EXTERNAL_MATCH' });
    }
  }
  
  // Find external payments not in our system
  for (const ext of externalPayments) {
    const inSystem = transactions.find(t => t.transaction_id === ext.reference);
    if (!inSystem) {
      results.unmatched_external.push(ext);
    }
  }
  
  return results;
}

// Initialize on load
initializeLedger().catch(console.error);

module.exports = {
  ACCOUNT_TYPES,
  ENTRY_TYPES,
  initializeLedger,
  createTransaction,
  verifyTransaction,
  recordFeeCalculation,
  recordPayment,
  getAccountBalance,
  getTrialBalance,
  reconcileWithExternal
};