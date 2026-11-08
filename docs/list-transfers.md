# Presun zoznamov

V úpravách kartičky Lists & todos je samostatný výber cieľovej časti a tlačidlo Presunúť zoznam. Presun zachováva rovnaké ID, autora, farbu, všetky úlohy, ich stav aj kôš podúloh. Mení iba priestor a autora úpravy. Rozhranie otvorí cieľovú časť a zobrazí potvrdenie.

Presúvať možno zo spoločnej časti alebo vlastnej osobnej časti do ktorejkoľvek z troch častí. Osobný zoznam druhej líštičky môže presunúť iba jej profil. Odovzdanie do osobnej časti druhej osoby nedáva pôvodnej osobe oprávnenie na ďalšie úpravy; nový priestor určuje práva. Existujúce pravidlá osobných projektov a rutín sa nemenia. Odstránené a natrvalo vymazané zoznamy sa takto presúvať nedajú.

Server overuje pôvodný priestor, kategóriu a stav proti uloženej verzii. Výnimka z nemenného priestoru platí len pre zoznamy. Aj presun do osobnej časti druhej osoby ide cez bežné autorizačné spracovanie vrátane zachovania histórie a odstránených potomkov; nevytvára sa kópia ani tombstone pôvodného zoznamu. Uloženie využíva existujúcu zálohu pred zápisom a kontrolu revízie.
