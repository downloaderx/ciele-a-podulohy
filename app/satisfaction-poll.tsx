'use client';

import type { Goal, Person } from './page-model';

const answers = ['Vôbec nie', 'Skôr nie', 'Tak napoly', 'Skôr áno', 'Veľmi'];

export function SatisfactionSummary({ goal, people }: { goal: Goal; people: Person[] }) {
  return <div className="satisfaction-summary" aria-label="Aktuálna spokojnosť">
    <span>Spokojnosť</span>
    {people.map((person) => <span key={person.id}>{person.name}: <b>{goal.satisfactionByPerson?.[person.id] !== undefined ? `${goal.satisfactionByPerson[person.id]}/5` : 'bez odpovede'}</b></span>)}
  </div>;
}

export function SatisfactionPoll({ goal, people, activePersonId, onRate }: {
  goal: Goal; people: Person[]; activePersonId: string;
  onRate: (goalId: string, score: number | null) => void;
}) {
  return <section className="satisfaction-poll" aria-label="Anketa spokojnosti">
    <h3>Ako si s týmto teraz spokojný/á?</h3>
    <p>Dobrovoľná odpoveď o aktuálnej spokojnosti. Svoju odpoveď môžeš kedykoľvek zmeniť.</p>
    {people.map((person) => {
      const score = goal.satisfactionByPerson?.[person.id];
      const own = person.id === activePersonId;
      return <div className="satisfaction-person" key={person.id}>
        <div><strong>{person.name}</strong><span>{score !== undefined ? `${score}/5 · ${answers[score - 1]}` : 'Zatiaľ bez odpovede'}</span></div>
        <fieldset disabled={!own}>
          <legend className="sr-only">Spokojnosť osoby {person.name}</legend>
          <div className="satisfaction-answers">{answers.map((answer, index) => <button
            key={answer} type="button" aria-label={`${person.name}: ${index + 1} z 5 – ${answer}`}
            aria-pressed={score === index + 1} title={answer} onClick={() => onRate(goal.id, index + 1)}
          >{index + 1}</button>)}</div>
        </fieldset>
        {own && score !== undefined ? <button className="satisfaction-clear" type="button" onClick={() => onRate(goal.id, null)}>Zrušiť moju odpoveď</button> : null}
      </div>;
    })}
    <p>1 = vôbec nie · 5 = veľmi. Odpovede sa nepriemerujú a neovplyvňujú poradie v ankete priorít.</p>
  </section>;
}
