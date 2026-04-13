export type LeadStage =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'scheduled'
  | 'proposal'
  | 'won'
  | 'lost'

export type LeadTemperature = 'cold' | 'warm' | 'hot'

export interface Lead {
  id: string
  name: string
  phone: string
  email?: string
  stage: LeadStage
  temperature: LeadTemperature
  interest?: string
  income?: number
  notes?: string
}