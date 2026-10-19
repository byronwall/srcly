# Changelog

## [1.1.0](https://github.com/byronwall/srcly/compare/v1.0.0...v1.1.0) (2026-10-19)


### Features

* **graph:** isolate a symbol inside a focused file ([#81](https://github.com/byronwall/srcly/issues/81)) ([0e2bedd](https://github.com/byronwall/srcly/commit/0e2bedd89e8ecb724c9280f7adaf813dde2859ac))
* **graph:** keep box text readable when zoomed out ([#82](https://github.com/byronwall/srcly/issues/82)) ([6868ecc](https://github.com/byronwall/srcly/commit/6868ecca81be92156e70fb811fb9ed281b59d3fd))

## [1.0.0](https://github.com/byronwall/srcly/compare/v0.3.0...v1.0.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **metrics:** cut misleading metrics, add comment noise and component metrics ([#74](https://github.com/byronwall/srcly/issues/74))

### Features

* **activity:** show Git change frequency and churn per file ([#76](https://github.com/byronwall/srcly/issues/76)) ([7b4fcf7](https://github.com/byronwall/srcly/commit/7b4fcf70275a3d92e63dc398f9d7812a1bfbb40a))
* **deps:** taller info boxes, hub badges, softer tint, fewer crossings ([#64](https://github.com/byronwall/srcly/issues/64)) ([15c5a80](https://github.com/byronwall/srcly/commit/15c5a80c24e94725a82e0599523520b03340f2c2))
* **explorer:** denser, collapsible sidebar with an always-on color column ([#62](https://github.com/byronwall/srcly/issues/62)) ([c05da24](https://github.com/byronwall/srcly/commit/c05da247c842788ffdb5d41b4ac753760edc1714))
* **explorer:** link sidebar and treemap hover ([#65](https://github.com/byronwall/srcly/issues/65)) ([6b9d023](https://github.com/byronwall/srcly/commit/6b9d02342e9d2b534e0e61619d0f9038228f4790))
* **findings:** run lint and type checks with zero config ([#78](https://github.com/byronwall/srcly/issues/78)) ([fa0aca5](https://github.com/byronwall/srcly/commit/fa0aca5b615ae3995bacfbd5cd9493af082e8c02))
* **metrics:** cut misleading metrics, add comment noise and component metrics ([#74](https://github.com/byronwall/srcly/issues/74)) ([4e03d4a](https://github.com/byronwall/srcly/commit/4e03d4a4ba5bd12a144c09f7c56c95d265c47260))
* **metrics:** serve one metric catalog and a single-metric hot-spot list ([#75](https://github.com/byronwall/srcly/issues/75)) ([a6b24ea](https://github.com/byronwall/srcly/commit/a6b24eadf2bac9281ca1e6e35e4123311af69b0a))
* **metrics:** tune defaults from a four-repo pilot ([#79](https://github.com/byronwall/srcly/issues/79)) ([128903f](https://github.com/byronwall/srcly/commit/128903fdf57e60854bcc15e19780a1f3f6f1b28d))
* **scatter:** add named 2x2 metric presets ([#77](https://github.com/byronwall/srcly/issues/77)) ([95d7466](https://github.com/byronwall/srcly/commit/95d746697e42b9d49d52b5fc8bbc22db5f357a37))
* **treemap:** denser, richer hover cards ([#63](https://github.com/byronwall/srcly/issues/63)) ([3da6da6](https://github.com/byronwall/srcly/commit/3da6da6f8b920d3210ab5f8fbd62c60843a8154a))
* **viewer:** mark the lines behind each metric in the code viewer ([#70](https://github.com/byronwall/srcly/issues/70)) ([530f0d4](https://github.com/byronwall/srcly/commit/530f0d47afad876d76ce52bce1a194e41fc997bd))


### Bug Fixes

* **compare:** wait for a pick before running ([#72](https://github.com/byronwall/srcly/issues/72)) ([498fba1](https://github.com/byronwall/srcly/commit/498fba1dd2f6284df8edcd2ff4a339157eeea2fd))
* **metrics:** separate zero from N/A and name max-complexity witnesses ([#73](https://github.com/byronwall/srcly/issues/73)) ([fe8efc9](https://github.com/byronwall/srcly/commit/fe8efc94e40a1a06454c4c91e837edb82490a561))
* **scan:** count else-if chains as one nesting level ([#71](https://github.com/byronwall/srcly/issues/71)) ([939638e](https://github.com/byronwall/srcly/commit/939638eed585d9b0ee89bcff50be0b8c6155e593))
* **treemap:** color LOC and size by scales that fit their range ([#66](https://github.com/byronwall/srcly/issues/66)) ([a4ceb1d](https://github.com/byronwall/srcly/commit/a4ceb1d67911c4c52a5eb12bb15356e583b2759c))


### Documentation

* plan metric system overhaul as stacked PRs ([#69](https://github.com/byronwall/srcly/issues/69)) ([0253f73](https://github.com/byronwall/srcly/commit/0253f735f7a5aaf0eaec57cd490afcd64fdb9df5))
* review metric quality and plan complementary evidence ([#42](https://github.com/byronwall/srcly/issues/42)) ([2de0501](https://github.com/byronwall/srcly/commit/2de0501511c191204d6328b885032fdb1a984902))

## [0.3.0](https://github.com/byronwall/srcly/compare/v0.2.0...v0.3.0) (2026-10-15)


### Features

* **code-viewer:** one metrics table with only the metrics that apply ([#57](https://github.com/byronwall/srcly/issues/57)) ([26b66cb](https://github.com/byronwall/srcly/commit/26b66cbc2659a86b4a654d5d3467ee7faf35baaa))
* **compare:** compare another worktree's files on disk as the head ([#54](https://github.com/byronwall/srcly/issues/54)) ([f7a4d39](https://github.com/byronwall/srcly/commit/f7a4d39174339424b53221c979937f13af9662a0))
* **compare:** picker over open PRs, worktrees and branches ([#52](https://github.com/byronwall/srcly/issues/52)) ([54f596a](https://github.com/byronwall/srcly/commit/54f596a2edbab2b2d9b9ff52a1b26a6a554de510))
* **compare:** resolve pr:&lt;n&gt; refs through a gh seam, with phase timings ([#47](https://github.com/byronwall/srcly/issues/47)) ([4de9f89](https://github.com/byronwall/srcly/commit/4de9f896b334c28ab29d02efebe6dc4cf936f6a2))
* **compare:** step through a PR commit by commit ([#59](https://github.com/byronwall/srcly/issues/59)) ([30a412c](https://github.com/byronwall/srcly/commit/30a412c3b24d370fd93aa018cc88bb83bd8047f9))
* **deps:** drop graph side headers and add a legend ([#48](https://github.com/byronwall/srcly/issues/48)) ([9e5c3c1](https://github.com/byronwall/srcly/commit/9e5c3c11389e5539292ebda47adfc6caea34ea30))
* **deps:** group neighbors by package, then file, in labeled frames ([#58](https://github.com/byronwall/srcly/issues/58)) ([2eccad7](https://github.com/byronwall/srcly/commit/2eccad76b02ff452a1cfd78258d5d68ca189496d))
* **deps:** pack mid-level dependency views to the viewport's shape ([#50](https://github.com/byronwall/srcly/issues/50)) ([9c6f368](https://github.com/byronwall/srcly/commit/9c6f368be0aea2088be67a4847c22727ea3440ad))
* **deps:** spread edge bundles by their edge count ([#61](https://github.com/byronwall/srcly/issues/61)) ([eaf30a2](https://github.com/byronwall/srcly/commit/eaf30a227bc561bb7507ddb0d2c8bfcca6cfd2b0))
* **deps:** tint dependency boxes with the treemap's color and show LOC ([#60](https://github.com/byronwall/srcly/issues/60)) ([07ba975](https://github.com/byronwall/srcly/commit/07ba975632bee5843e2628ec2269d85ef5a3418b))
* **deps:** two-line boxes with visibly different, size-aware folders ([#56](https://github.com/byronwall/srcly/issues/56)) ([f1d8cea](https://github.com/byronwall/srcly/commit/f1d8cea22013aa638d4b638558908cf56898cb50))
* **nav:** one location for treemap zoom and graph focus, with real Back ([#45](https://github.com/byronwall/srcly/issues/45)) ([af2a0be](https://github.com/byronwall/srcly/commit/af2a0be92e94c6a03adf811c5725e6de4590dbd2))
* **nav:** one Treemap | Graph switch and visible node actions ([#55](https://github.com/byronwall/srcly/issues/55)) ([0e0381c](https://github.com/byronwall/srcly/commit/0e0381cf5f418f1f5278af3946f4d0480c3a769e))
* **nav:** refresh and compare keep the repo; History dropdown ([#49](https://github.com/byronwall/srcly/issues/49)) ([d2b65c9](https://github.com/byronwall/srcly/commit/d2b65c906c0d0df88e63d6b277f68f316adb0b68))
* **treemap:** dark mono labels, a stronger color ramp, tighter tiles and a richer tooltip ([#51](https://github.com/byronwall/srcly/issues/51)) ([34868e4](https://github.com/byronwall/srcly/commit/34868e4c0e02df8c3882daf0f9eb3c9fd2ac1592))


### Bug Fixes

* **deps:** open graph symbols in the app's code viewer and clear stale hover ([#46](https://github.com/byronwall/srcly/issues/46)) ([6e7f82b](https://github.com/byronwall/srcly/commit/6e7f82bf654c21e0dcbd8546f48dbe6ac9ef6044))
* **ui:** one popover open at a time, placed before paint, with origin-aware motion ([#53](https://github.com/byronwall/srcly/issues/53)) ([385243c](https://github.com/byronwall/srcly/commit/385243c419b608c2ad6de70e71e6f403149f6d7f))


### Documentation

* **intent:** shape and plan four follow-up initiatives from 2026-10-15 voiceover ([#43](https://github.com/byronwall/srcly/issues/43)) ([1042dd2](https://github.com/byronwall/srcly/commit/1042dd2ce99086fdfc2f646ec48ef08d7831a3db))

## [0.2.0](https://github.com/byronwall/srcly/compare/v0.1.34...v0.2.0) (2026-10-15)


### Features

* **client:** keep loading state until the treemap paints; add Rescan ([#25](https://github.com/byronwall/srcly/issues/25)) ([67fbee5](https://github.com/byronwall/srcly/commit/67fbee5c91aa103b667638a0679202618ee35f62))
* **compare:** before/after dependency graphs on one shared layout ([#41](https://github.com/byronwall/srcly/issues/41)) ([1bfd977](https://github.com/byronwall/srcly/commit/1bfd977b433a0e4a744907be298274b137ab1c27))
* **compare:** compare mode UI with focused changed-files table ([#39](https://github.com/byronwall/srcly/issues/39)) ([efdf22c](https://github.com/byronwall/srcly/commit/efdf22c22f86d12ad7318da374a8c031bfe1a8a5))
* **compare:** side-by-side treemaps on one shared layout ([#40](https://github.com/byronwall/srcly/issues/40)) ([9051baf](https://github.com/byronwall/srcly/commit/9051baf0ab340d2486a6d81952ccda202c7a0793))
* **compare:** srcly compare CLI with commit snapshots and metric deltas ([#38](https://github.com/byronwall/srcly/issues/38)) ([b52b359](https://github.com/byronwall/srcly/commit/b52b35987623d5e6ef55b2bc0d4026504aa8e7e2))
* **deps:** language-neutral dependency graph endpoint with full TS resolution ([#16](https://github.com/byronwall/srcly/issues/16)) ([aa3ed35](https://github.com/byronwall/srcly/commit/aa3ed35e7f92f63f3cc054dba58b2f864f1b27b6))
* **deps:** multi-scale dependency view with custom grid layout ([#14](https://github.com/byronwall/srcly/issues/14)) ([6687816](https://github.com/byronwall/srcly/commit/66878164d4aa7a7ede3fa531ef0db05e53bfb5db))
* **deps:** Python dependency graph ([#18](https://github.com/byronwall/srcly/issues/18)) ([7cb67eb](https://github.com/byronwall/srcly/commit/7cb67eb40b5d5f0f5798514757588aaf30c894d6))
* **deps:** symbol-level focus with function-level usage ([#21](https://github.com/byronwall/srcly/issues/21)) ([88a48f1](https://github.com/byronwall/srcly/commit/88a48f17246bef7858f63beed455e0f8051a3279))
* **server:** cache analyses in the user cache dir until files change ([#24](https://github.com/byronwall/srcly/issues/24)) ([f9cc6bd](https://github.com/byronwall/srcly/commit/f9cc6bd4496032f6da5080d98f25dee674968494))


### Bug Fixes

* **cache:** fingerprint the files discovery lists, not the whole tree ([#34](https://github.com/byronwall/srcly/issues/34)) ([27b66cd](https://github.com/byronwall/srcly/commit/27b66cdd24c83de2df3c2b4576eaf099b9ff9de5))
* **metrics:** make file complexity the max CCN, like folders ([#20](https://github.com/byronwall/srcly/issues/20)) ([de05d36](https://github.com/byronwall/srcly/commit/de05d36124ff5efe3f2139588555f1b128cb4294))
* **metrics:** stop counting the (imports) scope as a function ([#35](https://github.com/byronwall/srcly/issues/35)) ([83dcbf4](https://github.com/byronwall/srcly/commit/83dcbf40879ca06ab07cdfcf365b5c0ccb7608a4))
* pin tree-sitter below 0.26 to stop analysis crashes ([#12](https://github.com/byronwall/srcly/issues/12)) ([bbcbc39](https://github.com/byronwall/srcly/commit/bbcbc39ddfdac783d8e47e437d656f0d9bd1921a))
* **scan:** build the tree in path order so repeat scans match ([#32](https://github.com/byronwall/srcly/issues/32)) ([b72c1a6](https://github.com/byronwall/srcly/commit/b72c1a6ffb7ad2fd21540e6487a15260a3617a27))
* **scan:** bump lizard to stop the Go tokenizer hang ([#17](https://github.com/byronwall/srcly/issues/17)) ([972a995](https://github.com/byronwall/srcly/commit/972a9959b24a9a065d415bb24cc3c60dc154bd66))
* **scan:** cap analyzed file size and line-count files lizard can't parse ([#33](https://github.com/byronwall/srcly/issues/33)) ([af30a51](https://github.com/byronwall/srcly/commit/af30a51f4fdbe8ce1d659eb43a03d2f458e89755))
* **scan:** discover files with git and skip binaries and bundles ([#19](https://github.com/byronwall/srcly/issues/19)) ([eb6dfa7](https://github.com/byronwall/srcly/commit/eb6dfa7c1451f0b5da4ccc9fe1b125a98b2159c0))
* **scan:** keep lizard's sys.path entry out of spawned workers ([#29](https://github.com/byronwall/srcly/issues/29)) ([11d098c](https://github.com/byronwall/srcly/commit/11d098c86ecd9a6cab595cf7db3a5742bef92ca3))
* **scan:** keep timed-out and failed files in the tree ([#15](https://github.com/byronwall/srcly/issues/15)) ([f18c621](https://github.com/byronwall/srcly/commit/f18c62158d2224c391ab8a70c446e3560342d6b8))
* **server:** share scans across endpoints and encode results off the event loop ([#23](https://github.com/byronwall/srcly/issues/23)) ([f068019](https://github.com/byronwall/srcly/commit/f068019aa941fa9d7c3387e47b04e6f185991f4b))


### Documentation

* **compare:** intent, shape, and plan for PR compare mode ([#37](https://github.com/byronwall/srcly/issues/37)) ([1bd29cb](https://github.com/byronwall/srcly/commit/1bd29cb0cba76f616325d7db586acd2d2343a8a8))

## [0.1.34](https://github.com/byronwall/srcly/compare/v0.1.33...v0.1.34) (2026-10-05)


### Bug Fixes

* restore canvas treemap zoom animations ([a6e209d](https://github.com/byronwall/srcly/commit/a6e209d9039ffa31e3416bd6157d5bc71a2bedb4))
