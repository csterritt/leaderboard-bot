interface VerifyOptions {
  publicKey: string
  timestamp: string
  body: string
  signature: string
}

export const verifyDiscordSignature = async ({
  publicKey,
  timestamp,
  body,
  signature,
}: VerifyOptions): Promise<boolean> => {
  try {
    const keyBytes = hexToBytes(publicKey)
    const sigBytes = hexToBytes(signature)
    const messageBytes = new TextEncoder().encode(timestamp + body)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes.buffer as ArrayBuffer,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )

    return await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      sigBytes.buffer as ArrayBuffer,
      messageBytes.buffer as ArrayBuffer,
    )
  } catch {
    return false
  }
}

const hexToBytes = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
