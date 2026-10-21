'use client';

import { useEffect, useState } from 'react';

type Backup = { revision: number; updated_at: string };

export function BackupPanel({ onClose }: { onClose: () => void }) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('Načítavam zálohy…');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/backups', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      const payload = await response.json() as { error?: string; backups: Backup[] };
      if (!response.ok) throw new Error(payload.error ?? 'Zálohy sa nepodarilo načítať.');
      if (!controller.signal.aborted) { setBackups(payload.backups); setMessage(''); }
    }).catch((error) => { if (!controller.signal.aborted) setMessage(error.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, []);

  async function createBackup() {
    setBusy(true); setMessage('Vytváram zálohu…');
    try {
      const response = await fetch('/api/backups', { method: 'POST', signal: AbortSignal.timeout(30000) });
      const payload = await response.json() as { error?: string; backups: Backup[] };
      if (!response.ok) throw new Error(payload.error ?? 'Záloha sa neuložila.');
      setBackups(payload.backups); setMessage('Aktuálna serverová verzia je zálohovaná.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Záloha sa neuložila.'); }
    finally { setBusy(false); }
  }

  async function downloadBackup(revision: number) {
    setBusy(true); setMessage('Sťahujem zálohu…');
    try {
      const response = await fetch('/api/backups?revision=' + revision, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const payload = await response.json() as { error?: string; backups: Backup[] };
      if (!response.ok) throw new Error(payload.error ?? 'Zálohu sa nepodarilo stiahnuť.');
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `foxies-serverova-zaloha-${revision}.json`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Záloha je stiahnutá. Aktuálna tabuľa zostala zachovaná.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Zálohu sa nepodarilo stiahnuť.'); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="dialog-card data-modal" role="dialog" aria-modal="true" aria-label="História záloh">
      <div className="modal-heading"><h2>História záloh</h2><button type="button" className="icon-button compact" aria-label="Zatvoriť históriu záloh" onClick={onClose}>×</button></div>
      <p>Pred každým uložením sa na serveri zachová predchádzajúca verzia celej tabule. Zálohy sú spoločné pre obe líštičky a zostanú aj po vymazaní pamäte prehliadača.</p>
      <p>Stiahnutý súbor si odlož aj mimo aplikácie. Obsahuje projekty, podúlohy, nastavenia aj históriu vykonaní a umožní dohľadať a obnoviť staršie údaje.</p>
      <button type="button" disabled={busy} onClick={() => void createBackup()}>Zálohovať uloženú tabuľu teraz</button>
      <p role="status" aria-live="polite">{message}</p>
      <div className="backup-history-list" role="list" aria-label="Posledných 100 serverových záloh">
        {backups.map((backup) => <div className="backup-history-row" role="listitem" key={backup.revision}>
          <span><strong>Verzia {backup.revision}</strong><time dateTime={backup.updated_at}>{new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Bratislava' }).format(new Date(backup.updated_at))}</time></span>
          <button type="button" disabled={busy} onClick={() => void downloadBackup(backup.revision)}>Stiahnuť verziu {backup.revision}</button>
        </div>)}
        {!busy && backups.length === 0 ? <p>Zatiaľ tu nie sú serverové zálohy. Vytvor prvú tlačidlom vyššie.</p> : null}
      </div>
      <small>Zobrazuje sa najviac 100 najnovších verzií. Staršie serverové verzie sa automaticky nemažú.</small>
    </section>
  </div>;
}
