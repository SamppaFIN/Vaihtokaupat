# SETUP — Vaihtokaupat

Tee nämä järjestyksessä. Kohdat 1–3 kuittaavat alustuksen, eikä projekti
toimi oikein ennen niitä.

## A. Alustuksen kuittaus (nyt)

1. **Projektiohjeet.** Avaa claude.ai:ssa projekti Vaihtokauppa ja valitse
   **Set project instructions**. **Korvaa** koko nykyinen sisältö
   (ALUSTUSTILA-ohje) tiedoston `INSTRUCTIONS-FINAL.md` sisällöllä. Hermes ei
   voi tehdä tätä puolestasi.
2. **Project knowledge.** Hermes on jo kirjoittanut sinne tiedostot
   `claude/CLAUDE.md`, `claude/backlog.json`, `claude/design-brief.md` ja
   kuusi skeematiedostoa `schemas/*.schema.json`. Tarkista, että ne näkyvät.
   Kun myöhemmin lataat uuden version jostain tiedostosta, poista vanha
   samalla, jotta knowledgeen ei jää kahta backlogia.
3. **Pohjat pois knowledgesta.** Tarkista, ettei knowledgessa ole tiedostoja
   `CLAUDE.*.md.template`, `design-brief.template.md` tai
   `backlog.example.json`. Alustushetkellä niitä ei ollut. Suositus: poista
   myös `support.js` ja `image-slot.js`. Ne ovat Claude Designin ajonaikaista
   koodia (noin 130 kt), eivät kuulu projektiin ja sotkevat hakuja. Alustuksen
   aikana haku pohjatiedostoista palautti pelkkää `support.js`:ää.

## B. Repo (ennen STORY-001:tä)

4. Luo GitHubiin **julkinen** ja tyhjä repo `SamppaFIN/Vaihtokaupat` ilman
   README-, .gitignore- ja LICENSE-pohjia. Julkisuus on ilmaisen GitHub Pagesin
   edellytys.
5. Kansiossa `C:\Projects\Vaihtokaupat` ovat jo tiedostot `CLAUDE.md`,
   `backlog.json`, `design-brief.md`, `INSTRUCTIONS-FINAL.md` ja `SETUP.md`.
   Tee siellä seuraavat:
   - `git init`
   - `.gitignore`, jossa ovat `node_modules/`, `.wrangler/`, `.dev.vars` ja
     `templates/`
   - `LICENSE` (MIT, tekijänä Sami)
   - `Design system/` commitoidaan sellaisenaan referenssiksi
6. Tee ensimmäinen commit ja push `main`-haaraan. Päivitä sen jälkeen
   `backlog.json`:n `_meta.git_commit` ja `_meta.git_branch`, ja lataa uusi
   versio knowledgeen vanhan tilalle.

## C. GitHub Pages ja Cloudflare (STORY-002:n aikana)

7. GitHubissa: **Settings → Pages → Source: GitHub Actions**.
8. Cloudflare, aina projektin juuresta:
   - `npm install`
   - `npx wrangler login`
   - R2-ämpärin luonti (nimi päätetään STORY-001:n suunnitelmassa)
   - `npx wrangler secret put CODE_SECRET`, `ADMIN_SECRET` ja
     `TURNSTILE_SECRET`. Turnstilelle käy väliaikainen arvo STORY-015:een asti.
9. GitHubissa: **Settings → Secrets and variables → Actions**
   - `CLOUDFLARE_API_TOKEN`: luo Cloudflaressa pohjasta "Edit Cloudflare
     Workers" ja lisää tarvittaessa oikeus "Workers R2 Storage → Edit"
   - `CLOUDFLARE_ACCOUNT_ID`: saat sen komennolla `npx wrangler whoami`
   - Tokenia ei liitetä mihinkään tiedostoon eikä keskusteluun.

## D. Design

10. Avaa **Claude Design** ja liitä sinne `design-brief.md` kokonaan.
    Suunnittele näkymät listan järjestyksessä, yksi kerrallaan.

## E. Seuraava askel

11. Aloita tässä projektissa uusi chat ja kirjoita:
    **"Tee STORY-001:n toteutussuunnitelma (PLAN-001)."**
    Hermes lukee CLAUDE.md:n ja backlog.json:n, ja suunnitelma noudattaa
    `plan.schema.json`ia.
