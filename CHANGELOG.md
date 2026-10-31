# Changelog

## [1.8.1](https://github.com/byronwall/srcly/compare/v1.8.0...v1.8.1) (2026-10-31)


### Bug Fixes

* **graph:** cancel camera work when a trace view unmounts ([#313](https://github.com/byronwall/srcly/issues/313)) ([f47736b](https://github.com/byronwall/srcly/commit/f47736bf0f548e3dbf4ba33cf7416a8fce38ae31))


### Performance Improvements

* **dataflow:** collect evidence on demand and defer classification ([#312](https://github.com/byronwall/srcly/issues/312)) ([4605a47](https://github.com/byronwall/srcly/commit/4605a47d5304de2cb0926e48d8ffb49d627b4a26))
* **dataflow:** remove repeated work from anchor traces ([#309](https://github.com/byronwall/srcly/issues/309)) ([e07cc51](https://github.com/byronwall/srcly/commit/e07cc510087b5c028273cad785b97ee36c6c3b35))

## [1.8.0](https://github.com/byronwall/srcly/compare/v1.7.0...v1.8.0) (2026-10-30)


### Features

* **dataflow:** trace a value through a zustand store ([#304](https://github.com/byronwall/srcly/issues/304)) ([cde9417](https://github.com/byronwall/srcly/commit/cde9417364480d5e3478dd4ae885d40db5b51d6e))


### Bug Fixes

* **dataflow:** bind a prop to its read through mergeProps and splitProps ([#296](https://github.com/byronwall/srcly/issues/296)) ([a19f19a](https://github.com/byronwall/srcly/commit/a19f19af46d391f4b4d5533ac7c29d500f2ea095))
* **dataflow:** carry a compound field write, and drop a page handler's return ([#301](https://github.com/byronwall/srcly/issues/301)) ([70e5ea1](https://github.com/byronwall/srcly/commit/70e5ea11f8ad16f9ad4e2cd6c087b7e9e55e0914))
* **dataflow:** carry a state updater's return into the state ([#285](https://github.com/byronwall/srcly/issues/285)) ([135615d](https://github.com/byronwall/srcly/commit/135615db098ffe5b8ec02d9acd660fb3098d3459))
* **dataflow:** choose the survey's TypeScript as the server does ([#293](https://github.com/byronwall/srcly/issues/293)) ([018748b](https://github.com/byronwall/srcly/commit/018748bd0086484660b6ba5256ff381b88b4ab10))
* **dataflow:** end a binding that only decides branches at the binding ([#305](https://github.com/byronwall/srcly/issues/305)) ([317dd46](https://github.com/byronwall/srcly/commit/317dd464bc840a87c22296b5758a2a50d7c166cf))
* **dataflow:** end a callback call at the module's API, and start a library-filled parameter ([#299](https://github.com/byronwall/srcly/issues/299)) ([b479466](https://github.com/byronwall/srcly/commit/b479466f6e24c6f755e95061e29ccc6d84805ef6))
* **dataflow:** end a computed object key in place, and model createSelector ([#298](https://github.com/byronwall/srcly/issues/298)) ([d7f09db](https://github.com/byronwall/srcly/commit/d7f09dbfe24e537f044056e6a1df46d63b608202))
* **dataflow:** end a value at a library function called under a local name ([#286](https://github.com/byronwall/srcly/issues/286)) ([52973a7](https://github.com/byronwall/srcly/commit/52973a781236ca49f13f57ff38b61fb3bc3bd02f))
* **dataflow:** end a value at any DOM call made for its effect ([#284](https://github.com/byronwall/srcly/issues/284)) ([dd20a02](https://github.com/byronwall/srcly/commit/dd20a02f70f2bf8c3fb85ad44fb53d2707daf2de))
* **dataflow:** end a value nothing reads at its binding, never read ([#295](https://github.com/byronwall/srcly/issues/295)) ([fa166b1](https://github.com/byronwall/srcly/commit/fa166b18e857a3be8b579537eefd14c01937255f))
* **dataflow:** end an unread exported value at its export ([#282](https://github.com/byronwall/srcly/issues/282)) ([ffbc58b](https://github.com/byronwall/srcly/commit/ffbc58b84862551ed72d36e5739a8d306e4411a5))
* **dataflow:** hand a value back through a callback the library supplied ([#300](https://github.com/byronwall/srcly/issues/300)) ([81b4f96](https://github.com/byronwall/srcly/commit/81b4f9681a04da6fdafcd1551e0cb8b639b586e4))
* **dataflow:** judge a returned call by its own function's call sites ([#287](https://github.com/byronwall/srcly/issues/287)) ([95f82ba](https://github.com/byronwall/srcly/commit/95f82baf58fe0672a7fc0c8c7699876d65bb7ccf))
* **dataflow:** keep a dropped write in a module cache its file reads back ([#297](https://github.com/byronwall/srcly/issues/297)) ([c929c5e](https://github.com/byronwall/srcly/commit/c929c5e68e4a3559f33b6ba6bada546609f5f70c))
* **dataflow:** land a backward trace at an empty {} or [] ([#288](https://github.com/byronwall/srcly/issues/288)) ([2554a2c](https://github.com/byronwall/srcly/commit/2554a2c59075a59199da7333a3b1ca5d966a8bd6))
* **dataflow:** restore the thrown-value end that [#212](https://github.com/byronwall/srcly/issues/212) reverted ([#281](https://github.com/byronwall/srcly/issues/281)) ([af17db9](https://github.com/byronwall/srcly/commit/af17db9bacfa877f916c4a887d70e9d19fdfd7f6))
* **dataflow:** run a function read straight from a context ([#302](https://github.com/byronwall/srcly/issues/302)) ([5dafa03](https://github.com/byronwall/srcly/commit/5dafa03fe7493c48c4d4e14f80ac8e566b1ae8a9))
* **dataflow:** stop counting a fetch's response body as a stop ([#283](https://github.com/byronwall/srcly/issues/283)) ([8e00cf6](https://github.com/byronwall/srcly/commit/8e00cf678e481f60c725640fe17d33b9df7d252c))
* **dataflow:** stop naming a callback prop's call a database write ([#294](https://github.com/byronwall/srcly/issues/294)) ([39e3489](https://github.com/byronwall/srcly/commit/39e34897c39cf612f70328ab0746fe3e60175c99))
* **dataflow:** widen the anchor graph's limits, and narrow them before refusing a graph ([#292](https://github.com/byronwall/srcly/issues/292)) ([b614a4f](https://github.com/byronwall/srcly/commit/b614a4fb8630b523f33394d1afd34a76e091c4c5))


### Documentation

* **dataflow:** measure everyday-pattern coverage with a pattern catalog ([#289](https://github.com/byronwall/srcly/issues/289)) ([e6ac784](https://github.com/byronwall/srcly/commit/e6ac78409878fa012538f90bb2a12258cc17cfb5))
* **dataflow:** record round 2 of the pattern-coverage work ([#306](https://github.com/byronwall/srcly/issues/306)) ([6b8f1f7](https://github.com/byronwall/srcly/commit/6b8f1f7ddf3080c7544433f1c169c6e3e0147b00))

## [1.7.0](https://github.com/byronwall/srcly/compare/v1.6.0...v1.7.0) (2026-10-29)


### Features

* **cli:** print a startup banner with version and runtime details ([#261](https://github.com/byronwall/srcly/issues/261)) ([ae325f9](https://github.com/byronwall/srcly/commit/ae325f936a8a1f7de7f4d2191651212e8145e6c5))
* **dataflow:** a discarded library call writes into a closure's, a parameter's or an element's receiver ([#262](https://github.com/byronwall/srcly/issues/262)) ([37975c5](https://github.com/byronwall/srcly/commit/37975c5d99fefac91766e55208b6ce4dcde186d4))
* **dataflow:** a receiver write lands in its field, and a void callback's push is a write ([#271](https://github.com/byronwall/srcly/issues/271)) ([ca8866e](https://github.com/byronwall/srcly/commit/ca8866e9bcaca2f5dc98a99028a4d7f0068fdb08))
* **dataflow:** a useReducer dispatch runs its reducer ([#264](https://github.com/byronwall/srcly/issues/264)) ([0a7fa67](https://github.com/byronwall/srcly/commit/0a7fa679971de5366c5ad83f60afdfb99075db95))
* **dataflow:** draw one box per symbol in an anchor trace ([#268](https://github.com/byronwall/srcly/issues/268)) ([f0e1f9f](https://github.com/byronwall/srcly/commit/f0e1f9f8cd09db4397f33da3253c93ecfa7c4faf))
* **dataflow:** emitters, timers, delegating generators and fetch reads ([#275](https://github.com/byronwall/srcly/issues/275)) ([0692ca2](https://github.com/byronwall/srcly/commit/0692ca254b135ba128bab831b37c812143c6661a))
* **dataflow:** enter constructors, getters and generators ([#266](https://github.com/byronwall/srcly/issues/266)) ([24e2c67](https://github.com/byronwall/srcly/commit/24e2c678b20ae402638335c3548f01bafa5ac3a3))
* **dataflow:** enter the function a caller hands in through a parameter or prop ([#260](https://github.com/byronwall/srcly/issues/260)) ([562d834](https://github.com/byronwall/srcly/commit/562d834e9090ed8dc821934d50972a4e8ade9d17))
* **dataflow:** fold a route's data trace by component and group route gaps ([#273](https://github.com/byronwall/srcly/issues/273)) ([fdf1414](https://github.com/byronwall/srcly/commit/fdf14143d47b6f479f0100edfcee25a76ee6eb80))
* **dataflow:** link each function to what it calls, reads and writes ([#279](https://github.com/byronwall/srcly/issues/279)) ([fbe36c0](https://github.com/byronwall/srcly/commit/fbe36c07d39d32767d0acfeaf124e6519f903d84))
* **dataflow:** name each function's role in a data-flow trace ([#274](https://github.com/byronwall/srcly/issues/274)) ([1fdabd3](https://github.com/byronwall/srcly/commit/1fdabd300f0c07212d41801d8130bd1499a89aa3))
* **dataflow:** name traces that land through an assumed library step `assumed` ([#210](https://github.com/byronwall/srcly/issues/210)) ([9cb0931](https://github.com/byronwall/srcly/commit/9cb0931490dfddbef2b2d2102b24d4720c08821e))
* **dataflow:** name what happens along an edge and draw state as state ([#272](https://github.com/byronwall/srcly/issues/272)) ([15b2c8e](https://github.com/byronwall/srcly/commit/15b2c8e7bf5bd3626acd2d6440621bc66b6e7c24))
* **dataflow:** open a symbol view on its main path and grow it by depth ([#278](https://github.com/byronwall/srcly/issues/278)) ([ac1047a](https://github.com/byronwall/srcly/commit/ac1047ac78fd6d7730e74e7a556cdc1f70aa8da3))
* **dataflow:** read TypeScript origins and terminals from library model rows ([#211](https://github.com/byronwall/srcly/issues/211)) ([75226dd](https://github.com/byronwall/srcly/commit/75226dd60a5d1afe2354cb315a46ef1b88442e29))
* **dataflow:** setters and context methods as handlers, paired both ways ([#270](https://github.com/byronwall/srcly/issues/270)) ([29bb55c](https://github.com/byronwall/srcly/commit/29bb55c31574571c22070111a160241ca1bb58c8))


### Bug Fixes

* **dataflow:** a namespace import's read reaches the export it names ([#263](https://github.com/byronwall/srcly/issues/263)) ([0181b45](https://github.com/byronwall/srcly/commit/0181b4568f61462eedb0c07302f897f49c41ef98))
* **dataflow:** a Show or Match when decides a branch, not a DOM attribute ([#257](https://github.com/byronwall/srcly/issues/257)) ([054e0b2](https://github.com/byronwall/srcly/commit/054e0b21532303861ed55aab09dc0b537bfda456))
* **dataflow:** an action's return reaches its call sites, not its useAction ([#258](https://github.com/byronwall/srcly/issues/258)) ([432a0ca](https://github.com/byronwall/srcly/commit/432a0ca6ade3fc992942c068b0ce30139e2516ca))
* **dataflow:** prove nothing from a call's being imported ([#213](https://github.com/byronwall/srcly/issues/213)) ([5529a4c](https://github.com/byronwall/srcly/commit/5529a4c116d7913ed1b5f1a62cdce6ca9305585d))


### Documentation

* **dataflow:** plan showing logic, not only components, in TS/TSX data flow ([#265](https://github.com/byronwall/srcly/issues/265)) ([c52e995](https://github.com/byronwall/srcly/commit/c52e995040802ab1a039a81dbf2d4e345d33daac))

## [1.6.0](https://github.com/byronwall/srcly/compare/v1.5.0...v1.6.0) (2026-10-28)


### Features

* **dataflow:** file and folder anchors for Python ([#231](https://github.com/byronwall/srcly/issues/231)) ([da2d8e8](https://github.com/byronwall/srcly/commit/da2d8e83fa6af53e154705da35933b083b7ed8c8))
* **dataflow:** fold a large trace into one box per function ([#224](https://github.com/byronwall/srcly/issues/224)) ([edaa1ec](https://github.com/byronwall/srcly/commit/edaa1ec7f28a629f2ed4b6c35bed16e0019003b7))
* **dataflow:** one direction control in anchor mode ([#228](https://github.com/byronwall/srcly/issues/228)) ([91bb444](https://github.com/byronwall/srcly/commit/91bb444e1674e7da5499201858157e4cc63e8802))
* **dataflow:** open a page route on its data, with its render tree one click away ([#252](https://github.com/byronwall/srcly/issues/252)) ([f370d05](https://github.com/byronwall/srcly/commit/f370d057202985bc0ec0c34cda60f2ab37ba83fd))
* **dataflow:** point a TypeScript root to the Python apps inside it ([#218](https://github.com/byronwall/srcly/issues/218)) ([e18f0fe](https://github.com/byronwall/srcly/commit/e18f0fe09a694c7278c31c81c9c929a659c35ab1))
* **dataflow:** trace from a selected box in one click ([#225](https://github.com/byronwall/srcly/issues/225)) ([eb831cb](https://github.com/byronwall/srcly/commit/eb831cb8699bd999567fafa981a4e02cc56d1cb9))
* **dataflow:** trace values into Celery tasks ([#233](https://github.com/byronwall/srcly/issues/233)) ([b47efb8](https://github.com/byronwall/srcly/commit/b47efb89d248978765c5da045e161ee09be6fff9))


### Bug Fixes

* **dataflow:** a Python trace through unmodelled library code is not ok ([#223](https://github.com/byronwall/srcly/issues/223)) ([079fc86](https://github.com/byronwall/srcly/commit/079fc865772ba01ba99bb786ca19157cf3442cf6))
* **dataflow:** bind a JSX spread to the component's props, and see through memo ([#240](https://github.com/byronwall/srcly/issues/240)) ([0ae3bfc](https://github.com/byronwall/srcly/commit/0ae3bfc565f9655b265be82a5e09d6570df47933))
* **dataflow:** bind Match and any when to its callback child ([#236](https://github.com/byronwall/srcly/issues/236)) ([6eef49e](https://github.com/byronwall/srcly/commit/6eef49e29afc12747f8fb439ae430d39f1be716c))
* **dataflow:** bind wrapped and dynamic components, and data hooks' options ([#250](https://github.com/byronwall/srcly/issues/250)) ([6d4b18d](https://github.com/byronwall/srcly/commit/6d4b18de3d17be56ef37d444a20ad2c7ed8b7b8a))
* **dataflow:** call through query, action, useAction and other function wrappers ([#239](https://github.com/byronwall/srcly/issues/239)) ([ab4da02](https://github.com/byronwall/srcly/commit/ab4da02022f02f874b53a48d7a4141f1b7c61bd9))
* **dataflow:** carry a value kept in a member to wherever the member is read ([#247](https://github.com/byronwall/srcly/issues/247)) ([a7c719b](https://github.com/byronwall/srcly/commit/a7c719b52182e5e6652ce0a65067a13a912b1284))
* **dataflow:** carry a value out of a closure through the closure's own calls ([#249](https://github.com/byronwall/srcly/issues/249)) ([4ea93cd](https://github.com/byronwall/srcly/commit/4ea93cd10d761bd760ef2c22cf7031f2e14d8e06))
* **dataflow:** carry a value through a field assignment to the field's reads ([#244](https://github.com/byronwall/srcly/issues/244)) ([fc26126](https://github.com/byronwall/srcly/commit/fc2612669ee9e1a1e91372d0c01ade57e3a92e72))
* **dataflow:** carry an awaited call's value through the await ([#237](https://github.com/byronwall/srcly/issues/237)) ([7fcaa78](https://github.com/byronwall/srcly/commit/7fcaa78897e4a0797fadebeccccca3024c1f44f7))
* **dataflow:** end a Python trace at a SQLAlchemy session write ([#222](https://github.com/byronwall/srcly/issues/222)) ([7ff22b3](https://github.com/byronwall/srcly/commit/7ff22b390646fbe79eb1a3e436c249f50ea3b952))
* **dataflow:** find Python routes on router subclasses and nested mounts ([#221](https://github.com/byronwall/srcly/issues/221)) ([d87721f](https://github.com/byronwall/srcly/commit/d87721fd61aab862355910a0c0be68d3249693a3))
* **dataflow:** hand a resource's source value to its fetcher ([#243](https://github.com/byronwall/srcly/issues/243)) ([a087f67](https://github.com/byronwall/srcly/commit/a087f67912f515aa73801ad9cdddb4654909ea87))
* **dataflow:** let a Python app's first build finish ([#219](https://github.com/byronwall/srcly/issues/219)) ([5a34ea6](https://github.com/byronwall/srcly/commit/5a34ea6e25070556ae440c76bac6e2eca03a9e2f))
* **dataflow:** model the standard library instead of assuming it ([#246](https://github.com/byronwall/srcly/issues/246)) ([f458bc9](https://github.com/byronwall/srcly/commit/f458bc9606e9b4e8b037fa5e6daa41fd15901fa8))
* **dataflow:** model what Solid, React and router calls do with values ([#245](https://github.com/byronwall/srcly/issues/245)) ([1d63c2a](https://github.com/byronwall/srcly/commit/1d63c2a0750ad0253b23538e5dee074f5e10d478))
* **dataflow:** name an inline function's frame by where it is written ([#253](https://github.com/byronwall/srcly/issues/253)) ([4a16097](https://github.com/byronwall/srcly/commit/4a16097b659b9df6d9b4dc937e9d69c151457a2c))
* **dataflow:** name database reads and writes, Prisma's first ([#238](https://github.com/byronwall/srcly/issues/238)) ([fe53ff6](https://github.com/byronwall/srcly/commit/fe53ff6e55565f49eac05b672d90eba80bfdee87))
* **dataflow:** name what the browser holds where the program reads or writes it ([#248](https://github.com/byronwall/srcly/issues/248)) ([59d9bf4](https://github.com/byronwall/srcly/commit/59d9bf41e722e7d1e2af1fb8218a7dea2f5e6ab1))
* **dataflow:** never call the standard library "outside the program" ([#254](https://github.com/byronwall/srcly/issues/254)) ([99ea47b](https://github.com/byronwall/srcly/commit/99ea47b18486fc28361d7daacd5d9b30143c6974))
* **dataflow:** start a page's input at the router's URL reads ([#242](https://github.com/byronwall/srcly/issues/242)) ([768686d](https://github.com/byronwall/srcly/commit/768686d9e671cafdb399fb25620f0b1b34ce72bf))
* **dataflow:** start a value at the DOM event its element's handler receives ([#241](https://github.com/byronwall/srcly/issues/241)) ([35ed109](https://github.com/byronwall/srcly/commit/35ed10939354beb0ff5fc839371988605665553a))
* **dataflow:** use value words and no 404s on a Python root ([#220](https://github.com/byronwall/srcly/issues/220)) ([88296c3](https://github.com/byronwall/srcly/commit/88296c374bbc16fdbce6688dc3f1ddec65899d34))
* **dataflow:** walk a component's own state when it is anchored by name ([#251](https://github.com/byronwall/srcly/issues/251)) ([af90ead](https://github.com/byronwall/srcly/commit/af90ead4163c405b871f0ac21093dd764a7e17cc))
* **dataflow:** walk a function anchor's body, so its stops make it partial ([#227](https://github.com/byronwall/srcly/issues/227)) ([1392027](https://github.com/byronwall/srcly/commit/1392027da174333d95ae66cde5ca17fea5c88c75))
* **dataflow:** walk into closures, and stop honestly at a callback's return ([#232](https://github.com/byronwall/srcly/issues/232)) ([4307f7e](https://github.com/byronwall/srcly/commit/4307f7e735d5bd7710b0b76a24d5233a830c9e72))


### Documentation

* move the data-flow backlog into an in-repo Product Grid ([#215](https://github.com/byronwall/srcly/issues/215)) ([78a841e](https://github.com/byronwall/srcly/commit/78a841ea832fcba859e1f39bd6ccf224ad877019))
* Python data-flow audit, round 6 ([#235](https://github.com/byronwall/srcly/issues/235)) ([d3f1b43](https://github.com/byronwall/srcly/commit/d3f1b4368b237224bab6cb29f61f848244dfc523))
* Python data-flow audit, rounds 4 and 5 ([#230](https://github.com/byronwall/srcly/issues/230)) ([287be40](https://github.com/byronwall/srcly/commit/287be40605dd64351a4c798a31a13e8f3232d1ad))
* Python data-flow usability audit, three rounds ([#217](https://github.com/byronwall/srcly/issues/217)) ([db9dc98](https://github.com/byronwall/srcly/commit/db9dc980e3da8375410819be61fe409f70891174))
* TSX data-flow audit on visual-notes, round 1, the gap sweep and round 2 ([#255](https://github.com/byronwall/srcly/issues/255)) ([ee8a771](https://github.com/byronwall/srcly/commit/ee8a771ce94fb59573492445d0f5fa2411ad83c8))

## [1.5.0](https://github.com/byronwall/srcly/compare/v1.4.1...v1.5.0) (2026-10-26)


### Features

* **client:** add a 2x screenshot script with a scan-ready signal, and per-worktree e2e ports ([#194](https://github.com/byronwall/srcly/issues/194)) ([15a90d9](https://github.com/byronwall/srcly/commit/15a90d94280efd595bfee9f0b8331182eb3ef1d7))
* **dataflow:** fold the file tree in Data flow on a narrow window ([#156](https://github.com/byronwall/srcly/issues/156)) ([05fdaf0](https://github.com/byronwall/srcly/commit/05fdaf0ae3dd571e75c6864ca117295f628dae12))
* **dataflow:** give Python classes a data flow through fields and annotations ([#172](https://github.com/byronwall/srcly/issues/172)) ([9f64fbe](https://github.com/byronwall/srcly/commit/9f64fbe02bde4a7776cf626ed6a24ab24d87e9c6))
* **dataflow:** give Python ORM models fields declared by assigned field instances ([#189](https://github.com/byronwall/srcly/issues/189)) ([2d2549a](https://github.com/byronwall/srcly/commit/2d2549a07f787c9d5795f33f6fc7a617150c58ba))
* **dataflow:** label a frontier box by why the trace stops ([#158](https://github.com/byronwall/srcly/issues/158)) ([6f8f6c7](https://github.com/byronwall/srcly/commit/6f8f6c7b931df6fb524e869f0f25fe33ba37bb5c))
* **dataflow:** load library models as data rows, and read transforms from kind traits ([#206](https://github.com/byronwall/srcly/issues/206)) ([2235466](https://github.com/byronwall/srcly/commit/2235466004ec21a9b2c706ae0e50f5ab09de6da6))
* **dataflow:** move key hints into the legend and drop build numbers from the status bar ([#157](https://github.com/byronwall/srcly/issues/157)) ([334095f](https://github.com/byronwall/srcly/commit/334095fe1980577aa39dfc14cc4c22944dae728e))
* **dataflow:** pair Python calls by invocation ([#166](https://github.com/byronwall/srcly/issues/166)) ([a49673a](https://github.com/byronwall/srcly/commit/a49673a55730c4a50ddb71e55467a1a1c3a00f6d))
* **dataflow:** say what each side of an anchor trace holds and where it stops ([#152](https://github.com/byronwall/srcly/issues/152)) ([541da09](https://github.com/byronwall/srcly/commit/541da090edd63fe3b97ce135eee71ce53d43c3c5))
* **dataflow:** say why nothing is drawn and offer to try again ([#160](https://github.com/byronwall/srcly/issues/160)) ([3c1a26d](https://github.com/byronwall/srcly/commit/3c1a26d4e6eeea919fa2683c49e617ae74b39fc8))


### Bug Fixes

* **dataflow:** anchor a default-exported function by its own name ([#178](https://github.com/byronwall/srcly/issues/178)) ([5ac5302](https://github.com/byronwall/srcly/commit/5ac5302691ebf6649f10bf505e12f15763d7ed19))
* **dataflow:** anchor any Python def or class by name ([#164](https://github.com/byronwall/srcly/issues/164)) ([6b76d50](https://github.com/byronwall/srcly/commit/6b76d5003a38f8369565288b233ce3f6217f1dcf))
* **dataflow:** apply external-code and branch-test ends to Python ([#177](https://github.com/byronwall/srcly/issues/177)) ([ad3a40c](https://github.com/byronwall/srcly/commit/ad3a40ce48127c2c6c8d7038a8b9f2c47a241881))
* **dataflow:** begin and end Python values where the code does ([#199](https://github.com/byronwall/srcly/issues/199)) ([718bed7](https://github.com/byronwall/srcly/commit/718bed725682ee55fb74027af25c9bb4024c4b28))
* **dataflow:** bind destructured and optional props, and walk a classified call as the call ([#186](https://github.com/byronwall/srcly/issues/186)) ([f1f6065](https://github.com/byronwall/srcly/commit/f1f6065429cb4ad465dbe6c12e16fa7af3b1d444))
* **dataflow:** bind prop reads inside closures and string-literal props to the caller ([#159](https://github.com/byronwall/srcly/issues/159)) ([8d4dfbf](https://github.com/byronwall/srcly/commit/8d4dfbfe2b00eaa373bac2104aad692c4476c637))
* **dataflow:** call a trace ok only when no step assumes what library code does ([#183](https://github.com/byronwall/srcly/issues/183)) ([ded4051](https://github.com/byronwall/srcly/commit/ded40514f938ea0033d1ef8b6d5c598957ab2289))
* **dataflow:** carry a reactive state pair's setter value to its getter's reads ([#182](https://github.com/byronwall/srcly/issues/182)) ([3fc3e1c](https://github.com/byronwall/srcly/commit/3fc3e1c767ded881bbc9b770265fae08cbdbbe0e))
* **dataflow:** carry values past four kinds of dead end ([#167](https://github.com/byronwall/srcly/issues/167)) ([9827ab3](https://github.com/byronwall/srcly/commit/9827ab30d7a6688c95289a5b40f28a8b2bee000c))
* **dataflow:** end a thrown value at the throw ([#207](https://github.com/byronwall/srcly/issues/207)) ([52a7cbd](https://github.com/byronwall/srcly/commit/52a7cbd9c448a2157f7ea04898dbeb1ab8385e98))
* **dataflow:** enter a first-party method through this ([#176](https://github.com/byronwall/srcly/issues/176)) ([7d57bfd](https://github.com/byronwall/srcly/commit/7d57bfdf0fcdb542be982c7173876b8f661b28b5))
* **dataflow:** enter a Python function a framework decorator registers ([#185](https://github.com/byronwall/srcly/issues/185)) ([1ce1516](https://github.com/byronwall/srcly/commit/1ce1516976334757c966593ed16c13f3c9e4e6ae))
* **dataflow:** fill a FastAPI dependency parameter from its function, and enter a function handed to outside code ([#204](https://github.com/byronwall/srcly/issues/204)) ([9089869](https://github.com/byronwall/srcly/commit/9089869dafecc7af7073d19592f6b13fff30a83d))
* **dataflow:** fold a class's annotated uses by file ([#208](https://github.com/byronwall/srcly/issues/208)) ([df4d71c](https://github.com/byronwall/srcly/commit/df4d71c75408a6c2fb3833aac92d3e5c8d8a8979))
* **dataflow:** give each side of an anchor trace only its own end ([#155](https://github.com/byronwall/srcly/issues/155)) ([7c3e535](https://github.com/byronwall/srcly/commit/7c3e53583ab2aa1d0480f79e4e1f59a36a0cf1ec))
* **dataflow:** hand a library call's receiver to the function it is given ([#184](https://github.com/byronwall/srcly/issues/184)) ([b93bde7](https://github.com/byronwall/srcly/commit/b93bde711a2d37fb8b423621916dda398bf2f0d2))
* **dataflow:** keep a discarded library call's arguments in a receiver its function declares ([#175](https://github.com/byronwall/srcly/issues/175)) ([727bcf1](https://github.com/byronwall/srcly/commit/727bcf143072329e884d5e8e5b54292c3504f3db))
* **dataflow:** know a library call by its import's module and export name ([#209](https://github.com/byronwall/srcly/issues/209)) ([59ba4ec](https://github.com/byronwall/srcly/commit/59ba4ec40bcaa58525211eb0b6f3877b5b3e5c5a))
* **dataflow:** land a function's field reads through its argument, not one by one ([#163](https://github.com/byronwall/srcly/issues/163)) ([24f0475](https://github.com/byronwall/srcly/commit/24f04752915d567ba3b31d5731b35f658940215f))
* **dataflow:** let a read see every assignment that can reach it ([#173](https://github.com/byronwall/srcly/issues/173)) ([2568bc7](https://github.com/byronwall/srcly/commit/2568bc721ecd1855fcc70120909dcf9ab9cb3539))
* **dataflow:** name a budget-exhausted omission when a route slice hits its limit ([#161](https://github.com/byronwall/srcly/issues/161)) ([4068e12](https://github.com/byronwall/srcly/commit/4068e12fd879c9b46fec59bfda31ab43fcea77b0))
* **dataflow:** name where every partial trace stops ([#169](https://github.com/byronwall/srcly/issues/169)) ([798cdf6](https://github.com/byronwall/srcly/commit/798cdf697a6cb6243c95720ea3c474f276f82bb2))
* **dataflow:** pack array elements and spreads, and bind for…of to each element ([#174](https://github.com/byronwall/srcly/issues/174)) ([931dd3d](https://github.com/byronwall/srcly/commit/931dd3d12b7ab55afcca8c81084c680b07557c66))
* **dataflow:** pair a call with the one function its value is, through objects, bindings and aliases ([#198](https://github.com/byronwall/srcly/issues/198)) ([ecd5d7b](https://github.com/byronwall/srcly/commit/ecd5d7b7ea1791cbc5fb24b6999feb42ed708e76))
* **dataflow:** read a computed key as a partial read of its receiver ([#171](https://github.com/byronwall/srcly/issues/171)) ([138966e](https://github.com/byronwall/srcly/commit/138966e8a8c431efe6530e80302fc02fb49ed096))
* **dataflow:** read a state pair's factory and getter calls as framework-modelled, not assumed ([#188](https://github.com/byronwall/srcly/issues/188)) ([9ce06f9](https://github.com/byronwall/srcly/commit/9ce06f913ce45d6f128372262923e6fd66e975c8))
* **dataflow:** render a factory or alias component at the JSX tag that names it ([#180](https://github.com/byronwall/srcly/issues/180)) ([d53201c](https://github.com/byronwall/srcly/commit/d53201c184e07e605d47f2d53d66ac446d680aaa))
* **dataflow:** spend a trace's size limits only on fields it reads and places it draws ([#197](https://github.com/byronwall/srcly/issues/197)) ([7e902d2](https://github.com/byronwall/srcly/commit/7e902d2ae53ce8e1de64ae6ca53410afe90ae78b))
* **dataflow:** spend slices on value relations only, at limits and budgets sized to real code ([#168](https://github.com/byronwall/srcly/issues/168)) ([bae653d](https://github.com/byronwall/srcly/commit/bae653d293790a0f9acb639a62c002460ca2557d))
* **dataflow:** start a Python request at the request and end its response at the return ([#181](https://github.com/byronwall/srcly/issues/181)) ([ec59c8c](https://github.com/byronwall/srcly/commit/ec59c8c1dd36ed141272b1ccdef496f0c25e06b2))
* **dataflow:** stop four false ends the fixture annotations surfaced ([#202](https://github.com/byronwall/srcly/issues/202)) ([bd6da4c](https://github.com/byronwall/srcly/commit/bd6da4c436b8061fd27568c6eb69257f2d5c1ca2))
* **dataflow:** stop the engine holding a second Program and bound what it keeps ([#165](https://github.com/byronwall/srcly/issues/165)) ([0daf01e](https://github.com/byronwall/srcly/commit/0daf01e89eb8dce2f13436326652f55eb673899a))
* **dataflow:** trace a declaration's own params and returns, and name each frontier ([#151](https://github.com/byronwall/srcly/issues/151)) ([58198e9](https://github.com/byronwall/srcly/commit/58198e95365c4a975e955e48ad523ae97f86687b))
* **dataflow:** trust the slice's call pairing instead of R7 at every helper ([#170](https://github.com/byronwall/srcly/issues/170)) ([18eaccf](https://github.com/byronwall/srcly/commit/18eaccf0c67ed1d4363f0c3fed22e56dc185b215))


### Performance Improvements

* **dataflow:** let the checker truncate the type text facts carry ([#193](https://github.com/byronwall/srcly/issues/193)) ([0db70a4](https://github.com/byronwall/srcly/commit/0db70a4e12e53e3cb459b2e5761562457d24ee65))
* shrink the analysis tree payload ~95x on the wire ([#179](https://github.com/byronwall/srcly/issues/179)) ([1be355b](https://github.com/byronwall/srcly/commit/1be355b1702b43122254d4f046ed8a8d0e4c68a6))


### Documentation

* **dataflow:** plan library models as data rows shared by both collectors ([#203](https://github.com/byronwall/srcly/issues/203)) ([add067c](https://github.com/byronwall/srcly/commit/add067c991fc5f104d23900667b053caebd9ee6e))

## [1.4.1](https://github.com/byronwall/srcly/compare/v1.4.0...v1.4.1) (2026-10-25)


### Bug Fixes

* **dataflow:** bundle the data-flow engine into the wheel ([#149](https://github.com/byronwall/srcly/issues/149)) ([64afd44](https://github.com/byronwall/srcly/commit/64afd445b45e9d613dfb74fd6547e16e48bb1529))

## [1.4.0](https://github.com/byronwall/srcly/compare/v1.3.0...v1.4.0) (2026-10-25)


### Features

* **dataflow:** a Recent menu of the anchors and routes traced in this tab ([#138](https://github.com/byronwall/srcly/issues/138)) ([f4f7b6c](https://github.com/byronwall/srcly/commit/f4f7b6cff4e457d2398cea0fdb9a6153e7684aa3))
* **dataflow:** an edit under an open graph shows Source changed, and Refresh rebuilds ([#127](https://github.com/byronwall/srcly/issues/127)) ([2c9012e](https://github.com/byronwall/srcly/commit/2c9012e83d9481a5e3222f30e44f9677b76edb0a))
* **dataflow:** anchor mode traces a value from the code viewer, backward or forward ([#116](https://github.com/byronwall/srcly/issues/116)) ([38ee44b](https://github.com/byronwall/srcly/commit/38ee44b233dcd7cd4a2ff4337134bb739c2c26d2))
* **dataflow:** draw the route's backbone first, before the program-wide evidence ([#130](https://github.com/byronwall/srcly/issues/130)) ([35ecea6](https://github.com/byronwall/srcly/commit/35ecea61e090978e8309afbcf0940cdb7363f799))
* **dataflow:** explain a lit edge, step by step, in the inspector ([#136](https://github.com/byronwall/srcly/issues/136)) ([3260ec7](https://github.com/byronwall/srcly/commit/3260ec70c0531b0a4c70090736ccad80a5169e7a))
* **dataflow:** file and folder anchors, one box per export, traced on demand ([#139](https://github.com/byronwall/srcly/issues/139)) ([28c4d14](https://github.com/byronwall/srcly/commit/28c4d148e8a6e0b84157a6a93c9dbddbbd30d252))
* **dataflow:** inspector rail with the route overview and the selected box in full ([#112](https://github.com/byronwall/srcly/issues/112)) ([19ac395](https://github.com/byronwall/srcly/commit/19ac3956a9a4c1cdf0532fb37e9e8f70d752c662))
* **dataflow:** kind marks, tints, status strokes and flow counts on route graph boxes ([#110](https://github.com/byronwall/srcly/issues/110)) ([c6af7e8](https://github.com/byronwall/srcly/commit/c6af7e8b24f2cb02c63ef80b714de024f826e538))
* **dataflow:** origin selection lights proven destinations ([#108](https://github.com/byronwall/srcly/issues/108)) ([b822a0a](https://github.com/byronwall/srcly/commit/b822a0a7f2232b93c903eb013855a29fcd81d10f))
* **dataflow:** Python roots open in Data flow mode through a language host ([#120](https://github.com/byronwall/srcly/issues/120)) ([0fea6a7](https://github.com/byronwall/srcly/commit/0fea6a77c04110a0ab75ce6fa1ea2a9eb5852076))
* **dataflow:** reach emphasis on any box, field path labels and edge proof cards ([#111](https://github.com/byronwall/srcly/issues/111)) ([34617b1](https://github.com/byronwall/srcly/commit/34617b171fd931389792ef5681cdb2c8b2a122fb))
* **dataflow:** Return restores a place as it was left: camera, selection, metric, filters ([#137](https://github.com/byronwall/srcly/issues/137)) ([405f1aa](https://github.com/byronwall/srcly/commit/405f1aa2173031d948a7e6c1bf6c24b784029a37))
* **dataflow:** route graph backbone in Data flow mode ([#107](https://github.com/byronwall/srcly/issues/107)) ([108fe59](https://github.com/byronwall/srcly/commit/108fe59f68a6b1784783628688f85f6262586d46))
* **dataflow:** trace a FastAPI handler from the route picker, code viewer and import graph ([#122](https://github.com/byronwall/srcly/issues/122)) ([f1af880](https://github.com/byronwall/srcly/commit/f1af880094d9fd1a81ea9238f05c8dd1e23d7156))
* **dataflow:** trace a symbol from the import graph or the treemap ([#117](https://github.com/byronwall/srcly/issues/117)) ([ed7534a](https://github.com/byronwall/srcly/commit/ed7534a6e177c3c3308f18d0c7e16cf78fb5218d))
* **dataflow:** up to three anchors on one canvas, with the boxes their traces share marked ([#142](https://github.com/byronwall/srcly/issues/142)) ([b8f7ab1](https://github.com/byronwall/srcly/commit/b8f7ab1908e83860cb84e801b36c7bcfc3e8f8ec))
* **dataflow:** value-flow ledger proof in the code viewer rail ([#109](https://github.com/byronwall/srcly/issues/109)) ([55d6553](https://github.com/byronwall/srcly/commit/55d6553534d5c944c414d3490d836d22b16a4e66))
* **dataflow:** what a function touches, in the code viewer rail and the inspector ([#135](https://github.com/byronwall/srcly/issues/135)) ([58c3a45](https://github.com/byronwall/srcly/commit/58c3a45305fe3d98d61cbeb2a200b351d17cdc3e))
* **engine:** anchorGraph traces a value from any expression, backward or forward ([#114](https://github.com/byronwall/srcly/issues/114)) ([c74922c](https://github.com/byronwall/srcly/commit/c74922c849dda77e7f43678e881272ebf6002b4b))
* **engine:** functionEffects says what a function touches ([#134](https://github.com/byronwall/srcly/issues/134)) ([0eabad9](https://github.com/byronwall/srcly/commit/0eabad91bc7b550058038d287f74a2ff11b15e2a))
* **engine:** Python evidence provider from ast and mypy, with FastAPI routes ([#119](https://github.com/byronwall/srcly/issues/119)) ([d1e9264](https://github.com/byronwall/srcly/commit/d1e92641dba8f0b509f995b071c74e2b6f6345f6))
* **engine:** stdio protocol and tier-1 session ([#105](https://github.com/byronwall/srcly/issues/105)) ([4445742](https://github.com/byronwall/srcly/commit/4445742274311c62cbf511e332e890249e45aece))
* **server:** POST /api/dataflow/anchor-graph serves the engine's anchor graph ([#115](https://github.com/byronwall/srcly/issues/115)) ([11726e1](https://github.com/byronwall/srcly/commit/11726e14b07523eb09d905c681902e48382806a2))
* **server:** python owns a lazy data-flow engine child ([#106](https://github.com/byronwall/srcly/issues/106)) ([701176b](https://github.com/byronwall/srcly/commit/701176bb08be4173f910bb89f72deb627451a898))


### Bug Fixes

* **dataflow:** draw the flow marks in palette tokens, and mix the box tint over the surface token ([#140](https://github.com/byronwall/srcly/issues/140)) ([711e7ec](https://github.com/byronwall/srcly/commit/711e7ec5ddf387c0242ce0a984a03085c86e75fe))
* **dataflow:** field labels sit beside their edge where they cover no box ([#141](https://github.com/byronwall/srcly/issues/141)) ([9737377](https://github.com/byronwall/srcly/commit/9737377c5c7687c98edaeab8356b5db33999a62c))
* **engine:** a dead end in an anchor walk is a frontier, not the end of a path ([#124](https://github.com/byronwall/srcly/issues/124)) ([add131f](https://github.com/byronwall/srcly/commit/add131fc8a02922d6bcd4045303fb5bdd272fadd))
* **engine:** declaration anchors never mark found-by-syntax links proven ([#123](https://github.com/byronwall/srcly/issues/123)) ([5bae413](https://github.com/byronwall/srcly/commit/5bae413e2670856a25acafeeb161778da85e83ee))
* **engine:** route graph status per box, not per route ([#121](https://github.com/byronwall/srcly/issues/121)) ([b7f74e5](https://github.com/byronwall/srcly/commit/b7f74e51c30253f4489223bc35e4e46cdfbf3b0a))
* **engine:** two calls of one helper never join ([#132](https://github.com/byronwall/srcly/issues/132)) ([791beb3](https://github.com/byronwall/srcly/commit/791beb37aee10c3fe24d823223e62f195ca2e311))
* **scan:** skip .playwright-mcp and other tool output folders ([#146](https://github.com/byronwall/srcly/issues/146)) ([b13ba94](https://github.com/byronwall/srcly/commit/b13ba9430fa00b92894d5407c213e4aa450ff2e0))


### Performance Improvements

* **engine:** measure a Program scoped to one route and keep it off ([#133](https://github.com/byronwall/srcly/issues/133)) ([02fd77e](https://github.com/byronwall/srcly/commit/02fd77e9b225858b216036e8cb0d1e65ff178c43))
* **engine:** phase profiler for tier 1, fact collection, route totality and anchors ([#128](https://github.com/byronwall/srcly/issues/128)) ([1e05611](https://github.com/byronwall/srcly/commit/1e056117312f436c7f57ec35c666708b9903fc80))
* **engine:** remember paths, symbol ids and type text during fact collection ([#129](https://github.com/byronwall/srcly/issues/129)) ([ec5181e](https://github.com/byronwall/srcly/commit/ec5181e0de1ee522ebf3c8d0a65e8748dff90203))
* **engine:** serve a reopened root from a result cache keyed by the Program's hash ([#131](https://github.com/byronwall/srcly/issues/131)) ([20f7b7b](https://github.com/byronwall/srcly/commit/20f7b7bda40184c71234d1e7345e17c36eef3a86))


### Documentation

* **dataflow:** robustness initiative ([#118](https://github.com/byronwall/srcly/issues/118)) ([d4c9a27](https://github.com/byronwall/srcly/commit/d4c9a278e4a3999de31be2653667a81c79d2b744))
* intent, shape, and plan for merging tsx-data-flow into srcly ([#101](https://github.com/byronwall/srcly/issues/101)) ([87c7af4](https://github.com/byronwall/srcly/commit/87c7af4259aafa5005b4d699d615f9ee7f76274d))

## [1.3.0](https://github.com/byronwall/srcly/compare/v1.2.0...v1.3.0) (2026-10-21)


### Features

* **2x2:** presets, points and reset join the view toolbar ([#97](https://github.com/byronwall/srcly/issues/97)) ([c308bd3](https://github.com/byronwall/srcly/commit/c308bd3249dc324a642229eb6be1c95fd2892b4c))
* **graph:** Shift-click expands in place, with a steady layout ([#91](https://github.com/byronwall/srcly/issues/91)) ([edc8c72](https://github.com/byronwall/srcly/commit/edc8c72c137791469abfaa3963ea8ba16015b604))
* **nav:** arrow keys move through the view switch and sidebar tabs ([#96](https://github.com/byronwall/srcly/issues/96)) ([5c52efb](https://github.com/byronwall/srcly/commit/5c52efbdd623e0238b10b03106c674b95395eb92))
* **nav:** split the header into where-you-are and how-you-look rows ([#95](https://github.com/byronwall/srcly/issues/95)) ([c2f3738](https://github.com/byronwall/srcly/commit/c2f373892977c88a9e005f33a70c881a51acc9aa))


### Bug Fixes

* **graph:** one frame per opened folder, even across columns ([#92](https://github.com/byronwall/srcly/issues/92)) ([aea1015](https://github.com/byronwall/srcly/commit/aea1015258f56dd45b8e175f7288e2fef3abc6cf))
* **treemap:** show the scanned folder's name instead of "root" ([#98](https://github.com/byronwall/srcly/issues/98)) ([312095f](https://github.com/byronwall/srcly/commit/312095f8fb63e74c20a94e4a0823c272f331f1ae))

## [1.2.0](https://github.com/byronwall/srcly/compare/v1.1.0...v1.2.0) (2026-10-20)


### Features

* **graph:** expand folders in place to explore dependencies at mixed scales ([#84](https://github.com/byronwall/srcly/issues/84)) ([5df41ab](https://github.com/byronwall/srcly/commit/5df41ab74217d61757f602d4b8aa2af878e9f854))
* **graph:** go-to palette for any folder, file or symbol ([#88](https://github.com/byronwall/srcly/issues/88)) ([e9bb0d1](https://github.com/byronwall/srcly/commit/e9bb0d1a2318cba48c46c9a27481c421a1f4727c))
* **graph:** keyboard navigation, shortcut sheet and modifier clicks ([#87](https://github.com/byronwall/srcly/issues/87)) ([c4a99ec](https://github.com/byronwall/srcly/commit/c4a99ec0b7a130179fd641a9dd8b9c90a4314715))
* **graph:** show link counts and folder contents on every box ([#86](https://github.com/byronwall/srcly/issues/86)) ([601b938](https://github.com/byronwall/srcly/commit/601b9389fbc7887b4da84ce9acbbaba63e58bad3))

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
