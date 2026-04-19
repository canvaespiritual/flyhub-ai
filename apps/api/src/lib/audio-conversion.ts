import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import { PassThrough } from 'stream'

ffmpeg.setFfmpegPath(ffmpegPath as string)

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
    const inputStream = new PassThrough()
    const outputStream = new PassThrough()

    const chunks: Buffer[] = []

    inputStream.end(inputBuffer)

    ffmpeg(inputStream)
      .inputFormat('webm') // navegador geralmente grava webm
      .audioCodec('libopus')
      .format('ogg')
      .on('error', (err) => {
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
  })
}