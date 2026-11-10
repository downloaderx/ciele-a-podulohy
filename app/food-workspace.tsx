'use client';

import { useState } from 'react';
import type { Goal, Task } from './page-model';
import { EditableInput } from './editable-input';
import { ingredientKey, liveFoodIngredients, recipeAvailability } from './food-model';
import { ProjectResources } from './project-resources';
import type { ProjectResource } from './project-resources-model';

type Props = {
  pantries: Goal[];
  recipes: Goal[];
  personId: string;
  onSaveResource: (recipeId: string, resource: ProjectResource) => void;
  onRemoveResource: (recipeId: string, resourceId: string) => void;
  onAddRecipe: (title: string) => void;
  onAddStock: (name: string, amount: string) => string | undefined;
  onAddIngredient: (recipeId: string, name: string, amount: string) => string | undefined;
  onEditIngredient: (id: string, name: string, amount: string) => void;
  onToggleStock: (id: string) => void;
  onSelectRecipe: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
};

export function FoodWorkspace(props: Props) {
  const [stockEditing, setStockEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recipeTitle, setRecipeTitle] = useState('');
  const stock = liveFoodIngredients(props.pantries);
  const names = [...new Map(stock.map((item) => [ingredientKey(item.title), item.title])).values()];
  return <section className="food-workspace" aria-label="Špajznička a obľúbené jedlá">
    <header className="food-page-heading lists-content-heading"><h1>Špajznička &amp; jedlá</h1><p>Spoločné zásoby a obľúbené jedlá pre obe líštičky.</p></header>
    <datalist id="food-ingredient-names">{names.map((name) => <option key={ingredientKey(name)} value={name} />)}</datalist>
    <div className="food-board">
      <aside className="food-inventory" aria-label="Zásoby doma">
        <h2 className="food-column-heading">Chladnička &amp; špajza</h2>
        <article className="todo-note note-mint food-note" aria-label="Špajznička">
          <header className="todo-note-heading"><div><h2>Špajznička</h2><span>Suroviny doma: {stock.filter((item) => item.done).length}</span></div><button type="button" aria-label={stockEditing ? 'Dokončiť úpravy zásob' : 'Upraviť zásoby'} aria-expanded={stockEditing} onClick={() => setStockEditing((value) => !value)}>{stockEditing ? 'Hotovo' : '⋯'}</button></header>
          <p className="food-note-hint">Zaškrtnuté = máme doma.</p>
          <ul className="food-stock-list note-checklist">{stock.map((item) => <li key={item.id} className={`food-stock-row${item.done ? '' : ' food-out-of-stock'}`}>
            <input type="checkbox" checked={item.done} aria-label={`Máme doma: ${item.title}`} onChange={() => props.onToggleStock(item.id)} />
            {stockEditing ? <><IngredientEditor item={item} onEdit={props.onEditIngredient} /><TrashButton label={`Presunúť surovinu do koša: ${item.title}`} onClick={() => props.onDelete(item.id)} /></> : <span className="food-stock-name">{item.title}{item.foodAmount && <small>{item.foodAmount}</small>}{!item.done && <small>Momentálne nemáme</small>}</span>}
          </li>)}</ul>
          {!stock.length && <p className="food-empty-note">Pridaj, čo máte v chladničke alebo špajzi.</p>}
          <IngredientForm label="Pridať do zásob" onAdd={props.onAddStock} />
        </article>
      </aside>
      <section className="food-recipes" aria-label="Obľúbené jedlá">
        <header className="food-recipes-heading"><h2 className="food-column-heading">Obľúbené jedlá</h2><button type="button" onClick={() => setCreating(true)}>+ Pridať jedlo</button></header>
        <div className="lists-note-grid">
          {creating && <form className="todo-note note-butter food-note food-new-recipe" aria-label="Nové obľúbené jedlo" onSubmit={(event) => { event.preventDefault(); if (!recipeTitle.trim()) return; props.onAddRecipe(recipeTitle); setRecipeTitle(''); setCreating(false); }}><h2>Nové jedlo</h2><label>Názov jedla<input autoFocus required maxLength={200} value={recipeTitle} placeholder="Napríklad Carbonara" onChange={(event) => setRecipeTitle(event.target.value)} /></label><div className="food-form-actions"><button type="submit">Pridať jedlo</button><button type="button" onClick={() => setCreating(false)}>Zrušiť</button></div></form>}
          {props.recipes.map((recipe, index) => <RecipeNote key={recipe.id} recipe={recipe} color={['butter', 'rose', 'lavender', 'sky'][index % 4]} {...props} />)}
          {!props.recipes.length && !creating && <div className="todo-note note-butter food-note food-empty-note"><h2>Čo radi jedávate?</h2><p>Pridaj obľúbené jedlo a jeho suroviny. Potom ho vyber a uvidíš, čo už máte a čo chýba.</p><button type="button" onClick={() => setCreating(true)}>+ Pridať prvé jedlo</button></div>}
        </div>
        <p className="food-footnote">Vyber jedno alebo viac jedál. Percento porovnáva druhy surovín, nie ich množstvá. Názvy sa párujú bez ohľadu na veľké písmená a diakritiku; pri zadávaní môžeš vybrať názov zo zásob.</p>
      </section>
    </div>
  </section>;
}

function RecipeNote({ recipe, color, pantries, personId, onSelectRecipe, onAddIngredient, onEditIngredient, onRename, onDelete, onSaveResource, onRemoveResource }: Props & { recipe: Goal; color: string }) {
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(recipe.children.length === 0);
  const availability = recipeAvailability(recipe, pantries);
  const ingredients = liveFoodIngredients([recipe]);
  return <article className={`todo-note note-${color} food-note`} aria-label={`Jedlo: ${recipe.title}`}>
    <header className="todo-note-heading"><div>{editing ? <EditableInput aria-label={`Názov jedla ${recipe.title}`} maxLength={200} value={recipe.title} onCommit={(title) => onRename(recipe.id, title)} /> : <h2>{recipe.title}</h2>}<span>Suroviny: {availability.total}</span></div><button type="button" aria-label={`${editing ? 'Dokončiť úpravy jedla' : 'Upraviť jedlo'}: ${recipe.title}`} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{editing ? 'Hotovo' : '⋯'}</button></header>
    <label className="food-select-recipe"><input type="checkbox" checked={Boolean(recipe.foodSelected)} onChange={() => onSelectRecipe(recipe.id)} /><span>{recipe.foodSelected ? 'Vybrané jedlo' : 'Vybrať jedlo'}</span></label>
    {recipe.foodSelected && !editing ? <>
      <div className="food-coverage" role="status" aria-label={`Dostupnosť surovín pre ${recipe.title}`}><strong>{availability.percent === null ? '—' : `${availability.percent} %`}</strong><span>{availability.have.length} z {availability.total} surovín máme</span>{availability.percent !== null && <div className="food-coverage-bar" aria-hidden="true"><span style={{ width: `${availability.percent}%` }} /></div>}</div>
      <div className="food-availability-groups" role="region" aria-label={`Suroviny jedla ${recipe.title}`} tabIndex={0}><IngredientGroup title="Máme" items={availability.have} kind="have" empty="Zatiaľ žiadna surovina." />
      <IngredientGroup title="Chýba" items={availability.missing} kind="missing" empty={availability.total ? 'Máme všetko.' : 'Pridaj suroviny jedla.'} /></div>
    </> : <ul className="food-ingredient-list note-checklist">{ingredients.map((item) => <li key={item.id}>{editing ? <><IngredientEditor item={item} onEdit={onEditIngredient} /><TrashButton label={`Presunúť surovinu jedla do koša: ${item.title}`} onClick={() => onDelete(item.id)} /></> : <><span>{item.title}</span>{item.foodAmount && <small>{item.foodAmount}</small>}</>}</li>)}</ul>}
    {!ingredients.length && !recipe.foodSelected && <p className="food-empty-note">Zatiaľ bez surovín.</p>}
    <details className="food-add-ingredient" open={adding || editing} onToggle={(event) => { if (!editing) setAdding(event.currentTarget.open); }}><summary>+ Pridať surovinu</summary><IngredientForm label={`Pridať surovinu do ${recipe.title}`} onAdd={(title, amount) => onAddIngredient(recipe.id, title, amount)} /></details>
    <details className="food-add-ingredient food-recipe-details">
      <summary>Postup a prílohy</summary>
      <ProjectResources goalId={recipe.id} resources={recipe.resources} editMode personId={personId} recipe
        onSave={(resource) => onSaveResource(recipe.id, resource)} onRemove={(id) => onRemoveResource(recipe.id, id)} />
    </details>
    {editing && <footer className="todo-note-trash-area"><TrashButton label={`Presunúť jedlo do koša: ${recipe.title}`} text="Presunúť jedlo do koša" onClick={() => onDelete(recipe.id)} /></footer>}
  </article>;
}

function IngredientGroup({ title, items, kind, empty }: { title: string; items: Task[]; kind: 'have' | 'missing'; empty: string }) {
  return <section className={`food-ingredient-group food-${kind}`} aria-label={`${title} (${items.length})`}><h3>{title} <span>({items.length})</span></h3>{items.length ? <ul className="food-ingredient-list">{items.map((item) => <li key={item.id}><span>{item.title}</span>{item.foodAmount && <small>{item.foodAmount}</small>}</li>)}</ul> : <p>{empty}</p>}</section>;
}

function IngredientEditor({ item, onEdit }: { item: Task; onEdit: Props['onEditIngredient'] }) {
  return <div className="food-ingredient-editor"><EditableInput aria-label={`Názov suroviny ${item.title}`} list="food-ingredient-names" maxLength={Math.max(200, item.title.length)} value={item.title} onCommit={(title) => onEdit(item.id, title, item.foodAmount ?? '')} /><EditableInput aria-label={`Množstvo suroviny ${item.title}`} maxLength={120} placeholder="Množstvo (voliteľné)" value={item.foodAmount ?? ''} onCommit={(amount) => onEdit(item.id, item.title, amount)} /></div>;
}

function IngredientForm({ label, onAdd }: { label: string; onAdd: (title: string, amount: string) => string | undefined }) {
  const [title, setTitle] = useState(''), [amount, setAmount] = useState(''), [error, setError] = useState('');
  return <form className="food-ingredient-form" aria-label={label} onSubmit={(event) => { event.preventDefault(); if (!title.trim()) return; const message = onAdd(title, amount); setError(message ?? ''); if (!message) { setTitle(''); setAmount(''); } }}><input required maxLength={200} aria-label={`Surovina – ${label}`} list="food-ingredient-names" placeholder="Názov suroviny…" value={title} onChange={(event) => setTitle(event.target.value)} /><div><input aria-label={`Množstvo – ${label}`} maxLength={120} placeholder="Množstvo (voliteľné)" value={amount} onChange={(event) => setAmount(event.target.value)} /><button type="submit" disabled={!title.trim()} aria-label={label}>Pridať</button></div>{error && <p role="alert">{error}</p>}</form>;
}

function TrashButton({ label, onClick, text }: { label: string; onClick: () => void; text?: string }) {
  return <button type="button" className="food-trash-button" aria-label={label} title={label} onClick={onClick}><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>{text}</button>;
}
