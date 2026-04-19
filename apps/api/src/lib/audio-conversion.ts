import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'stream'

// ⚠️ usa ffmpeg do sistema (Railway via nixpacks)
ffmpeg.setFfmpegPath('ffmpeg')

type ConvertAudioOptions = {
  inputBuffer: Buffer
}

export async function convertAudioToOggOpus({
  inputBuffer
}: ConvertAudioOptions): Promise<{
  buffer: Buffer
  mimeType: string
  fileExtension: string
}> {
  return new Promise((resolve, reject) => {
    try {
      const inputStream = new PassThrough()
      const outputStream = new PassThrough()

      const chunks: Buffer[] = []

      inputStream.end(inputBuffer)

      ffmpeg(inputStream)
        // tenta detectar automaticamente o formato
        .audioCodec('libopus')
        .format('ogg')
        .on('error', (err: Error) => {
          console.error('[FFMPEG_ERROR]', err)
          reject(err)
        })
        .on('end', () => {
          const buffer = Buffer.concat(chunks)

          resolve({
            buffer,
            mimeType: 'audio/ogg',
            fileExtension: 'ogg'
          })
        })
        .pipe(outputStream)

      outputStream.on('data', (chunk) => {
        chunks.push(chunk)
      })
    } catch (err) {
      reject(err)
    }
  })
}