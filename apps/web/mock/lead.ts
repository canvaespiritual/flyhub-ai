export type LeadTemperature = 'hot' | 'warm' | 'cold'

export type Lead = {
  name: string
  phone: string
  source: string
  assignedTo: string
  temperature: LeadTemperature
  summary: string
}

export const leadByConversationId: Record<number, Lead> = {
  1: {
    name: 'João Silva',
    phone: '(61) 99999-1111',
    source: 'Anúncio WhatsApp',
    assignedTo: 'Não atribuído',
    temperature: 'hot',
    summary:
      'Lead vindo de anúncio. Demonstrou interesse real, mas apresentou objeção de entrada. Perfil inicial sugere simulação com entrada parcelada e imóveis em obras.'
  },
  2: {
    name: 'Maria Souza',
    phone: '(61) 98888-2222',
    source: 'Campanha Samambaia',
    assignedTo: 'Corretor Lucas',
    temperature: 'warm',
    summary:
      'Lead com interesse objetivo em Samambaia. Busca entrada parcelada e demonstra abertura para receber opções e simulação.'
  },
  3: {
    name: 'Carlos Lima',
    phone: '(61) 97777-3333',
    source: 'Anúncio Meta',
    assignedTo: 'Não atribuído',
    temperature: 'cold',
    summary:
      'Lead ainda em fase de análise. Não aprofundou dados financeiros e terminou a conversa com postura de espera.'
  }
}