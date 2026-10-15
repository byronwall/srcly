# Changelog

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
