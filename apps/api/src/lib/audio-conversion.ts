import ffmpeg from 'fluent-ffmpeg'
import { PassThrough } from 'stream'

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

      outputStream.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })

      outputStream.on('error', (err: Error) => {
        console.error('[FFMPEG_OUTPUT_ERROR]', err)
        reject(err)
      })

      ffmpeg(inputStream)
        .noVideo()
        .audioCodec('libopus')
        .audioChannels(1)
        .audioFrequency(48000)
        .audioBitrate('32k')
        .outputOptions([
          '-vbr', 'on',
          '-compression_level', '10',
          '-application', 'voip',
          '-map_metadata', '-1'
        ])
        .format('ogg')
        .on('start', (commandLine: string) => {
          console.log('[FFMPEG_START]', commandLine)
        })
        .on('error', (err: Error) => {
          console.error('[FFMPEG_ERROR]', err)
          reject(err)
        })
        .on('end', () => {
          const buffer = Buffer.concat(chunks)

          console.log('[FFMPEG_END]', {
            outputSize: buffer.length
          })

          resolve({
            buffer,
            mimeType: 'audio/ogg',
            fileExtension: 'ogg'
          })
        })
        .pipe(outputStream, { end: true })
    } catch (err) {
      reject(err)
    }
  })
}