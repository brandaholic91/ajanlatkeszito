# Ajánlatkészítő

Szabad szöveges ajánlatkérésből egy percen belül márkázott PDF-ajánlat. Portfólió-demó egy kitalált telekom-szolgáltató („Kéktorony Telekom”) árlistájával.

**Élő demó:** https://ajanlat-demo.growthframe.hu · **Mintaajánlat:** [samples/minta-ajanlat.pdf](samples/minta-ajanlat.pdf)

## Mit csinál

1. A néző beír egy ajánlatkérést, ahogy egy ügyfél e-mailben írná.
2. Egy nyelvi modell kiolvassa belőle a tételeket és a mennyiségeket.
3. Az adatbázis ellenőrzi a tételeket, és kiszámolja az árat a mennyiségi kedvezménnyel. Ha valami nem egyértelmű, ajánlat helyett visszakérdezés készül.
4. A néző az értékesítő szerepében jóváhagyja az ajánlatot.
5. Elkészül a PDF, bekerül a tárolóba, és e-mailben kimegy.
6. Két perc múlva emlékeztető megy az ajánlatról.

Az oldal közben élő lépésnaplóban mutatja, hol tart a folyamat, és mennyi idő telt el.

## A fontosabb tervezési döntések

- **A modell árat sosem lát.** Az árlistát árak nélkül kapja meg, és csak azonosítót és mennyiséget ad vissza. Az ár mindig adatbázis-függvényből jön, így a modell kitalálni sem tudja.
- **Ajánlat csak emberi jóváhagyás után megy ki.** A jóváhagyás az adatbázisban dől el, ezért dupla kattintásra sem megy két levél.
- **A kiküldött PDF nem változik utólag.** A fájl a tárolóból jön vissza, nem készül újra letöltéskor. Teszt igazolja, hogy a tárolt és a kiküldött fájl bájtra azonos.
- **A böngésző csak a demóoldallal beszél.** Az n8n, az adatbázis és a tároló a belső hálózaton marad.
- **A hiba nem marad csendben.** A félúton elakadt kérést egy időzített workflow lezárja, a hibákról riasztás megy Discordra.

## Miből áll

| Rész | Technológia |
|---|---|
| Folyamatvezérlés | három [n8n](https://n8n.io) workflow: feldolgozás; jóváhagyás és küldés; utánkövetés és hibakezelés |
| Ellenőrzés és árazás | PostgreSQL-függvények |
| Tételek kiolvasása | nyelvi modell (`deepseek-v4.1-flash`) |
| PDF-készítő | Python: FastAPI, Playwright, Jinja2 |
| Tároló | S3-kompatibilis objektumtároló |
| Levélküldés | Resend |
| Demóoldal | Next.js |

## Mennyire megbízható

- **Modell:** egy 20 kérésből álló mérésben 19 helyes eredmény (2026-10-06, egy futás, a promptot nem hangoltam a tesztkérésekre). Az egyetlen hiba egy ékezet nélküli, szlenges kérés volt, ahol a modell kihagyott egy tételt.
- **Kód:** 41 automata teszt, ál-modellel, ál-levélküldővel és ál-riasztócsatornával. Ezek a bekötést és az árazást igazolják, a promptot nem.

## Amiben a demó eltér az éles működéstől

- **Az emlékeztető 2 perc után megy, és mindenkinek.** Élesben 72 óra után menne, és csak annak, aki nem válaszolt. A demóban nincs válaszfigyelés.
- **Napi keret van:** legfeljebb 50 kérés és 40 levél naponta. Ha a levélkeret betelt, a PDF az oldalról ettől még letölthető.
- **A kérések 14 nap után törlődnek**, a tárolt PDF-fel együtt. Az oldalon [adatkezelési tájékoztató](https://ajanlat-demo.growthframe.hu/adatkezeles) írja le, mi történik a megadott adatokkal.
- **Az árlista és a cégnév kitalált.** Egyik ár sem valós szolgáltató díja.

## Kipróbálás helyben

Docker és [uv](https://docs.astral.sh/uv/) kell hozzá.

```bash
bash tests/setup_local.sh      # elindít mindent, betölti a három workflow-t az ál-modellel
uv run --with pytest --with httpx --with 'psycopg[binary]' --with pypdf --with boto3 pytest tests/ -v
```

A demóoldal utána a http://localhost:3000 címen érhető el.

## Részletes leírás

- [docs/mukodes.md](docs/mukodes.md): a három workflow lépésenként, a demóoldal végpontjai, a lépésnapló, az árazás szabályai, és hogy melyik fájl mit csinál.
- [docs/fejlesztes.md](docs/fejlesztes.md): helyi futtatás, címek, az adatbázis-változások átvezetése, ismert buktatók.

## Licenc

MIT, lásd a [LICENSE](LICENSE) fájlt.
