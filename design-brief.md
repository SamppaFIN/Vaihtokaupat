# Design brief — Vaihtokaupat

> Generoitu `init-project`-alustuksella, koska projektissa on käyttöliittymä.
> Liitä koko tiedosto **Claude Designiin**, jotta mockupit käyttävät projektin
> omia tokeneita eivätkä yleisiä oletuksia.

## Konteksti

- **Projekti:** Vaihtokaupat — vaihtoalusta, jossa jäsenet kertovat mitä
  tarjoavat ja mitä toivovat tilalle, ja sopivat vaihdon kasvokkain ilman
  rahaa.
- **Kohdekäyttäjä:** paikallisen vaihtoryhmän jäsenet. Suunnitelmien
  esimerkkidatassa he ovat lapsiperheitä, jotka kierrättävät lastenvaatteita
  Espoossa, Vantaalla ja Tampereella.
- **Ensisijainen laite:** puhelin (390 px). Desktop (1440 px) on toissijainen.
- **Sävy:** Arena eli rock'n roll: spottivalot, tähdet, kitarankielierottimet
  ja keikkalippuilmoitukset. Reilu ja lämmin: "Vaihda, älä myy".
- **Visuaalinen lähde:** `Design system/Vaihtokaupat Arena.dc.html`. Etusivu
  on siellä valmiina, eikä sitä suunnitella uudelleen.

## Suunniteltavat näkymät

Jokaiseen näkymään tarvitaan myös tilat: lataus (luuranko), tyhjä, virhe
(ohje siitä, mitä tehdä) ja onnistuminen.

1. **Ilmoitusruudukko ja suodattimet.** Ilmoitukset näytetään
   keikkalippukortteina, joissa on tunniste (#0142), otsikko, tarjoan ja
   toivon lyhyesti, paikkakunta sekä tila "Avoin" tai "Vaihdettu".
   Suodattimina ovat paikkakunta, tila ja tekstihaku.
2. **Ilmoitussivu.** Sivulla ovat tarjoan, toivon tilalle, noutopaikka, kuva
   ja tila. "Näytä yhteystiedot" -nappi paljastaa sähköpostin, puhelinnumeron
   ja WhatsAppin. Lisäksi sivulla ovat "Ilmoita asiaton" ja "Muokkaa
   koodilla".
3. **Ilmoituksen luonti.** Lomakkeessa on kolme osaa (Tarjoan, Toivon tilalle,
   Paikkakunta ja noutoalue), yhteystiedot (vähintään yksi), kuva ja pakollinen
   liittymislupaus: "Lupaan, että en myy enkä osta tässä ryhmässä – vain
   vaihdan." Lomake neuvoo kirjoittamaan noutopaikaksi kaupunginosan eikä
   katuosoitetta. Onnistumisnäkymä näyttää muokkauskoodin kerran, isona ja
   kopioitavana, ja varoittaa, ettei koodia voi palauttaa.
4. **Muokkaustila.** Näyttää samalta kuin ilmoitussivu. Alueet merkitään
   katkoviivalla ja "✎ Muokkaa" -napilla, joka on kosketusnäytöllä aina
   näkyvissä. Klikattu alue avautuu kultaisella reunuksella. Näkymään kuuluvat
   koodikyselyikkuna sekä Tallenna ja Peruuta.
5. **Vaihdettu ja poisto.** "Merkitse vaihdetuksi" -vahvistus kertoo, että
   yhteystiedot poistuvat. Lisäksi tarvitaan vaihdetun ilmoituksen kortti ja
   poiston vahvistus.
6. **Tietosuojaseloste ja käyttöehdot.** Pitkä teksti, jonka typografia on
   luettava.
7. **Ylläpitosivu `/admin`.** Tarjoillaan Workerilta. Lista on järjestetty
   ilmoitusmäärän mukaan, ja jokaisella rivillä ovat Piilota, Näytä ja Poista.
   Matala prioriteetti, joten riisuttu ulkoasu riittää.

## Design-systeemi — käytä näitä, älä keksi uusia

Arviot on muunnettu Arenan omista hex-väreistä OKLCH-muotoon, ja
kontrastisuhteet on laskettu `--c-bg`:tä vasten.

```css
:root {
  /* OKLCH: perceptually uniform, no surprises when you shift lightness */
  --c-bg:          oklch(0.15 0.004 286);  /* #0A0A0C */
  --c-surface:     oklch(0.18 0.008 274);  /* #111216 kortit, kielet */
  --c-surface-2:   oklch(0.22 0.010 277);  /* #1A1B20 */
  --c-text:        oklch(0.92 0.003 85);   /* #E5E4E2 platina, 15.6:1 */
  --c-text-muted:  oklch(0.79 0.012 264);  /* #B8BCC4, 10.4:1 */
  --c-text-faint:  oklch(0.66 0.013 264);  /* #8E929A, 6.3:1 */
  --c-accent:      oklch(0.77 0.139 91);   /* #D4AF37 kulta, 9.4:1 */
  --c-accent-hi:   oklch(0.91 0.127 99);   /* #F6E27A linkit, 15.1:1 */
  --c-accent-deep: oklch(0.54 0.100 85);   /* #8A6A1C vain koriste, 3.9:1 */
  --c-spark:       oklch(0.89 0.079 220);  /* #9FE8FF tähtikipinä */
  --c-live:        oklch(0.52 0.202 26);   /* #C1121F live-piste, vain koriste, 3.2:1 */
  --c-danger:      oklch(0.71 0.181 23);   /* uusi, ei Arenassa: virheteksti, 7.1:1 */
  --c-success:     oklch(0.79 0.155 154);  /* uusi, ei Arenassa: onnistuminen, 10.8:1 */

  --font-display: Anton, Impact, sans-serif;        /* hero, isot otsikot */
  --font-head:    Oswald, sans-serif;               /* otsikot, isot kirjaimet */
  --font-body:    Manrope, system-ui, sans-serif;   /* leipäteksti */

  /* Responsiivinen typografia ilman media queryja (Arenan omat arvot).
     cqi vaatii kääreeseen container-type: inline-size. */
  --fs-hero:  clamp(3rem, 13.6cqi, 12.25rem);      /* 48–196 px */
  --fs-h2:    clamp(2.5rem, 6cqi, 4.875rem);       /* 40–78 px */
  --fs-h3:    clamp(1.375rem, 2.6cqi, 2rem);       /* 22–32 px */
  --fs-body:  clamp(1.0625rem, 1.5cqi, 1.25rem);   /* 17–20 px */
  --fs-label: clamp(0.8125rem, 1.2cqi, 0.9375rem); /* 13–15 px, isot kirjaimet */

  --touch-target: 44px;        /* WCAG 2.5.5 */
}
```

Pakolliset toiminnot:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  /* myös spottivalot ja live-pisteen sykintä pysähtyvät */
}

:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
```

## Rajoitteet

- Jokainen interaktiivinen kohde on vähintään 44 × 44 px
- Kontrasti täyttää WCAG AA:n `--c-bg`:tä vasten, myös spottivalojen ja
  liukuvärien päällä
- Väri ei koskaan yksin kanna merkitystä, vaan jokaisen värivihjeen rinnalla
  on teksti tai ikoni ("Avoin" ja "Vaihdettu" kirjoitetaan tekstinä)
- `--c-live`- ja `--c-accent-deep`-värejä käytetään vain koristeena, ei
  koskaan tekstissä
- Yhteystiedot ovat aina napin takana, ja muokkauskoodi näytetään vain kerran
- Fontit hostataan itse (Anton, Oswald, Manrope) eikä Google Fonts -linkkejä
  käytetä
- Jokaisessa näkymässä on täsmälleen yksi h1

## Mitä tuotetaan

Mockupit yllä luetelluille näkymille listan järjestyksessä. Suunnittele yksi
näkymä kerrallaan: näytä se, ota palaute vastaan ja siirry vasta sitten
seuraavaan. Älä suunnittele kaikkia ennen kuin ensimmäinen on hyväksytty.
