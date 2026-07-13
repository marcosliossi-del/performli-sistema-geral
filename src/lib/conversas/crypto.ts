import 'server-only'

/**
 * Criptografia at-rest para credenciais de canal do módulo Conversas.
 *
 * Algoritmo: AES-256-GCM (autenticado) via `node:crypto`. A chave vem de
 * `process.env.CONVERSAS_ENCRYPTION_KEY` — 32 bytes codificados em base64.
 *
 * Formato do payload cifrado (string única, portável em coluna @db.Text):
 *   `v1:<iv_b64>:<tag_b64>:<cipher_b64>`
 * O prefixo de versão (`v1`) permite rotação futura de esquema sem quebrar
 * registros antigos.
 *
 * REGRA DE SEGURANÇA: NUNCA logar a chave nem o texto em claro (plaintext).
 * Erros lançados aqui descrevem apenas a CAUSA estrutural (chave ausente,
 * formato inválido), jamais o conteúdo sensível.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGO = 'aes-256-gcm'
const KEY_BYTES = 32 // AES-256 exige chave de 32 bytes
const IV_BYTES = 12 // tamanho recomendado de nonce para GCM
const VERSION = 'v1'

/**
 * Lê e valida a chave de criptografia do ambiente. Lança erro CLARO (sem
 * expor a chave) se estiver ausente ou com tamanho incorreto.
 */
function getKey(): Buffer {
  const raw = process.env.CONVERSAS_ENCRYPTION_KEY
  if (!raw) {
    throw new Error(
      'CONVERSAS_ENCRYPTION_KEY ausente: defina 32 bytes em base64 no ambiente.',
    )
  }
  let key: Buffer
  try {
    key = Buffer.from(raw, 'base64')
  } catch {
    throw new Error(
      'CONVERSAS_ENCRYPTION_KEY inválida: não é base64 válido (esperado 32 bytes).',
    )
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `CONVERSAS_ENCRYPTION_KEY inválida: esperado ${KEY_BYTES} bytes após decodificar base64, obtido ${key.length}.`,
    )
  }
  return key
}

/**
 * Cifra um texto em claro e devolve o payload no formato versionado.
 * @param plain Conteúdo sensível (ex.: JSON de credenciais do canal).
 * @returns `v1:<iv_b64>:<tag_b64>:<cipher_b64>`
 */
export function encryptSecret(plain: string): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':')
}

/**
 * Decifra um payload produzido por `encryptSecret`. Valida versão/formato e a
 * autenticidade (a tag GCM garante integridade — adulteração lança erro).
 * @param payload String no formato `v1:<iv_b64>:<tag_b64>:<cipher_b64>`.
 * @returns Texto em claro original.
 */
export function decryptSecret(payload: string): string {
  const parts = payload.split(':')
  if (parts.length !== 4) {
    throw new Error('Payload cifrado inválido: formato inesperado.')
  }
  const [version, ivB64, tagB64, cipherB64] = parts
  if (version !== VERSION) {
    throw new Error(`Payload cifrado inválido: versão não suportada (${version}).`)
  }
  const key = getKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const encrypted = Buffer.from(cipherB64, 'base64')
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
