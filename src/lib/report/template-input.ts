import { z } from 'zod'
import { TemplateRulesSchema, TemplateSectionSchema } from './types'

export const TemplateInput = z.object({
  name: z.string().trim().min(1).max(255),
  kind: z.enum(['module_progress', 'staging_tracking', 'custom']).default('custom'),
  sections: z.array(TemplateSectionSchema).min(1).max(30),
  rules: TemplateRulesSchema,
})
