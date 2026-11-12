import { useState, type FormEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { insertRecipe, updateRecipe } from '../lib/api'
import {
  ingredientsToText, parseIngredients, parseSteps, stepsToText, today, uniqueSlug,
} from '../lib/parse'
import type { CookbookData, Recipe, RecipeInput } from '../lib/types'
import { go } from '../lib/useHash'

interface Props {
  recipe: Recipe | null
  data: CookbookData
  user: User | null
  canEdit: boolean
  onSaved: (id: string) => Promise<void>
}

export function RecipeForm({ recipe: r, data, user, canEdit, onSaved }: Props) {
  const editing = !!r
  const [title, setTitle] = useState(r?.title ?? '')
  const [sectionId, setSectionId] = useState<number>(r?.section_id ?? data.sections[0]?.id ?? 0)
  const [serves, setServes] = useState(r?.serves != null ? String(r.serves) : '')
  const [time, setTime] = useState(r?.time ?? '')
  const [description, setDescription] = useState(r?.description ?? '')
  const [ingredients, setIngredients] = useState(r ? ingredientsToText(r.ingredients) : '')
  const [steps, setSteps] = useState(r ? stepsToText(r.steps) : '')
  const [notes, setNotes] = useState(r ? r.notes.join('\n') : '')
  const [tags, setTags] = useState(r ? r.tags.join(', ') : '')
  const [sourceUrl, setSourceUrl] = useState(r?.source_url ?? '')
  const [credit, setCredit] = useState(r?.contributor ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const back = () => go(editing ? r!.id : '')

  if (!user || !canEdit) {
    return (
      <>
        <button className="back" onClick={() => go('')}>
          ← All recipes
        </button>
        <div className="panel">
          <h1>{user ? 'Adding recipes needs approval' : 'Sign in to add recipes'}</h1>
          <p className="lede">
            {user
              ? data.fromCache
                ? "The recipe database isn't responding, so editing is unavailable right now."
                : `You're signed in as ${user.email}, but this account can't add or edit recipes yet. Ask the cookbook's admin to make it an editor.`
              : 'Only signed-in editors can add or edit recipes.'}
          </p>
          {!user && (
            <div className="actions">
              <button className="btn" onClick={() => go('account')}>
                Sign in
              </button>
            </div>
          )}
        </div>
      </>
    )
  }

  if (data.sections.length === 0) {
    return (
      <div className="panel">
        <h1>Add a section first</h1>
        <p className="lede">Recipes are filed under sections. An admin can add some on the Admin page.</p>
      </div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const groups = parseIngredients(ingredients)
    const parsedSteps = parseSteps(steps)
    const cleanTitle = title.trim()
    const url = sourceUrl.trim()
    const problems: string[] = []
    if (!cleanTitle) problems.push('Add a title.')
    if (!groups.length) problems.push('Add at least one ingredient.')
    if (!parsedSteps.length) problems.push('Add at least one step.')
    if (serves.trim() && !(+serves >= 1 && +serves <= 100))
      problems.push('Serves should be a number from 1 to 100, or left blank.')
    if (url && !/^https?:\/\//.test(url)) problems.push('The source link should start with http:// or https://.')
    if (problems.length) {
      setError(problems.join(' '))
      return
    }

    const input: RecipeInput = {
      title: cleanTitle,
      section_id: sectionId,
      serves: serves.trim() ? Math.round(+serves) : null,
      time: time.trim() || null,
      description: description.trim() || null,
      ingredients: groups,
      steps: parsedSteps,
      notes: notes
        .split('\n')
        .map((s) => s.replace(/^\s*[-•*]\s*/, '').trim())
        .filter(Boolean),
      tags: [...new Set(tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
      source_url: url || null,
      contributor: credit.trim() || null,
    }

    setSaving(true)
    setError(null)
    try {
      let id: string
      if (r) {
        id = r.id
        await updateRecipe(id, input)
      } else {
        id = uniqueSlug(cleanTitle, data.recipes.map((x) => x.id))
        await insertRecipe(id, today(), input)
      }
      await onSaved(id)
    } catch (err) {
      setError("Couldn't save: " + (err as Error).message)
      setSaving(false)
    }
  }

  return (
    <>
      <button className="back" onClick={back}>
        ← {editing ? 'Back to recipe' : 'All recipes'}
      </button>
      <form className="panel" onSubmit={submit} noValidate>
        <h1>{editing ? 'Edit recipe' : 'Add a recipe'}</h1>
        <p className="lede">
          {editing ? 'Changes show up for everyone as soon as you save.' : 'It shows up for everyone as soon as you save.'}
        </p>

        <div className="field">
          <label htmlFor="f-title">Title</label>
          <input id="f-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Chicken Pot Pie" />
        </div>

        <div className="row">
          <div className="field">
            <label htmlFor="f-section">Section</label>
            <select id="f-section" value={sectionId} onChange={(e) => setSectionId(+e.target.value)}>
              {data.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-serves">Serves</label>
            <input id="f-serves" type="number" min={1} max={100} inputMode="numeric" value={serves} onChange={(e) => setServes(e.target.value)} placeholder="4" />
          </div>
          <div className="field">
            <label htmlFor="f-time">Total time</label>
            <input id="f-time" maxLength={60} value={time} onChange={(e) => setTime(e.target.value)} placeholder="About 1 hr" />
          </div>
        </div>

        <div className="field">
          <label htmlFor="f-desc">Short description</label>
          <input id="f-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Creamy chicken and vegetables under a flaky crust." />
        </div>

        <div className="field">
          <label htmlFor="f-ing">Ingredients</label>
          <p className="hint">One per line, amount first. A line ending in a colon starts a group, like “Topping:”.</p>
          <textarea
            id="f-ing"
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            placeholder={'Filling:\n1 1/2 lb chicken thighs, cubed\n2 tbsp butter\n1 onion, diced\n\nTopping:\n1 sheet puff pastry\nSalt, to taste'}
          />
        </div>

        <div className="field">
          <label htmlFor="f-steps">Steps</label>
          <p className="hint">
            One step per line. Start with a short name and a colon if you like. End with a time in parentheses to
            add a timer, like “(15 min)”.
          </p>
          <textarea
            id="f-steps"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={'Brown the chicken: Sear the chicken in butter until golden. (6 min)\nMake the sauce: Stir in flour, then broth and cream. Simmer until thick. (5 min)\nBake: Top with pastry and bake at 400°F until puffed. (25 min)'}
          />
        </div>

        <div className="field">
          <label htmlFor="f-notes">Notes (optional)</label>
          <p className="hint">One note per line.</p>
          <textarea id="f-notes" style={{ minHeight: 90 }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Make ahead: assemble a day early and bake cold, adding 10 minutes." />
        </div>

        <div className="field">
          <label htmlFor="f-tags">Tags (optional)</label>
          <p className="hint">Separate with commas.</p>
          <input id="f-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="make-ahead, freezer" />
        </div>

        <div className="field">
          <label htmlFor="f-source">Source link (optional)</label>
          <input id="f-source" type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" />
        </div>

        <div className="field">
          <label htmlFor="f-credit">Credit (optional)</label>
          <p className="hint">Shown under the title. Leave blank to credit yourself by your display name.</p>
          <input id="f-credit" maxLength={200} value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="Adapted from Grandma's recipe card" />
        </div>

        {error && <p className="msg err">{error}</p>}
        <div className="actions">
          <button className="btn" type="submit" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add recipe'}
          </button>
          <button className="btn ghost" type="button" onClick={back}>
            Cancel
          </button>
        </div>
      </form>
    </>
  )
}
