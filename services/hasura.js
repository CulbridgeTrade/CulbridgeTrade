const { GraphQLClient } = require('graphql-request');

class Hasura {
  constructor(hasuraUrl = 'http://localhost:8080/v1/graphql', adminSecret = process.env.HASURA_ADMIN_SECRET) {
    this.client = new GraphQLClient(hasuraUrl, {
      headers: {
        'x-hasura-admin-secret': adminSecret
      }
    });
  }

  async trackTable(table) {
    const query = `
      mutation TrackTable($table: String!) {
        reload_metadata(where: {arguments: {table_name: {_eq: $table}}}) {
          success
        }
      }
    `;
    return this.client.request(query, { table });
  }

  async getShipment(id) {
    const query = `
      query GetShipment($id: String!) {
        shipments_by_pk(id: $id) {
          exporter_id
          product
          destination
          status
          health_score
        }
      }
    `;
    return this.client.request(query, { id });
  }
}

module.exports = Hasura;

