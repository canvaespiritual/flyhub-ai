import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

function getStorageConfig() {
  const bucket = process.env.STORAGE_BUCKET
  const endpoint = process.env.STORAGE_ENDPOINT
  const region = process.env.STORAGE_REGION || 'us-east-1'
  const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID
  const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY
  const publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL
  const forcePathStyle = process.env.STORAGE_FORCE_PATH_STYLE === 'true'

  const enabled = Boolean(
    bucket &&
      region &&
      accessKeyId &&
      secretAccessKey &&
      publicBaseUrl
  )

  return {
    enabled,
    bucket,
    endpoint,
    region,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
    forcePathStyle
  }
}

function createClient() {
  const config = getStorageConfig()

  if (!config.enabled) {
    return null
  }

  return new S3Client({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId!,
      secretAccessKey: config.secretAccessKey!
    }
  })
}

export function isStorageConfigured() {
  return getStorageConfig().enabled
}

export async function uploadBufferToStorage(params: {
  key: string
  body: Buffer
  contentType?: string
}) {
  const { key, body, contentType } = params
  const config = getStorageConfig()
  const client = createClient()

  if (!config.enabled || !client || !config.bucket || !config.publicBaseUrl) {
    throw new Error('Storage is not fully configured')
  }

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType
    })
  )

  return {
    key,
    url: `${config.publicBaseUrl.replace(/\/$/, '')}/${key}`
  }
}