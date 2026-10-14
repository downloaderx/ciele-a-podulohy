# Little acorns Foxies

Spoločná a osobná tabuľa pre Rini a Fluffyho. React 19, Next.js 16, Supabase Auth + Postgres, nasadenie cez GitHub a Vercel.

## Spustenie

Vyžaduje Node.js >= 22.13 a pnpm. Nainštalujte závislosti pomocou `pnpm install --frozen-lockfile`, skopírujte `.env.example` do ignorovaného `.env.local` a vyplňte:

- `SUPABASE_URL`: URL existujúceho Supabase projektu.
- `APP_AUTH_MODE`: predvolene `profiles` (výber líštičky bez hesla); neskôr `supabase` (overené účty).
- `SUPABASE_ANON_KEY`: potrebný iba v režime `supabase`; anon API kľúč používaný na serveri na prihlásenie.
- `SUPABASE_SERVICE_ROLE_KEY`: tajný serverový kľúč. Nikdy nepoužívajte prefix `NEXT_PUBLIC_`.
- `SUPABASE_APP_STATE_KEY`: existujúci identifikátor záznamu (predvolene `main`). Nemeňte ho pri migrácii existujúcej tabule.

`pnpm dev` spustí vývojový server. `pnpm build` a `pnpm start` vytvoria a spustia produkčnú verziu. Webpack je explicitný, aby lokálny a Vercel build používali rovnakú cestu. Historická konfigurácia Sites zostáva dostupná pod `pnpm build:sites`; pre tento projekt sa používa Vercel.

## Aktualizácia existujúcej databázy

Pred nasadením najprv exportujte súčasnú tabuľu cez jej Export JSON a zálohujte záznam v `app_state`. Spustite v SQL editore existujúceho projektu [migráciu](supabase/migrations/20261014000100_secure_sync.sql). Tá nemení obsah `app_state.data`; pridáva číselnú revíziu, zoznam povolených účtov a atómovú funkciu na ukladanie.

Účty teraz nie sú potrebné. Pre budúce zapnutie hesiel vytvorte alebo použite v Supabase Authentication dva účty s e-mailom a heslom. Vytvorenie hesiel vykonajte priamo v Supabase, nie v chate. Priraďte ich UUID k profilom:

```sql
insert into public.app_members (user_id, person_id) values
  ('UUID_UCTU_RINI', 'person-1'),
  ('UUID_UCTU_FLUFFY', 'person-2');
```

Nahraďte oba placeholdery skutočnými UUID z Authentication → Users. Ak priradenia už existujú, nemenia sa bez zámernej administrátorskej úpravy. Verejná registrácia aplikácie nie je implementovaná; účet bez priradenia nedostane dáta.

Až po vytvorení a priradení oboch účtov nastavte `APP_AUTH_MODE=supabase` a `SUPABASE_ANON_KEY`. Režim `supabase` neakceptuje cookie z výberu profilu; účet sa overuje cez Supabase Auth. V režime `profiles` zostáva výber líštičky bez hesla a osobné tabule nie sú súkromné pred človekom, ktorý si zvolí druhý profil.

Na čistej databáze najprv aplikujte `20260920071500_app_state.sql` a potom novú migráciu. Pôvodný `schema.sql` obsahuje aj starší, nepoužívaný model viacerých tabúľ; aktuálna aplikácia používa `app_state` a `app_members`.

## Vercel a GitHub

V nastaveniach existujúceho Vercel projektu nastavte premenné úložiska a `APP_AUTH_MODE=profiles` pre Production a samostatne pre Preview. Preview má používať testovaciu databázu alebo odlišný `SUPABASE_APP_STATE_KEY`, aby testovanie nemenilo živú tabuľu. Pre súčasnú aplikáciu netreba účty ani heslá; migrácia je potrebná pre bezpečné súčasné ukladanie. Pri budúcom prepnutí na `APP_AUTH_MODE=supabase` nastavte aj `SUPABASE_ANON_KEY` a priraďte oba účty.

Vercel konfigurácia spúšťa `pnpm build`. Vetva/PR môže mať Preview deployment; do produkcie zlučujte až po nastavení databázy a premenných. Pripravený GitHub workflow kontroluje TypeScript, lint, testy a produkčné zostavenie.

## Ukladanie a konflikty

V režime `supabase` server overuje access token cez Supabase Auth a potom členstvo cez `app_members`. V predvolenom režime `profiles` cookie predstavuje iba zvolenú líštičku, nie overenú identitu. Access a refresh tokeny sú v HttpOnly cookies, v produkcii aj Secure; zápisy kontrolujú rovnaký pôvod požiadavky. RLS a odobraté oprávnenia blokujú priamy prístup klienta k obom tabuľkám. RPC môže vykonať len serverový `service_role`.

GET a export poskytujú spoločné dáta aj osobné tabule oboch osôb. Obaja používatelia môžu osobné ciele navzájom prezerať; obsah osobnej tabule môže meniť iba jej vlastník. Server zachová partnerove osobné ciele, profil, hlasy a poradie aj pri zmanipulovanom zápise.

Každý zápis uvádza revíziu. SQL funkcia zmení dáta iba pri zhodnej revízii; inak klient načíta aktuálnu verziu a zlúči zmeny voči poslednej potvrdenej zálohe. Nezávislé polia a nové položky sa zlúčia. Rozdielne úpravy toho istého poľa alebo vymazanie oproti úprave vyžadujú výber. Pred výberom možno stiahnuť lokálnu verziu a sporné serverové polia.

Lokálna záloha obsahuje aj východiskový stav pre zlúčenie a je oddelená podľa profilu. Je uložená v prehliadači zariadenia; používajte dôveryhodné zariadenie. Pri riadnom odhlásení sa aktívna pracovná záloha zmaže. V Nastaveniach je aj možnosť stiahnuť zálohu a opustiť profil so zachovaním lokálnych neuložených zmien pre ďalší návrat. Staré lokálne dáta sa pri prvom prihlásení prefiltrujú na dostupné priestory; staré kľúče sa nevymazávajú, aby zostala zachovaná pôvodná záloha. Poškodený obsah možno stiahnuť. Chyby synchronizácie sú viditeľné a aplikácia skúša uloženie znovu pri návrate do okna, pripojení siete a každých 8 sekúnd.

Ciele aj vnorené podúlohy sa mažú do obnoviteľného koša. Po importe odstránené existujúce položky server zachová v koši. Dlhodobá história dokončení opakovania uchováva posledných 20 udalostí.

Pripomienky sú voliteľné oznámenia prehliadača, najviac raz denne pre cieľ. Fungujú iba pri otvorenej aplikácii a po povolení používateľom; nie sú serverové push oznámenia pri zatvorenej aplikácii. Termíny sa zobrazujú v lokálnom čase zariadenia.

## Overenie

```text
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Testy overujú vnorenú validáciu, vzájomné prezeranie osobných dát a ochranu pred úpravou partnerovej tabule, ochranu partnerových hlasov, zlúčenie nezávislých úprav, textové konflikty, mazanie oproti úprave, históriu opakovania, obnoviteľné mazanie, kontrolu pôvodu a súčasné API zápisy. API test používa pamäťový testovací Supabase server; nepristupuje k produkčným dátam. Živá databáza sa musí overiť po aplikovaní migrácie. Pri budúcom zapnutí účtov treba overiť aj prihlásenie oboch reálnych používateľov.
