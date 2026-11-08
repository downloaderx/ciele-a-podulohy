# Špajznička a obľúbené jedlá

Stránka `/spajznicka` obsahuje vľavo spoločné zásoby (chladnička a špajza v jednej kartičke) a napravo obľúbené jedlá. Kategórie `pantry` a `recipe` sú oddelené od Chores, zoznamov, rutín a ankiet. Rozhranie používa rovnakú šírku a základné rozmery kartičiek ako Lists & todos; na mobile sa stĺpce skladajú pod seba.

Zásoby sú položky pod cieľom kategórie pantry. `done: true` znamená dostupnú surovinu. Odznačenie surovinu zachová ako minutú; opätovné pridanie rovnakého názvu ju aktivuje. Pri súbežnom vytvorení viacerých kontajnerov zásob sa všetky agregujú, údaje sa nevyhadzujú. Suroviny receptu sú položky pod cieľom recipe; `foodSelected` označuje jedlo vybrané na porovnanie. Je možné vybrať viac jedál súčasne.

Dostupnosť je podiel unikátnych potrebných surovín, ktoré sú v zásobách dostupné. Názvy sa porovnávajú bez diakritiky, rozdielnej veľkosti písmen a nadbytočných medzier. Synonymá, jednotky a množstvá sa neodhadujú. `foodAmount` je iba voľná poznámka (najviac 120 znakov); množstvá sa neporovnávajú. Prázdny recept nezobrazuje 100 %. Vybrané jedlá majú percento, hore skupinu Máme a dole Chýba; nevybrané majú bežný zoznam surovín.

Všetky zmeny používajú existujúci autosave, predzápisové serverové zálohy a kontrolu revízie. Obe líštičky pracujú s rovnakými spoločnými zásobami a jedlami; zmena profilu dáta nemení. Poznámky množstva a výber jedál sa zachovajú aj pri zápise zo staršieho klienta, ktorý ich vynechá. Export/obnova zahŕňa zásoby, recepty, množstvá aj výber. Mazanie používa existujúci vratný kôš; trvalé vymazanie odstráni aj poznámky množstva a výber.

Overenie: modelové testy dostupnosti a zhodných názvov, duplicít, prázdnych receptov, minulých/vymazaných zásob, validácie, oprávnení, zlučovania, starších klientov a exportu; skutočný sync hook cez obe líštičky. Jednorazový lokálny UI test pokryl vytvorenie zásob aj jedla, 75/50/100 %, automatické presúvanie medzi Máme/Chýba, viac vybraných jedál, editáciu poznámky množstva, reload, oba profily a mobilné rozmery bez pretekania. Produkčné jedlá ani zásoby sa pri testovaní nevytvárali.
