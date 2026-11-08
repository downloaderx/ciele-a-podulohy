# Rutiny

Samostatná stránka `/rutiny`. Rutiny aj Lists & todos majú prepínač Spoločné / Rini osobné / Fluffy osobné. Kategória `routine` alebo `list` a `spaceId` určujú samostatnú kolekciu. Spoločné položky môžu meniť obe líštičky; osobné druhého profilu sú na prezeranie. Každá sekcia má nezávislý výber priestoru. Existujúce zoznamy zostávajú spoločné a existujúce rutiny osobné, bez migrácie alebo kopírovania. Nie sú súčasťou chores, priorít ani merania projektov.

Definícia rutiny je plochý usporiadaný zoznam krokov. Uloženie editora je jeden stavový zápis; odstránené kroky dostanú tombstone. Spustenie vytvorí novú snímku názvov a poradia, takže úprava definície nemení rozbehnutú rutinu.

`routineRun` obsahuje aktuálne spustenie, pauzu a udalosti krokov. Hotovo/preskočiť/späť pridávajú udalosti s ID, ktoré sa pri súbežnej synchronizácii zlučujú. Späť vráti predchádzajúci krok medzi čakajúce. Nové spustenie nahradí predchádzajúce; samostatný denník minulých spustení zatiaľ nie je súčasťou rozhrania. Rôzne súbežne spustené verzie sa nikdy nezmiešajú do jedného spustenia; využívajú existujúce archivovanie alternatív.

Dáta používajú existujúci autosave, zdieľanú pamäť potvrdeného stavu, serverové zálohy pred zápisom a ochranu pri prepínaní profilov. JSON export obsahuje definície aj aktuálny postup. Server zachová postup, ak ho starší klient vynechá, a nedovolí upravovať osobné rutiny alebo zoznamy druhého profilu. Presun do koša je vratný; trvalé odstránenie odstráni obsah vrátane postupu existujúcou cestou tombstone.

Overenie: modelové testy prechodu, preskočenia, návratu, pauzy, nového spustenia, snímky, validácie a zlučovania; serverové oprávnenia a starší klient; test skutočného sync hooku cez obe líštičky. Lokálne UI testy používajú výhradne jednorazovú databázu: vytvorenie, zmena poradia, spustenie, pauza, reload, dokončenie, nový beh, prepnutie profilov, 390 px a desktop.

Rozhranie používa rovnakú mriežku a kartičky ako Lists & todos: zhodná šírka, základná výška a mobilné správanie vo všetkých troch priestoroch aj pri otvorení jednej rutiny. Prehľad ukazuje všetky rutiny. Kroky sú na kartičke vždy viditeľné; počas spustenia sa zvýrazní aktuálny krok a zobrazujú sa výsledky hotových/preskočených krokov. Dlhý zoznam krokov sa posúva vnútri kartičky, aktuálny krok sa doň automaticky dosunie. Ovládanie spustenia, pauzy, návratu a nového spustenia zostáva na kartičke. Kôš je dole v editore rutiny.
