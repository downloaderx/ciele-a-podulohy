'use client';

import type { Goal, Person } from './page-model';
import { gratitudeDay } from './gratitude';
import { satisfactionDateLabel, satisfactionSchedule } from './satisfaction-schedule';

const answers = ['Vôbec nie', 'Skôr nie', 'Tak napoly', 'Skôr áno', 'Veľmi'];

export function SatisfactionSummary({ goal, people }: { goal: Goal; people: Person[] }) {
  return <div className="satisfaction-summary" aria-label="Posledné hodnotenie spokojnosti">
    <span>Posledná spokojnosť</span>
    {people.map((person) => {
      const score = goal.satisfactionByPerson?.[person.id];
      const day = goal.satisfactionAnsweredOnByPerson?.[person.id];
      return <span key={person.id}>{person.name}: <b>{score !== undefined ? `${score}/5` : 'bez odpovede'}</b>{score !== undefined ? day ? <time dateTime={day}>{satisfactionDateLabel(day)}</time> : <small>dátum neznámy</small> : null}</span>;
    })}
  </div>;
}

export function SatisfactionPoll({ goal, people, activePersonId, onRate, day = gratitudeDay() }: {
  goal: Goal; people: Person[]; activePersonId: string; day?: string;
  onRate: (goalId: string, score: number | null) => void;
}) {
  const schedule = satisfactionSchedule(day);
  if (!schedule.isOpen) return null;
  return <section className="satisfaction-poll" aria-label="Anketa spokojnosti">
    <h3>Ako si s týmto teraz spokojný/á?</h3>
    <p>Dobrovoľné hodnotenie každú druhú nedeľu. Dnes je dostupné celý deň; dnešnú odpoveď môžeš zmeniť.</p>
    {people.map((person) => {
      const lastScore = goal.satisfactionByPerson?.[person.id];
      const lastDay = goal.satisfactionAnsweredOnByPerson?.[person.id];
      const score = lastDay === day ? lastScore : undefined;
      const own = person.id === activePersonId;
      return <div className="satisfaction-person" key={person.id}>
        <div><strong>{person.name}</strong><span>{score !== undefined ? `${score}/5 · ${answers[score - 1]}` : 'Dnes zatiaľ bez odpovede'}</span></div>
        {score === undefined && lastScore !== undefined ? <p className="satisfaction-previous">Naposledy: {lastScore}/5 · {lastDay ? satisfactionDateLabel(lastDay) : 'dátum neznámy'}</p> : null}
        <fieldset disabled={!own}>
          <legend className="sr-only">Spokojnosť osoby {person.name}</legend>
          <div className="satisfaction-answers">{answers.map((answer, index) => <button
            key={answer} type="button" aria-label={`${person.name}: ${index + 1} z 5 – ${answer}`}
            aria-pressed={score === index + 1} title={answer} onClick={() => onRate(goal.id, index + 1)}
          >{index + 1}</button>)}</div>
        </fieldset>
        {own && score !== undefined ? <button className="satisfaction-clear" type="button" onClick={() => onRate(goal.id, null)}>Zrušiť moju dnešnú odpoveď</button> : null}
      </div>;
    })}
    <p>1 = vôbec nie · 5 = veľmi. Odpovede sa nepriemerujú a neovplyvňujú poradie v ankete priorít.</p>
    <p>Ďalšie hodnotenie: {satisfactionDateLabel(schedule.nextDay)}.</p>
  </section>;
}
