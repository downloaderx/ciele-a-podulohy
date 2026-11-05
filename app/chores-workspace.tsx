'use client';

import { useState, type ReactNode } from 'react';
import { ChoreRandomizer } from './chore-randomizer';
import type { ChoreReveal } from './chore-randomizer-model';
import { calculateChoreProgress, choreAttentionCount, type Goal } from './page-model';
import { pantrySource } from './chores-workspace-model';

type Props = {
  goals: Goal[];
  storageKey: string;
  canEdit: boolean;
  renderGoal: (goal: Goal) => ReactNode;
  addForm: (onCreated: (id: string) => void) => ReactNode;
  changes: ReactNode;
  completed: ReactNode;
  onReveal: (request: ChoreReveal) => void;
  onSplitPantry: (sourceId: string) => void;
};

export function ChoresWorkspace(props: Props) {
  const [view, setView] = useState(() => {
    try { return window.localStorage.getItem(props.storageKey) || 'overview'; } catch { return 'overview'; }
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [changeTab, setChangeTab] = useState<'recent' | 'completed'>('recent');
  const selectedGoal = props.goals.find((goal) => 'area:' + goal.id === view);
  const current = selectedGoal ? view : ['overview', 'changes', 'add'].includes(view) ? view : 'overview';
  const title = selectedGoal?.title ?? (current === 'changes' ? 'Zmeny' : current === 'add' ? 'Pridať oblasť' : 'Prehľad');
  const tasks = props.goals.flatMap((goal) => goal.children);
  const routine = calculateChoreProgress(tasks, 'routine');
  const occasionalAttention = choreAttentionCount(tasks, new Date(), 'occasional');
  const pantry = pantrySource(props.goals);

  function navigate(next: string) {
    setView(next); setMenuOpen(false);
    try { window.localStorage.setItem(props.storageKey, next); } catch { /* Navigation works without storage. */ }
  }

  return <section className="chores-workspace" aria-label="Pracovný priestor Chores">
    <div className="chores-mobile-bar">
      <button type="button" aria-expanded={menuOpen} aria-controls="chores-menu" onClick={() => setMenuOpen((open) => !open)}>☰ Menu Chores</button>
      <span>{title}</span>
    </div>
    <nav id="chores-menu" className={`chores-menu${menuOpen ? ' is-open' : ''}`} aria-label="Menu Chores">
      <button type="button" aria-current={current === 'overview' ? 'page' : undefined} onClick={() => navigate('overview')}>Prehľad</button>
      <span className="chores-menu-label">Práce podľa oblastí</span>
      {props.goals.map((goal) => <button type="button" key={goal.id} aria-current={selectedGoal?.id === goal.id ? 'page' : undefined} onClick={() => navigate('area:' + goal.id)}>
        <span>{goal.title}</span>
        {choreAttentionCount(goal.children, new Date(), 'occasional') > 0 && <span className="chores-menu-alert" title="Občasné práce na kontrolu">!</span>}
      </button>)}
      {!props.goals.length && <p>Zatiaľ bez oblastí.</p>}
      {props.canEdit && <button type="button" className="chores-add-area" aria-current={current === 'add' ? 'page' : undefined} onClick={() => navigate('add')}>＋ Pridať oblasť</button>}
      <button type="button" className="chores-changes-link" aria-current={current === 'changes' ? 'page' : undefined} onClick={() => navigate('changes')}>Zmeny</button>
    </nav>
    <div className="chores-content">
      {current === 'overview' && <>
        <header className="chores-content-heading"><h2>Prehľad chores</h2><p>Vyber oblasť v menu alebo si nechaj vybrať jednu prácu.</p></header>
        <div className="chores-quick-stats">
          <div><strong>{routine.doneWeight}/{routine.totalWeight}</strong><span>bodov bežných prác za posledných 7 dní</span></div>
          <div><strong>{occasionalAttention}</strong><span>občasných prác na kontrolu</span></div>
        </div>
        <ChoreRandomizer goals={props.goals} onOpen={(request) => { navigate('area:' + request.path[0]); props.onReveal(request); }} />
        <div className="chores-area-list">
          {props.goals.map((goal) => <button type="button" key={goal.id} onClick={() => navigate('area:' + goal.id)}><strong>{goal.title}</strong><span>Otvoriť práce →</span></button>)}
        </div>
        {pantry && props.canEdit && <div className="chores-split-note"><p>Práce v špajzi sú zatiaľ spolu s kuchyňou. Môžeš ich presunúť do samostatnej oblasti aj s históriou.</p><button type="button" onClick={() => props.onSplitPantry(pantry.id)}>Oddeliť špajzu</button></div>}
      </>}
      {selectedGoal && <div className="chores-area-content">{props.renderGoal(selectedGoal)}</div>}
      {current === 'add' && props.canEdit && <section className="chores-add-form"><h2>Pridať oblasť</h2><p>Napríklad Kuchyňa, Špajza alebo Pranie.</p>{props.addForm((id) => navigate('area:' + id))}</section>}
      {current === 'changes' && <>
        <header className="chores-content-heading"><h2>Zmeny</h2><p>História úprav a prehľad vykonaných prác na jednom mieste.</p></header>
        <div className="chores-change-tabs" role="tablist" aria-label="Druh histórie" onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 'recent' : event.key === 'End' ? 'completed' : changeTab === 'recent' ? 'completed' : 'recent';
          setChangeTab(next);
          event.currentTarget.querySelector<HTMLButtonElement>(`#chores-${next}-tab`)?.focus();
        }}>
          <button type="button" role="tab" id="chores-recent-tab" tabIndex={changeTab === 'recent' ? 0 : -1} aria-selected={changeTab === 'recent'} aria-controls="chores-recent-panel" onClick={() => setChangeTab('recent')}>Posledné zmeny</button>
          <button type="button" role="tab" id="chores-completed-tab" tabIndex={changeTab === 'completed' ? 0 : -1} aria-selected={changeTab === 'completed'} aria-controls="chores-completed-panel" onClick={() => setChangeTab('completed')}>Hotové práce</button>
        </div>
        {changeTab === 'recent' ? <div id="chores-recent-panel" role="tabpanel" aria-labelledby="chores-recent-tab">{props.changes}</div> : <div id="chores-completed-panel" role="tabpanel" aria-labelledby="chores-completed-tab">{props.completed}</div>}
      </>}
    </div>
  </section>;
}
