-- Sample data so a fresh install is not empty. Safe to edit or skip.

insert into plico.sections (name, sort) values
  ('Breakfast',     10),
  ('Soups & Stews', 20),
  ('Main Dishes',   30),
  ('Sides',         40),
  ('Desserts',      50);

insert into plico.recipes
  (id, title, section_id, serves, time, description, ingredients, steps, notes, tags)
values
(
  'buttermilk-pancakes',
  'Buttermilk Pancakes',
  (select id from plico.sections where name = 'Breakfast'),
  4,
  'About 25 min',
  'Fluffy griddle pancakes from pantry staples.',
  '[{"name": "", "items": [
      {"qty": 2,    "unit": "cups", "item": "all-purpose flour"},
      {"qty": 2,    "unit": "tbsp", "item": "sugar"},
      {"qty": 2,    "unit": "tsp",  "item": "baking powder"},
      {"qty": 0.5,  "unit": "tsp",  "item": "baking soda"},
      {"qty": 0.5,  "unit": "tsp",  "item": "salt"},
      {"qty": 2,    "unit": "cups", "item": "buttermilk"},
      {"qty": 2,    "unit": "",     "item": "eggs"},
      {"qty": 3,    "unit": "tbsp", "item": "butter, melted"}
  ]}]'::jsonb,
  '[
    {"title": "Mix dry",  "text": "Whisk the flour, sugar, baking powder, baking soda and salt.", "seconds": 0},
    {"title": "Mix wet",  "text": "Whisk the buttermilk, eggs and melted butter, then fold into the dry mix until just combined. Lumps are fine.", "seconds": 0},
    {"title": "Rest",     "text": "Let the batter rest while the griddle heats over medium.", "seconds": 300},
    {"title": "Cook",     "text": "Pour 1/4 cup rounds. Flip when bubbles hold at the edges, then cook until golden.", "seconds": 240}
  ]'::jsonb,
  '["No buttermilk? Stir 2 tbsp lemon juice into 2 cups of milk and wait 5 minutes."]'::jsonb,
  array['vegetarian', 'quick']
),
(
  'weeknight-chili',
  'Weeknight Chili',
  (select id from plico.sections where name = 'Soups & Stews'),
  6,
  'About 50 min',
  'A one-pot beef and bean chili that is better the next day.',
  '[
    {"name": "Chili", "items": [
      {"qty": 1,   "unit": "tbsp", "item": "oil"},
      {"qty": 1,   "unit": "",     "item": "large onion, diced"},
      {"qty": 1.5, "unit": "lb",   "item": "ground beef"},
      {"qty": 3,   "unit": "",     "item": "garlic cloves, minced"},
      {"qty": 2,   "unit": "tbsp", "item": "chili powder"},
      {"qty": 2,   "unit": "tsp",  "item": "ground cumin"},
      {"qty": 28,  "unit": "oz",   "item": "crushed tomatoes"},
      {"qty": 30,  "unit": "oz",   "item": "kidney beans, drained"},
      {"qty": 1,   "unit": "cup",  "item": "beef stock"},
      {"qty": 1,   "unit": "tsp",  "item": "salt"}
    ]},
    {"name": "To serve", "items": [
      {"qty": 1,    "unit": "cup", "item": "shredded cheddar"},
      {"qty": null, "unit": "",    "item": "sour cream, to taste"}
    ]}
  ]'::jsonb,
  '[
    {"title": "Brown",   "text": "Heat the oil, soften the onion, then brown the beef, breaking it up. Drain excess fat.", "seconds": 600},
    {"title": "Bloom",   "text": "Stir in the garlic, chili powder and cumin for one minute.", "seconds": 60},
    {"title": "Simmer",  "text": "Add the tomatoes, beans, stock and salt. Bring to a boil, then simmer uncovered, stirring now and then.", "seconds": 1800},
    {"title": "Serve",   "text": "Adjust the seasoning and serve with cheese and sour cream.", "seconds": 0}
  ]'::jsonb,
  '["Freezes well for up to 3 months."]'::jsonb,
  array['make-ahead', 'freezer']
);
