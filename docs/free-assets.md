# Free art, icons and animation for future games

A short list of free, well-known packs that suit games for young children. Licenses were checked on 2026-10-09; recheck the license page before using a pack, and keep its license note in `libs/` or next to the art.

## How they fit these games

- Each game is one HTML file with no build step, so SVG art is pasted inline and PNG art is embedded or kept beside the game. Prefer SVG: it stays sharp on every screen and GSAP can animate its parts.
- Packs give one still picture per thing. Anything that grows, changes state, or is Ms. Menna is still drawn in code (see `multiplication-ms-menna.html`).
- Use one pack per game and match any code-drawn art to its style, so line weight and shading look like one set.
- Prefer CC0, MIT and Apache 2.0, which need no credit on screen. CC BY needs a credit line, for example on a grown-up info screen. Avoid CC BY-SA unless we are happy to share our changed art under the same license.

## Pictures and emoji

| Pack | Best for | Format | License | Credit needed |
|---|---|---|---|---|
| [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) | Soft, cute everyday things: food, animals, plants, toys, weather | SVG (Flat, Color), PNG (3D) | MIT | No, keep the license file |
| [Google Noto Emoji](https://github.com/googlefonts/noto-emoji) | Round, friendly emoji in Google's style | SVG, PNG | Apache 2.0 | No, keep the license file |
| [Google Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/) | Ready-made animated emoji for rewards and reactions (party, clap, star eyes) | Lottie JSON, WebP, GIF | CC BY 4.0 | Yes |
| [Twemoji](https://github.com/jdecked/twemoji) | Simple flat emoji, very readable when small | SVG, PNG | CC BY 4.0 | Yes |
| [OpenMoji](https://openmoji.org/) | Outlined emoji, about 4,000 | SVG, PNG | CC BY-SA 4.0 | Yes, and changes must be shared alike |

## Game pieces

| Pack | Best for | Format | License | Credit needed |
|---|---|---|---|---|
| [Kenney](https://kenney.nl/assets) | Thousands of 2D game pieces: animals, food, vehicles, tiles, buttons, cards, plus sound packs | PNG, some SVG, OGG/WAV | CC0 | No |
| [Quaternius](https://quaternius.com/) | Low-poly 3D animals, plants and vehicles, some animated | glTF, FBX | CC0 | No |
| [game-icons.net](https://game-icons.net/) | One-color icons for items, tools and powers | SVG | CC BY 3.0 | Yes |
| [Open Peeps](https://www.openpeeps.com/) | Mix-and-match hand-drawn people | SVG, PNG | CC0 | No |

## Interface icons

| Pack | Best for | License |
|---|---|---|
| [Google Material Symbols](https://fonts.google.com/icons) | Buttons and settings (sound, home, back, gear) in many weights | Apache 2.0 |
| [Lucide](https://lucide.dev/) | Clean line icons for buttons | ISC |
| [Phosphor](https://phosphoricons.com/) | Line, fill and duotone icons, including rounded "fill" styles that suit children | MIT |

These are made for app interfaces, not for game art. Use them for grown-up and settings buttons, not for characters or rewards.

## Animation players

| Player | What it plays | License | Notes |
|---|---|---|---|
| [lottie-web](https://github.com/airbnb/lottie-web) | Lottie JSON, such as Noto Animated Emoji | MIT | About 240 KB minified. Plays fixed animations; it can't react to the game beyond play, pause and jump to a frame. Not vendored yet |
| [Rive](https://rive.app/docs/runtimes/getting-started) | Characters rigged in the Rive editor, with states like idle, happy and sleepy | MIT (player) | Uses WebAssembly, so test on the iPad. Best for a character-led game. Not vendored yet |

GSAP and its free plugins are already in `libs/` and cover most motion for SVG art.

## Where each kind of thing should come from

| Thing | Source |
|---|---|
| Food, animals, toys, weather, vehicles that never change | Fluent Emoji or Kenney |
| A quick celebration or reaction | Noto Animated Emoji with lottie-web, or a Fluent picture animated with GSAP |
| Buttons and settings | Material Symbols or Phosphor |
| Anything that grows or changes state, such as plants, cakes or buildings | Drawn in code, in the style of the pack the game uses |
| A main character with many moods and outfits | Drawn in code with GSAP, or Rive for a new character-led game |

## Before shipping art from a pack

- Check every picture at full size and at the smallest size on a 320px phone.
- Keep the pack's license file next to the art and add any required credit.
- Keep things cute and generic: nothing scary, and no close copies of real characters.
