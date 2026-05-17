# mos-code-card

An interactive **Morse code chart web app** for portrait phones. Tap the big
button for a **dot**, hold it for a **dash**, and watch the chart light up the
path from the root down to the letter you're spelling. Pause for half a second
to commit the letter to the message at the top of the screen.

Inspired by the classic [Morse code decoder chart](https://www.nathanson.org/davesays/wp-content/uploads/2011/04/Morse-Code-decoder-chart-a-z-1024x791.png).

## How it works

- **Tap** = `·` (dot) — short beep
- **Hold** = `–` (dash) — constant tone while held
- **Pause 0.5s** = commit the current letter
- **Space** button = end the current word
- **Clear** button = wipe the message
- Keyboard: **Space** or **Enter** also acts as the key (tap / hold)

Examples:

| Input | Result |
| --- | --- |
| tap, tap, tap, pause | `S` |
| hold, hold, hold, pause | `O` |
| tap·tap·tap, pause, hold·hold·hold, pause, tap·tap·tap, pause | `SOS` |

## Run locally

It's a static site — no build step. Just open `index.html`, or:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Install on a phone (Add to Home Screen)

The app is a PWA with a manifest, service worker, and icons. After loading the
GitHub Pages URL on a phone:

- **iOS Safari**: Share → *Add to Home Screen*
- **Android Chrome**: ⋮ menu → *Install app* / *Add to Home Screen*

It then launches fullscreen like a native app and works offline.

## Hosting on GitHub Pages

The site is published via **GitHub Pages** using the workflow in
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). Every push to
`main` deploys the repository root to Pages.

To enable: in the repo, go to **Settings → Pages** and set *Build and
deployment → Source* to **GitHub Actions**. The live site will be available at
`https://<owner>.github.io/mos-code-card/`.
