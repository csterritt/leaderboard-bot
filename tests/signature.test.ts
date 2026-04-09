import { describe, it, expect } from 'vitest'
import { verifyDiscordSignature } from '../src/utils/signature'
import { webcrypto } from 'crypto'

const subtle = webcrypto.subtle

async function makeKeyAndSign(
  body: string,
  timestamp: string,
): Promise<{ publicKey: string; signature: string }> {
  const keyPair = (await subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as CryptoKeyPair
  const rawPrivate = await subtle.exportKey('pkcs8', keyPair.privateKey)
  const rawPublic = await subtle.exportKey('raw', keyPair.publicKey)

  const message = new TextEncoder().encode(timestamp + body)
  const sigBuffer = await subtle.sign('Ed25519', keyPair.privateKey, message)

  const publicKey = Buffer.from(rawPublic).toString('hex')
  const signature = Buffer.from(sigBuffer).toString('hex')
  return { publicKey, signature }
}

describe('verifyDiscordSignature', () => {
  it('returns true for a valid signature', async () => {
    const body = JSON.stringify({ type: 1 })
    const timestamp = '1700000000'
    const { publicKey, signature } = await makeKeyAndSign(body, timestamp)
    const result = await verifyDiscordSignature({ publicKey, timestamp, body, signature })
    expect(result).toBe(true)
  })

  it('returns false for a tampered body', async () => {
    const body = JSON.stringify({ type: 1 })
    const tamperedBody = JSON.stringify({ type: 2 })
    const timestamp = '1700000000'
    const { publicKey, signature } = await makeKeyAndSign(body, timestamp)
    const result = await verifyDiscordSignature({
      publicKey,
      timestamp,
      body: tamperedBody,
      signature,
    })
    expect(result).toBe(false)
  })

  it('returns false for a tampered signature', async () => {
    const body = JSON.stringify({ type: 1 })
    const timestamp = '1700000000'
    const { publicKey } = await makeKeyAndSign(body, timestamp)
    const badSig = 'a'.repeat(128)
    const result = await verifyDiscordSignature({ publicKey, timestamp, body, signature: badSig })
    expect(result).toBe(false)
  })
})
