/**
 * AwsKmsAdapter — Story 16.2
 *
 * Production KMS adapter backed by AWS KMS.
 * Requires the environment variable MASTER_KMS_KEY_ID to be set to a valid
 * AWS KMS key ARN or alias (e.g. "alias/nike-bot-master").
 *
 * Uses @aws-sdk/client-kms v3 (modular SDK).
 * Install: pnpm add @aws-sdk/client-kms
 *
 * The SDK is loaded at runtime via dynamic import so that:
 * 1. TypeScript compilation does not require @aws-sdk/client-kms to be installed.
 * 2. Test environments (LocalKmsStub) never load AWS SDK code.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { KmsAdapter } from './kms.ts'

type AwsSdk = {
  KMSClient: new (cfg: object) => { send: (cmd: unknown) => Promise<any> }
  EncryptCommand: new (input: object) => unknown
  DecryptCommand: new (input: object) => unknown
  GenerateDataKeyCommand: new (input: object) => unknown
}

let _sdk: AwsSdk | null = null

async function getSdk(): Promise<AwsSdk> {
  if (!_sdk) {
    // Dynamic import — @aws-sdk/client-kms must be installed in production
    _sdk = await import('@aws-sdk/client-kms' as string) as unknown as AwsSdk
  }
  return _sdk
}

// PATCH 16.x-PERF-1: reuse KMSClient across calls (singleton per adapter instance)
export class AwsKmsAdapter implements KmsAdapter {
  private readonly keyId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _client: any = null

  constructor(keyId?: string) {
    const id = keyId ?? process.env['MASTER_KMS_KEY_ID']
    if (!id) {
      throw new Error('AwsKmsAdapter: MASTER_KMS_KEY_ID is required')
    }
    this.keyId = id
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getClient(): Promise<any> {
    const sdk = await getSdk()
    if (!this._client) this._client = new sdk.KMSClient({})
    return this._client
  }

  async encrypt(plaintext: Buffer): Promise<Buffer> {
    const sdk = await getSdk()
    const client = await this.getClient()
    const cmd = new sdk.EncryptCommand({ KeyId: this.keyId, Plaintext: plaintext })
    const res = await client.send(cmd) as { CiphertextBlob?: Uint8Array }
    if (!res.CiphertextBlob) throw new Error('AwsKmsAdapter.encrypt: no CiphertextBlob returned')
    return Buffer.from(res.CiphertextBlob)
  }

  async decrypt(wrapped: Buffer): Promise<Buffer> {
    const sdk = await getSdk()
    const client = await this.getClient()
    const cmd = new sdk.DecryptCommand({ KeyId: this.keyId, CiphertextBlob: wrapped })
    const res = await client.send(cmd) as { Plaintext?: Uint8Array }
    if (!res.Plaintext) throw new Error('AwsKmsAdapter.decrypt: no Plaintext returned')
    return Buffer.from(res.Plaintext)
  }

  async generateDataKey(): Promise<{ plaintext: Buffer; wrapped: Buffer }> {
    const sdk = await getSdk()
    const client = await this.getClient()
    const cmd = new sdk.GenerateDataKeyCommand({ KeyId: this.keyId, KeySpec: 'AES_256' })
    const res = await client.send(cmd) as { Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array }
    if (!res.Plaintext || !res.CiphertextBlob) {
      throw new Error('AwsKmsAdapter.generateDataKey: incomplete response')
    }
    return { plaintext: Buffer.from(res.Plaintext), wrapped: Buffer.from(res.CiphertextBlob) }
  }
}
