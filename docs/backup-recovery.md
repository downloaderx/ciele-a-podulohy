# Zálohy a bezpečné prepínanie profilov

Pred každým zápisom sa predchádzajúca potvrdená verzia uloží ako samostatný riadok `main:backup:<revision>` v súkromnej tabuľke `app_state`. Používa rovnaké serverové oprávnenia ako hlavná tabuľa. Záloha sa vytvára pred atomickým zápisom s kontrolou revízie. Existujúca záloha tej istej revízie sa nemení. Ak vytvorenie zálohy zlyhá, hlavný zápis sa nevykoná a klient si ponechá rozpracované dáta.

V Nastaveniach → História záloh sa zobrazuje posledných 100 serverových verzií. Staršie verzie sa automaticky nemažú; ďalšiu politiku uchovávania treba zaviesť vedome podľa veľkosti databázy. Tlačidlo na manuálnu zálohu zachová aktuálny uložený serverový stav, nie ešte neodoslané úpravy klienta. Stiahnutý súbor obsahuje úplný stav vo formáte podporovanom prenosom dát. Pri obnove starších údajov porovnajte ID položiek s aktuálnym stavom, aby sa zachovali novšie nezávislé zmeny. Aj zápis obnovenej verzie najprv zálohuje stav, ktorý nahrádza.

Serverové verzie sú v tej istej databáze ako živá tabuľa. Samostatne stiahnutý súbor mimo aplikácie poskytuje ďalšiu nezávislú kópiu. Tieto aplikačné zálohy nenahrádzajú zálohovanie celého databázového účtu poskytovateľom.

Prehliadač uchováva živú rozpracovanú kópiu s jej pôvodnou serverovou verziou pre oba profily. Pribudnú najviac 12 nedávnych a 7 denných kontrolných bodov na profil; pamäťové limity môžu počet znížiť. Živá kópia má pri ukladaní prednosť pred voliteľnou históriou. Prvá záchranná kópia každého profilu sa neprepisuje. Export všetkých lokálnych verzií zahŕňa tieto kontrolné body aj pôvodné staršie zálohy, ale nie prihlasovacie údaje ani pamäť iných aplikácií.

Posledná potvrdená serverová verzia je spoločná pre obe líštičky a jej revízia nesmie pri dobehnutí staršieho čítania klesnúť. Pri výpadku spojenia pomáha zobraziť kompletnú poslednú známu tabuľu aj pri výbere druhého profilu. Rozpracované zmeny druhej líštičky sa pri tom zachovajú a pri konflikte je potrebný výber konkrétnych polí.

Pred bežným odhlásením alebo prepnutím sa dokončí prebiehajúce uloženie. Počas operácie sú ovládacie prvky dočasne zablokované. Chyba uloženia alebo konflikt prepnutie zastaví. Každé nové čítanie a uloženie kontroluje očakávaný profil voči serverovej relácii; zmena profilu v inom okne pozastaví odosielanie a zachová staré rozpracované zmeny pod pôvodným profilom.

`npm test` spúšťa testy serverových oprávnení, histórie a obnovy aj skutočný synchronizačný hook s riadeným HTTP, plánovačom a lokálnou pamäťou. Zahŕňa spustenie so starou cache, konflikty s novými chores, prepnutie počas zápisu, výpadok spojenia, plnú pamäť aj zmenu relácie medzi čítaním a zápisom. Izolované testy používajú len vymyslené dáta.
