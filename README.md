# Nike Release Checker

## About:

Due to new Nike CORS policy [previous solution](https://github.com/whoisYeshua/Nike-RU-release-checker) has been deprecated, so I created the node version.

This script lets you know the stock of Nike SNKRS products that are going to released.

Script that accesses the Nike API to get product information from the upcoming feed and stores it at local DB. Then information outputs to the console, and can also be displayed if you paste correct product-URL.

Script supports more than 50 countries, you can find a [list of them below](#Countries).

## Requirements

-   `Node.js` - you can download it from [official site](http://nodejs.org/en/). It will be required to run the script. You can check the installed version by writing the command `node -v` in your terminal.
-   `npm` - it should be installed together with Node.js. Will be required to install the modules. You can check the installed version by writing the command `npm -v` in your terminal
-   `git` - not required, but it will allow you to download the repo in one command

## Installation

-   Download repo and open folder

```bash
git clone https://github.com/whoisYeshua/nike-release-checker.git
cd nike-release-checker
```

-   Install dependencies

```bash
npm install
```

## Available Commands

-   Run the script without product images _(there will only be a link to the image)_

```bash
npm start
```

-   Run the script with product images _(Note: High-resolution images are available in iTerm or in another terminal that has special image support. In Powershell, you will see minecraft images, but in any case, it`s still useful)_

```bash
npm run img
```

-   Reset your selected country

```bash
npm run reset
```

## UI preview:

![Imgur](https://imgur.com/wmBlf6n.png)

## Countries

| Country Code |       Country        | Language | Emoji |
| :----------: | :------------------: | :------: | :---: |
|      AU      |      Australia       |  en-GB   |  🇦🇺   |
|      CN      |        China         | zh-Hans  |  🇨🇳   |
|      IN      |        India         |  en-GB   |  🇮🇳   |
|      ID      |      Indonesia       |  en-GB   |  🇮🇩   |
|      JP      |        Japan         |    ja    |  🇯🇵   |
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

Argentina, Brazil, and a couple of other countries are not supported due to the fact that they have a different API.

## Access

```js
let url = new URL('https://api.nike.com/product_feed/threads/v2/')
url.searchParams.append('filter', `marketplace(${country})`)
url.searchParams.append('filter', `language(${language})`)
url.searchParams.append('filter', 'channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)')
url.searchParams.append('filter', 'upcoming(true)')
url.searchParams.append('filter', 'exclusiveAccess(true,false)')
```

`country` is 'Country Code' and `language` is 'Language' from the [table above](#Countries)
