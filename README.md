# Nike Release Checker

Interactive terminal app that shows upcoming Nike SNKRS releases with stock levels, prices, and launch details. Supports 50+ countries.

A standalone [SDK](#sdk) is also available for developers who want to build their own tools on top of the Nike product feed.

## UI Preview
![UI Preview](<./images/Desktop screenshot.png>)

## Features

- Browse upcoming SNKRS releases for your country
- See per-size stock levels: `HIGH` / `MEDIUM` / `LOW` / `OOS`
- View launch method (DAN/LEO), prices, and entry dates

## ⭐️ Installation

### Download binary (no Node.js required)

Grab the latest SEA (Single Executable Application) binary from [Releases](https://github.com/whoisYeshua/nike-release-checker/releases):

| Platform | File |
| :--- | :--- |
| macOS (Apple Silicon) | `nike-release-checker-macos-arm64.tar.gz` |
| Windows (x64) | `nike-release-checker-win-x64.exe` |

On macOS:

> **macOS Gatekeeper notice:** The binary is not notarized, so macOS will block it on first launch. To allow it, go to **System Settings > Privacy & Security**, scroll down, and click **Open Anyway**. See [Apple support article](https://support.apple.com/en-us/102445) for details.

### Run from source

Requires `Node.js` 24.11+ — download from [nodejs.org](https://nodejs.org/en/). You can check the installed version with `node -v`.

```bash
git clone https://github.com/whoisYeshua/nike-release-checker.git
cd nike-release-checker
npm install
npm start
```

## SDK

The `@nike-release-checker/sdk` package lets you fetch and format Nike SNKRS release data programmatically — useful if you want to build your own bots, dashboards, or notifications.

### Install

Grab the latest `.tgz` from [Releases](https://github.com/whoisYeshua/nike-release-checker/releases) and install it:

```bash
npm install https://github.com/whoisYeshua/nike-release-checker/releases/download/%40nike-release-checker%2Fsdk%400.3.0/nike-release-checker-sdk-0.3.0.tgz
```

### Usage

```js
import {
  getProductFeed,
  formatProductFeedResponse,
  availableCountries,
} from '@nike-release-checker/sdk'

// Pick a country
const country = availableCountries.find(c => c.code === 'US')

// Fetch upcoming releases
const products = await getProductFeed({
  countryCode: country.code,
  language: country.language,
})

// Format and display
const releases = formatProductFeedResponse(products)
for (const release of releases) {
  console.log(release.title, release.models.length, 'model(s)')
}
```

### API

| Export | Description |
| :--- | :--- |
| `getProductFeed(params)` | Fetches upcoming SNKRS releases. Takes `countryCode` and `language` (see [Countries](#countries)), returns raw product objects. |
| `formatProductFeedResponse(products)` | Formats raw product data into structured releases with titles, images, models, sizes, and stock levels. |
| `availableCountries` | Array of 50+ supported countries with `code`, `name`, `language`, and `emoji` fields. |

### Nike API

Under the hood, the SDK calls Nike's product feed endpoint:

```js
let url = new URL('https://api.nike.com/product_feed/threads/v3/')
url.searchParams.append('filter', `marketplace(${countryCode})`)
url.searchParams.append('filter', `language(${language})`)
url.searchParams.append('filter', 'channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)')
url.searchParams.append('filter', 'upcoming(true)')
url.searchParams.append('filter', 'exclusiveAccess(true,false)')
```

`countryCode` and `language` correspond to values from the [countries table](#countries).

## Countries

| Country Code |       Country        | Language | Emoji |
| :----------: | :------------------: | :------: | :---: |
|      AU      |      Australia       |  en-GB   |  🇦🇺   |
|      CN      |        China         | zh-Hans  |  🇨🇳   |
|      IN      |        India         |  en-GB   |  🇮🇳   |
|      ID      |      Indonesia       |  en-GB   |  🇮🇩   |
|      JP      |        Japan         |    ja    |  🇯🇵   |
|      KR      |        Korea         |    ko    |  🇰🇷   |
|      MY      |       Malaysia       |  en-GB   |  🇲🇾   |
|      NZ      |     New Zealand      |  en-GB   |  🇳🇿   |
|      PH      |     Philippines      |  en-GB   |  🇵🇭   |
|      SG      |      Singapore       |  en-GB   |  🇸🇬   |
|      TW      |        Taiwan        | zh-Hant  |  🇹🇼   |
|      TH      |       Thailand       |    th    |  🇹🇭   |
|      VN      |       Vietnam        |  en-GB   |  🇻🇳   |
|      EG      |        Egypt         |  en-GB   |  🇪🇬   |
|      MA      |       Morocco        |  en-GB   |  🇲🇦   |
|      ZA      |     South Africa     |  en-GB   |  🇿🇦   |
|      CA      |        Canada        |  en-GB   |  🇨🇦   |
|      CL      |        Chile         |  es-419  |  🇨🇱   |
|      MX      |        Mexico        |  es-419  |  🇲🇽   |
|      PR      |     Puerto Rico      |  es-419  |  🇵🇷   |
|      US      |    United States     |    en    |  🇺🇸   |
|      UY      |       Uruguay        |  es-419  |  🇺🇾   |
|      SA      |     Saudi Arabia     |  en-GB   |  🇸🇦   |
|      AE      | United Arab Emirates |  en-GB   |  🇦🇪   |
|      AT      |       Austria        |    de    |  🇦🇹   |
|      BE      |       Belgium        |    de    |  🇧🇪   |
|      BG      |       Bulgaria       |  en-GB   |  🇧🇬   |
|      HR      |       Croatia        |  en-GB   |  🇭🇷   |
|      CZ      |       Czechia        |    cs    |  🇨🇿   |
|      DK      |       Denmark        |    da    |  🇩🇰   |
|      FI      |       Finland        |  en-GB   |  🇫🇮   |
|      FR      |        France        |    fr    |  🇫🇷   |
|      DE      |       Germany        |    de    |  🇩🇪   |
|      GR      |        Greece        |    el    |  🇬🇷   |
|      HU      |       Hungary        |  en-GB   |  🇭🇺   |
|      IE      |       Ireland        |  en-GB   |  🇮🇪   |
|      IL      |        Israel        |  en-GB   |  🇮🇱   |
|      IT      |        Italy         |    it    |  🇮🇹   |
|      LU      |      Luxembourg      |  en-GB   |  🇱🇺   |
|      NL      |     Netherlands      |    nl    |  🇳🇱   |
|      NO      |        Norway        |    no    |  🇳🇴   |
|      PL      |        Poland        |    pl    |  🇵🇱   |
|      PT      |       Portugal       |  pt-PT   |  🇵🇹   |
|      RO      |       Romania        |  en-GB   |  🇷🇴   |
|      RU      |        Russia        |    ru    |  🇷🇺   |
|      SK      |       Slovakia       |  en-GB   |  🇸🇰   |
|      SI      |       Slovenia       |  en-GB   |  🇸🇮   |
|      ES      |        Spain         |  es-ES   |  🇪🇸   |
|      SE      |        Sweden        |    sv    |  🇸🇪   |
|      CH      |     Switzerland      |  en-GB   |  🇨🇭   |
|      TR      |        Turkey        |    tr    |  🇹🇷   |
|      GB      |    United Kingdom    |  en-GB   |  🇬🇧   |

Argentina, Brazil, and a couple of other countries are not supported due to a different API.
Chile is not supported currently. Egypt, Morocco, and Puerto Rico have no SNKRS feed. Russia is disabled. Vietnam redirects to Thailand for SNKRS data.

## License

ISC
