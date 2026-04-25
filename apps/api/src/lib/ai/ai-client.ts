import type { AiChatMessage, AiGeneratedResponse } from './ai-types.js'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

export async function generateAiResponse(params: {
  model: string
  temperature: number
  messages: AiChatMessage[]
}): Promise<AiGeneratedResponse> {
  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured')
  }

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature,
      messages: params.messages
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`)
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string
      }
    }>
  }

  const content = data.choices?.[0]?.message?.content?.trim()

  if (!content) {
    throw new Error('OpenAI returned empty response')
  }

  return { content }
}