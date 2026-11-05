'use client';

import { useEffect, useState } from 'react';
import { readTransferData, type AppStateData } from './page-model';
import { isValidState } from './state-sync';

type Backup = { revision: number; updated_at: string };

export function BackupPanel({ onClose, onChoose }: { onClose: () => void; onChoose: (data: AppStateData, label: string) => void }) {
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

  async function chooseBackup(backup: Backup) {
    setBusy(true); setMessage('Pripravujem zálohu…');
    try {
      const response = await fetch('/api/backups?revision=' + backup.revision, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      const payload = await response.json() as { error?: string; backups: Backup[] };
      if (!response.ok) throw new Error(payload.error ?? 'Zálohu sa nepodarilo načítať.');
      const data = readTransferData(payload);
      if (!data || !isValidState(data)) throw new Error('Táto záloha nemá platný formát.');
      onChoose(data, 'Automatická záloha · ' + new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bratislava' }).format(new Date(backup.updated_at)));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Zálohu sa nepodarilo načítať.'); }
    finally { setBusy(false); }
  }

  return <div className="modal-backdrop" role="presentation">
    <section className="dialog-card data-modal" role="dialog" aria-modal="true" aria-label="Staršie zálohy">
      <div className="modal-heading"><h2>Staršie zálohy</h2><button type="button" className="icon-button compact" aria-label="Zatvoriť staršie zálohy" onClick={onClose}>×</button></div>
      <p>Tieto zálohy sa ukladajú automaticky pre obe líštičky. Vyber dátum; samotné obnovenie ešte potvrdíš v ďalšom kroku.</p>
      <p role="status" aria-live="polite">{message}</p>
      <div className="backup-history-list" role="list" aria-label="Posledných 100 serverových záloh">
        {backups.map((backup) => <div className="backup-history-row" role="listitem" key={backup.revision}>
          <span><strong>Verzia {backup.revision}</strong><time dateTime={backup.updated_at}>{new Intl.DateTimeFormat('sk-SK', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Europe/Bratislava' }).format(new Date(backup.updated_at))}</time></span>
          <button type="button" disabled={busy} aria-label={`Vybrať verziu ${backup.revision} na obnovenie`} onClick={() => void chooseBackup(backup)}>Vybrať na obnovenie</button>
        </div>)}
        {!busy && backups.length === 0 ? <p>Staršia záloha tu zatiaľ nie je. Vytvorí sa automaticky pri ukladaní zmien.</p> : null}
      </div>
      <small>Zobrazuje sa najviac 100 najnovších verzií. Staršie serverové verzie sa automaticky nemažú.</small>
    </section>
  </div>;
}
