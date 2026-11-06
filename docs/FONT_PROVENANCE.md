# Font provenance

Fabric of Nations bundles two open-licence type families. The same files serve every
platform: `expo-font` loads them for the interface, and `scripts/map/build-atlas.mjs`
embeds the two label faces in the atlas page. No font is fetched at runtime.

| Family | Use | Copyright | Licence |
|---|---|---|---|
| Newsreader | Names and headlines | 2020 The Newsreader Project Authors | SIL Open Font License 1.1 |
| IBM Plex Sans Condensed | Labels, numbers, map names | 2017 IBM Corp., Reserved Font Name "Plex" | SIL Open Font License 1.1 |

Full licence texts are bundled beside the fonts in `packages/app/assets/fonts/`, as
`OFL-Newsreader.txt` and `OFL-IBMPlexSansCondensed.txt`. The files are unmodified, so the
Reserved Font Name clause does not apply. The application's Sources and licensing panel
names both families.

## Source

The TTF files were taken unchanged on 1 November 2026 from these npm packages, which
redistribute the Google Fonts builds. The packages' own code is not used and neither
package is a dependency of the project.

| Package | Version | Package licence |
|---|---|---|
| `@expo-google-fonts/newsreader` | 0.4.1 | MIT AND OFL-1.1 |
| `@expo-google-fonts/ibm-plex-sans-condensed` | 0.4.1 | MIT AND OFL-1.1 |

## Files

SHA-256 of each bundled file. All Latin and Latin Extended characters used by the
catalogue and province names are present; `ui-shell/design-tokens.test.ts` checks every
character of every map name against the font's own character map.

| File | SHA-256 |
|---|---|
| `IBMPlexSansCondensed_400Regular.ttf` | `b4473d48ef1372d308f75fd86cddaa318ba8202e28f64ae5576c2010bd221934` |
| `IBMPlexSansCondensed_500Medium.ttf` | `86b3969fdf4dd99eb0ec3f8c4dadd5c2aa259cdff78f87bb7d1f338a06556e49` |
| `IBMPlexSansCondensed_600SemiBold.ttf` | `e87f058254fcc38af9278cefb994f733a20ff550492af9a0a9291cdf4ba7a14a` |
| `IBMPlexSansCondensed_700Bold.ttf` | `230bde268ce6b193e1250f2a6508d11f57d9ead63da3b4e544ca1b429653f2b8` |
| `Newsreader_400Regular.ttf` | `da96d8de6be82192c7e6a6dea423167b573da3fae6e418fab3c86a0bafff523e` |
| `Newsreader_400Regular_Italic.ttf` | `4a71b6d9b241ed1bce613034a32384cd5bbc1baf30e518ce49c3e39a7cef26fe` |
| `Newsreader_500Medium.ttf` | `64dadba9c887b4c871dfdc7d3146ae1e288cc26940baeacf9a313a30fd06e2d9` |
| `Newsreader_600SemiBold.ttf` | `fa2454510bfab4a50433078653ab6672a73cb933990f7bdc9fd5b9d6cd766bed` |
