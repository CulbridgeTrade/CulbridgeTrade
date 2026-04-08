
const StellarSdk = require('stellar-sdk');

/**
 * Stellar Payments Integration
 */
class StellarPayments {
  constructor(masterSecret) {
    this.server = new StellarSdk.Server('https://horizon.stellar.org');
    this.masterKeypair = StellarSdk.Keypair.fromSecret(masterSecret);
  }

  async initiatePayment(toPublicKey, amountEur) {
    try {
      const account = await this.server.loadAccount(this.masterKeypair.publicKey());
      const transaction = new StellarSdk.TransactionBuilder(account, {
        fee: await this.server.fetchBaseFee()
      })
        .addOperation(StellarSdk.Operation.payment({
          destination: toPublicKey,
          asset: new StellarSdk.Asset('EUR', 'EURT...'), // EURT issuer
          amount: amountEur.toString()
        }))
        .setTimeout(30)
        .build();

      transaction.sign(this.masterKeypair);
      const result = await this.server.submitTransaction(transaction);
      return { stellar_tx_id: result.hash, status: 'COMPLETED' };
    } catch (error) {
      console.error('Stellar error:', error);
      return { status: 'FAILED' };
    }
  }
}

module.exports = StellarPayments;

