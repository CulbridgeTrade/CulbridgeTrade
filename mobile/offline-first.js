
const PouchDB = require('pouchdb');
PouchDB.plugin(require('pouchdb-find'));

const localDB = new PouchDB('culbridge_local');
const remoteDB = 'https://culbridge.com/db'; // when online

// Offline sync
async function syncData() {
  if (navigator.onLine) {
    await localDB.replicate.to(remoteDB, {live: true, retry: true});
    await localDB.replicate.from(remoteDB, {live: true, retry: true});
  }
}

// Local shipment storage
async function saveShipmentOffline(shipment) {
  await localDB.put(shipment);
}

// Auto-sync on connection
window.addEventListener('online', syncData);

module.exports = { saveShipmentOffline, syncData };

