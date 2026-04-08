const Minio = require('minio');

/**
 * MinIO S3-compatible object storage for lab reports/images
 */
class MinioStorage {
  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: 'localhost',
      port: 9000,
      useSSL: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin'
    });
    
    this.bucket = 'culbridge-docs';
    this.initBucket();
  }

  async initBucket() {
    const exists = await this.minioClient.bucketExists(this.bucket);
    if (!exists) {
      await this.minioClient.makeBucket(this.bucket, 'us-east-1');
    }
  }

  async uploadDocument(fileBuffer, filename, metadata = {}) {
    const metaHeaders = { 'Content-Type': metadata.contentType || 'application/pdf' };
    const etag = await this.minioClient.putObject(this.bucket, filename, fileBuffer, metaHeaders);
    return { etag, filename, bucket: this.bucket };
  }

  async getDocumentUrl(filename, expiry = 3600) {
    return await this.minioClient.presignedGetObject(this.bucket, filename, expiry);
  }

  async uploadLabReport(shipmentId, labId, file) {
    const filename = `${shipmentId}/lab_reports/${labId}-${Date.now()}.pdf`;
    return await this.uploadDocument(file.buffer, filename, { contentType: 'application/pdf' });
  }
}

module.exports = MinioStorage;

