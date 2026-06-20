// SERVER-ONLY. Real Ed25519 signing for ProvenLex compliance artifacts.
//
// Upgrades the audit trail from "SHA-256 hash" (proves integrity only) to a real
// digital signature (proves integrity AND authorship — that *ProvenLex* attested
// this exact record). Anyone can verify a signature against the published public
// key with standard Ed25519; no ProvenLex code required to check it.
//
// Production: set GENESIS_SIGNING_KEY to a base64 PKCS8 Ed25519 private key so
// the identity is stable across deployments. If unset, an ephemeral key is
// generated at process start (fine for local/demo; the public key is still
// published, signatures still verify within that process).

import {
  generateKeyPairSync, sign as nodeSign, verify as nodeVerify,
  createPrivateKey, createPublicKey, type KeyObject,
} from 'node:crypto'

let privateKey: KeyObject
let publicKey: KeyObject

function init() {
  if (privateKey) return
  const env = process.env.GENESIS_SIGNING_KEY
  if (env) {
    const der = Buffer.from(env, 'base64')
    privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' })
    publicKey = createPublicKey(privateKey)
  } else {
    const kp = generateKeyPairSync('ed25519')
    privateKey = kp.privateKey
    publicKey = kp.publicKey
  }
}

export function publicKeyPem(): string {
  init()
  return publicKey.export({ format: 'pem', type: 'spki' }).toString()
}

export function publicKeyBase64(): string {
  init()
  // Raw 32-byte Ed25519 public key, base64 — convenient for non-PEM verifiers.
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer
  return der.subarray(der.length - 32).toString('base64')
}

export interface Signature {
  alg: 'Ed25519'
  message: string
  signature: string   // base64
  publicKeyPem: string
  signedAt: string
}

export function signMessage(message: string): Signature {
  init()
  const sig = nodeSign(null, new TextEncoder().encode(message), privateKey)
  return {
    alg: 'Ed25519',
    message,
    signature: sig.toString('base64'),
    publicKeyPem: publicKeyPem(),
    signedAt: new Date().toISOString(),
  }
}

// Exposed so a test (or anyone) can confirm signatures verify.
export function verifyMessage(message: string, signatureB64: string, pubPem?: string): boolean {
  init()
  const key = pubPem ? createPublicKey(pubPem) : publicKey
  return nodeVerify(null, new TextEncoder().encode(message), key, new Uint8Array(Buffer.from(signatureB64, 'base64')))
}
