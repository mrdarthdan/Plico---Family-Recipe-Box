export type Role = 'viewer' | 'editor' | 'admin'

export interface Item {
  /** null means "no amount", e.g. "salt, to taste"; such items are not scaled */
  qty: number | null
  unit: string
  item: string
}
export interface Group {
  name: string
  items: Item[]
}
export interface Step {
  title: string
  text: string
  /** timer length; 0 for none */
  seconds: number
}

export interface Recipe {
  id: string
  title: string
  section_id: number
  serves: number | null
  time: string | null
  description: string | null
  ingredients: Group[]
  steps: Step[]
  notes: string[]
  tags: string[]
  source_url: string | null
  added: string
  contributor: string | null
}

/** The columns an editor may set. */
export type RecipeInput = Omit<Recipe, 'id' | 'added'>

export interface Section {
  id: number
  name: string
  sort: number
}
export interface Settings {
  site_name: string
  tagline: string | null
  public_read: boolean
}
export interface Profile {
  user_id: string
  display_name: string | null
  role: Role
}
export interface Member extends Profile {
  email: string
  created_at: string
}

export interface CookbookData {
  settings: Settings
  sections: Section[]
  recipes: Recipe[]
  /** true when the database did not respond and this is the last saved copy */
  fromCache: boolean
}
