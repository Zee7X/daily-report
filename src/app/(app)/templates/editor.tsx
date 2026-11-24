'use client'

import { useState } from 'react'
import { Coord } from '@/components/ui'
import { api } from '@/lib/client'
import { useI18n } from '@/lib/i18n/client'
import type { TemplateRules, TemplateSection } from '@/lib/report/types'

type Tpl = { id: string; name: string; kind: string; sections: TemplateSection[]; rules: TemplateRules }
type Draft = Omit<Tpl, 'id'> & { id: string | null }

const blank = (): Draft => ({
  id: null,
  name: '',
  kind: 'custom',
  sections: [{ title: '', hint: '' }],
  rules: { tone: '', rules: [], intro: '', closing: '' },
})

// FR-5: template laporan — bagian, gaya bahasa, aturan (CRUD)
export function TemplatesEditor({ initial }: { initial: Tpl[] }) {
  const { t } = useI18n()
  const [templates, setTemplates] = useState(initial)
  const [draft, setDraft] = useState<Draft | null>(initial[0] ? { ...initial[0] } : null)
  const [rulesText, setRulesText] = useState((initial[0]?.rules.rules ?? []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  const select = (tpl: Draft) => {
    setDraft(structuredClone(tpl))
    setRulesText(tpl.rules.rules.join('\n'))
    setMsg(null)
  }

  const patch = (p: Partial<Draft>) => draft && setDraft({ ...draft, ...p })
  const patchRules = (p: Partial<TemplateRules>) => draft && setDraft({ ...draft, rules: { ...draft.rules, ...p } })
  const patchSection = (i: number, p: Partial<TemplateSection>) =>
    draft && setDraft({ ...draft, sections: draft.sections.map((s, j) => (j === i ? { ...s, ...p } : s)) })

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    setMsg(null)
    const payload = {
      name: draft.name,
      kind: draft.kind,
      sections: draft.sections.filter((s) => s.title.trim()),
      rules: { ...draft.rules, rules: rulesText.split('\n').map((r) => r.trim()).filter(Boolean) },
    }
    try {
      const r = draft.id
        ? await api<{ template: Tpl }>(`/api/templates/${draft.id}`, { method: 'PATCH', json: payload })
        : await api<{ template: Tpl }>('/api/templates', { method: 'POST', json: payload })
      setTemplates((prev) => (draft.id ? prev.map((x) => (x.id === r.template.id ? r.template : x)) : [...prev, r.template]))
      select(r.template)
      setMsg({ text: t.common.saved })
    } catch (err) {
      setMsg({ text: (err as Error).message, bad: true })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!draft?.id || !confirm(t.common.confirmDelete)) return
    await api(`/api/templates/${draft.id}`, { method: 'DELETE' })
    const rest = templates.filter((x) => x.id !== draft.id)
    setTemplates(rest)
    if (rest[0]) select(rest[0])
    else setDraft(null)
  }

  return (
    <>
      <section className="cell span-4 tight">
        <Coord c="B1" />
        <p className="label">{t.templates.label}</p>
        <ul className="list">
          {templates.map((tpl) => (
            <li key={tpl.id}>
              <button
                type="button"
                className="btn ghost grow"
                style={{ justifyContent: 'flex-start', textTransform: 'none', letterSpacing: 0, fontFamily: 'inherit', fontSize: 13 }}
                aria-current={draft?.id === tpl.id}
                onClick={() => select(tpl)}
              >
                {draft?.id === tpl.id ? '■ ' : '□ '}
                {tpl.name}
              </button>
              <span className="small mono">{tpl.sections.length}§</span>
            </li>
          ))}
        </ul>
        <button type="button" className="btn sm" onClick={() => select(blank())}>
          + {t.templates.new}
        </button>
      </section>

      <section className="cell span-8">
        <Coord c="B2" />
        {draft ? (
          <form className="stack" style={{ gap: 14 }} onSubmit={saveDraft}>
            <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
              <label className="field" style={{ flex: 2 }}>
                <span>{t.templates.name}</span>
                <input className="input" required value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>{t.templates.kind}</span>
                <select className="select" value={draft.kind} onChange={(e) => patch({ kind: e.target.value })}>
                  {Object.entries(t.templates.kinds).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="label" style={{ marginBottom: 8 }}>
                {t.templates.sections}
              </legend>
              {draft.sections.map((s, i) => (
                <div key={i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <span className="section-index" style={{ paddingTop: 10 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    aria-label={t.templates.sectionTitle}
                    placeholder={t.templates.sectionTitle}
                    value={s.title}
                    onChange={(e) => patchSection(i, { title: e.target.value })}
                  />
                  <input
                    className="input"
                    style={{ flex: 2 }}
                    aria-label={t.templates.sectionHint}
                    placeholder={t.templates.sectionHint}
                    value={s.hint}
                    onChange={(e) => patchSection(i, { hint: e.target.value })}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    style={{ marginTop: 4 }}
                    aria-label={t.common.delete}
                    disabled={draft.sections.length <= 1}
                    onClick={() => patch({ sections: draft.sections.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              <div>
                <button
                  type="button"
                  className="btn sm ghost"
                  onClick={() => patch({ sections: [...draft.sections, { title: '', hint: '' }] })}
                >
                  + {t.templates.addSection}
                </button>
              </div>
            </fieldset>

            <label className="field">
              <span>{t.templates.tone}</span>
              <input className="input" value={draft.rules.tone} onChange={(e) => patchRules({ tone: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.templates.rules}</span>
              <textarea className="textarea" rows={4} value={rulesText} onChange={(e) => setRulesText(e.target.value)} />
            </label>
            <div className="row" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
              <label className="field" style={{ flex: 1 }}>
                <span>{t.templates.intro}</span>
                <textarea className="textarea" rows={2} value={draft.rules.intro} onChange={(e) => patchRules({ intro: e.target.value })} />
              </label>
              <label className="field" style={{ flex: 1 }}>
                <span>{t.templates.closing}</span>
                <textarea className="textarea" rows={2} value={draft.rules.closing} onChange={(e) => patchRules({ closing: e.target.value })} />
              </label>
            </div>

            <div className="row between">
              <span role="status" className={msg?.bad ? 'notice bad' : 'small'}>
                {msg?.text}
              </span>
              <div className="row">
                {draft.id && (
                  <button type="button" className="btn danger" onClick={remove}>
                    {t.common.delete}
                  </button>
                )}
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? t.common.saving : t.common.save}
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="empty skeleton" style={{ minHeight: 160 }}>
            {t.templates.empty}
          </div>
        )}
      </section>
    </>
  )
}
