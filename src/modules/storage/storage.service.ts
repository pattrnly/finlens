import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile, unlink } from 'fs/promises';
import { resolve } from 'path';
import { isLocalStoredPath, s3KeyFromLocalPath, statementObjectKey } from './storage.util';

@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private client?: S3Client;

  constructor(private config: ConfigService) {}

  objectKey(userId: string, filename: string) {
    return statementObjectKey(userId, filename, Date.now(), this.prefix());
  }

  async putPdf(key: string, body: Buffer) {
    await this.s3().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: 'application/pdf',
      }),
    );
    return key;
  }

  async getPdf(storedPath: string): Promise<Buffer> {
    if (!storedPath || isLocalStoredPath(storedPath)) {
      throw new NotFoundException('Original PDF is no longer in S3');
    }
    return this.getFromS3(storedPath);
  }

  async migrateLocalPdf(userId: string, storedPath: string): Promise<string> {
    if (!isLocalStoredPath(storedPath)) return storedPath;
    const abs = resolve(storedPath);
    const body = await readFile(abs);
    const key = s3KeyFromLocalPath(userId, storedPath, this.prefix());
    await this.putPdf(key, body);
    const check = await this.getFromS3(key);
    if (!check.length) throw new Error(`S3 verify failed for ${key}`);
    await unlink(abs).catch(() => undefined);
    this.log.log(`Moved statement PDF to s3://${this.bucket()}/${key}`);
    return key;
  }

  async removePdf(storedPath: string) {
    try {
      if (isLocalStoredPath(storedPath)) {
        await unlink(resolve(storedPath));
        return;
      }
      await this.s3().send(
        new DeleteObjectCommand({
          Bucket: this.bucket(),
          Key: storedPath,
        }),
      );
    } catch {
      /* object may already be gone */
    }
  }

  private async getFromS3(key: string): Promise<Buffer> {
    try {
      const res = await this.s3().send(
        new GetObjectCommand({
          Bucket: this.bucket(),
          Key: key,
        }),
      );
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes?.length) throw new NotFoundException('Original PDF is no longer in S3');
      return Buffer.from(bytes);
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      this.log.warn(`S3 get failed for ${key}: ${String(err)}`);
      throw new NotFoundException('Original PDF is no longer in S3');
    }
  }

  private prefix() {
    return this.config.get<string>('S3_PREFIX')?.trim() || 'statements';
  }

  private bucket() {
    const bucket = this.config.get<string>('S3_BUCKET')?.trim();
    if (!bucket) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Add S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.',
      );
    }
    return bucket;
  }

  private s3() {
    if (this.client) return this.client;
    this.bucket();
    const region =
      this.config.get<string>('AWS_REGION')?.trim() ||
      this.config.get<string>('S3_REGION')?.trim() ||
      'ap-south-1';
    const endpoint = this.config.get<string>('S3_ENDPOINT')?.trim();
    const accessKeyId = this.config.get<string>('AWS_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config.get<string>('AWS_SECRET_ACCESS_KEY')?.trim();
    if (!accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException(
        'S3 is not configured. Add AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY to .env.',
      );
    }
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId, secretAccessKey },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.client;
  }
}
