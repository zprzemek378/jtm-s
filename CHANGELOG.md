# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.6.0](https://github.com/zprzemek378/jtm-s/compare/v1.5.0...v1.6.0) (2026-11-27)

### Features

* **game:** add a half-stake verdict for an answer that was nearly right ([de6cda5](https://github.com/zprzemek378/jtm-s/commit/de6cda56200df114dc273f20eca692af84911598))
* **game:** keep a game as the list of things that happened in it ([42afea6](https://github.com/zprzemek378/jtm-s/commit/42afea6cd28e31d4d2e7c1f54a7c176d9850c602))
* **game:** pick a game up where the closed tab left it ([ccda184](https://github.com/zprzemek378/jtm-s/commit/ccda184fe8f45e005132487a543881b4a4d27dc7))
* **game:** take a move back from the edit screen ([22020ec](https://github.com/zprzemek378/jtm-s/commit/22020ecdde33205d6554380c26805c8525c59054))
* offer back every unfinished game, not only the last one ([bbcd738](https://github.com/zprzemek378/jtm-s/commit/bbcd73850ebfba232abd026e17d8b8ba44c8481a))
* send what was played to the backend, once it can be reached ([d8e55b6](https://github.com/zprzemek378/jtm-s/commit/d8e55b663f719280bcbbcf09a29af4b3d8380659))
* **server:** a Worker that keeps the games ([c92374b](https://github.com/zprzemek378/jtm-s/commit/c92374b91208737bb1f668d58d26c6d41c8525d9))
* **universe:** a screen for the shared pool of games ([7b4df51](https://github.com/zprzemek378/jtm-s/commit/7b4df514e1740bb8f09c5be4e55017e16ca4978a))
* **universe:** carry on an evening left on another computer ([d947129](https://github.com/zprzemek378/jtm-s/commit/d9471293ea63fb6d4cf86b61c89a4c565bc50d9b))
* **universe:** every account that can sign in may make a universe ([0edd8b1](https://github.com/zprzemek378/jtm-s/commit/0edd8b1e272f43b29b10b497938a67c9b195c2e8))
* **universe:** play an evening from a universe's people ([9ab80e3](https://github.com/zprzemek378/jtm-s/commit/9ab80e30e511a2b42460cbe92354dd7b29fc19cc))
* **universe:** read a game back, step by step ([64aaed1](https://github.com/zprzemek378/jtm-s/commit/64aaed192f40264db7761eb1949b6769f60a5ddb))
* **universe:** rename or delete a universe, and read back free play ([df8acd5](https://github.com/zprzemek378/jtm-s/commit/df8acd57572925e1f9558fea4c30f2017b72fa60))

### Bug Fixes

* a backend that is down must not be asked again and again ([2ec1ddf](https://github.com/zprzemek378/jtm-s/commit/2ec1ddffafecf7bba3f0ef86c8fd28176d806a3b))
* a move taken back reaches the backend as well ([0e2faf1](https://github.com/zprzemek378/jtm-s/commit/0e2faf166677ab69dee18c29b63d3743c93cb474))
* **game:** a rematch starts with nothing to put back ([e9d2f31](https://github.com/zprzemek378/jtm-s/commit/e9d2f3154b2e5e203d28e84c0cf3e849df857332))
* **game:** a universe game was being written down as belonging to none ([6f164a1](https://github.com/zprzemek378/jtm-s/commit/6f164a11c4c1e40e16b3f8fa70efbdf56aa82bff))
* **game:** resuming only gives up the round nobody had answered ([1b774b8](https://github.com/zprzemek378/jtm-s/commit/1b774b860f8798c0cde8a46b8bbffc40b4ef480d))
* **i18n:** the home page still promised a game for eight ([a3b58dc](https://github.com/zprzemek378/jtm-s/commit/a3b58dc637ed0561f938f4f015213ed74e3e1c27))
* read the stored games as carefully as anything else from outside ([1b251b3](https://github.com/zprzemek378/jtm-s/commit/1b251b301807f2731e742fa8141b3ea3a1af571b))
* reading the account no longer asks for it hundreds of times a second ([02acc18](https://github.com/zprzemek378/jtm-s/commit/02acc18af3c75efcf6a726702e0707aadf6106b2))
* **server:** a session can outlive the row that names its account ([2efd5f4](https://github.com/zprzemek378/jtm-s/commit/2efd5f4ac9802c8d8a32af4ff0ac627f75e823c2))
* **server:** two things a local run of the Worker showed ([aa50614](https://github.com/zprzemek378/jtm-s/commit/aa50614733397eef72146120f7c39053b1541dd6))
* tell the backend when a game ended, not only what happened in it ([6ddfe0e](https://github.com/zprzemek378/jtm-s/commit/6ddfe0ec86a885f1ac58f96caa6acfd8e7bef7f3))
* the store's budget, the shedding order and the wiped track list ([d07ddc7](https://github.com/zprzemek378/jtm-s/commit/d07ddc746883c11464b8400324a908d8c948b2aa))

### Documentation

* how to put the server up, for whoever does it ([d73a44a](https://github.com/zprzemek378/jtm-s/commit/d73a44a0c3b321ebac656cc0c91cdc7bf2b704ea))

### Maintenance

* one command to run the whole thing locally ([8f83ce7](https://github.com/zprzemek378/jtm-s/commit/8f83ce7529315ccafea7b404a44375c205bb5322))
* **server:** point at the database that was created, and at where the app lives ([e659a31](https://github.com/zprzemek378/jtm-s/commit/e659a317bcd322975a79a7f6698d460a3f4e3d0e))

### Internal

* cover the rules and the two races that broke in play ([ae6136a](https://github.com/zprzemek378/jtm-s/commit/ae6136aac844f727a0270ab0ec2652d29977a9a2))
* hold each agreed requirement to something that checks it ([aa1e4c3](https://github.com/zprzemek378/jtm-s/commit/aa1e4c3442707645d03fc1f47d20c065925249fe))
* run the suites from the repo with vitest ([d081c83](https://github.com/zprzemek378/jtm-s/commit/d081c838e7da861f17f5c80954012471ac93eb2d))
* the rules a game was played under survive the store ([a616ed9](https://github.com/zprzemek378/jtm-s/commit/a616ed9698c29724ebf03bcdc836b8ad0d1872de))

## [1.5.0](https://github.com/zprzemek378/jtm-s/compare/v1.4.0...v1.5.0) (2026-10-28)

### Features

* **game:** add modifiers, starting with a round of words instead of music ([1ed9f1e](https://github.com/zprzemek378/jtm-s/commit/1ed9f1e0be64539b6394c3d93cccaff682a1618e))
* **game:** add the first lifeline, extra time ([b22aefe](https://github.com/zprzemek378/jtm-s/commit/b22aefee1ad17f4ea7c6863a3f1b426eac826f25))
* **game:** add the second lifeline, six titles ([d65357c](https://github.com/zprzemek378/jtm-s/commit/d65357cd250f7f2fc4ffd0b6f0f92ca86265cf89))
* **settings:** choose the interface typeface ([f8ae81a](https://github.com/zprzemek378/jtm-s/commit/f8ae81a890ef08918519ebbee052c7e5441724f2))
* **spotify:** keep a song from the round, in the library or on a playlist ([dc3aff8](https://github.com/zprzemek378/jtm-s/commit/dc3aff8fad841c47518721be6531573a97719f96))
* **spotify:** stop a song being added to a playlist it is already on ([224b0e0](https://github.com/zprzemek378/jtm-s/commit/224b0e0f2c22c4df5b507f6134cadcc958a1f411))

### Bug Fixes

* **spotify:** read a reply as JSON only when it says it is ([c5e975d](https://github.com/zprzemek378/jtm-s/commit/c5e975d2bf6d2209f6e5ca61c9b75ce3d0f15410))
* **spotify:** recover when Spotify no longer knows our player ([3a65f43](https://github.com/zprzemek378/jtm-s/commit/3a65f43ea677503ccc8bee8bd63ad15667d41c5d))

### Refactoring

* **settings:** make the lyrics panel unconditional ([1caa6ad](https://github.com/zprzemek378/jtm-s/commit/1caa6ad26bdfbc41a72d87429c257da4a352083c))

## [1.4.0](https://github.com/zprzemek378/jtm-s/compare/v1.3.1...v1.4.0) (2026-10-25)

### Features

* **game:** add pause and resume to the track scrubber ([07b4939](https://github.com/zprzemek378/jtm-s/commit/07b49393503b288dc4552bdbc07b96250949fc0d))
* **game:** carry each player's colour across the game screens ([7fe172c](https://github.com/zprzemek378/jtm-s/commit/7fe172c6c62e535720a5538334601dac89b29f16))
* **game:** keep the track and its title on screen after a tie ([86a1a0c](https://github.com/zprzemek378/jtm-s/commit/86a1a0c1175c6fab79be3c752407e4f88e3109a9))
* **game:** rewrite names, colours, order and keys from edit mode ([87587e3](https://github.com/zprzemek378/jtm-s/commit/87587e3950cb2aeec9bcd1ebac24240aed6b141a))
* **game:** show the lyrics once the answer is revealed ([d7244a1](https://github.com/zprzemek378/jtm-s/commit/d7244a188975adfcd1acd067970805e10796eef4))
* **setup:** let players pick a colour and a seat, and seat up to twelve ([25e829e](https://github.com/zprzemek378/jtm-s/commit/25e829eebae3e58477114583a951717d2a138518))
* **setup:** seat up to fifty, and say so only once the table is full ([8d5bed3](https://github.com/zprzemek378/jtm-s/commit/8d5bed3fb67613c17211ecc05e6dd6ba7423fd18))

### Bug Fixes

* **game:** keep Ctrl, the Windows key and the menu key off the buzzers ([7bc3985](https://github.com/zprzemek378/jtm-s/commit/7bc3985e8774a34f71bd168167f77804d21d21dc))
* **spotify:** make a pause stick when it beats the music to the device ([587d0ce](https://github.com/zprzemek378/jtm-s/commit/587d0ce61d1f566354a3f276faa43027e4ec911d))

### Refactoring

* **game:** clear the listening screen of labels it does not need ([f34162e](https://github.com/zprzemek378/jtm-s/commit/f34162e597d4e4f91843d0a1f503f0da571f739e))
* **game:** drop the key legend from the round ([4fbf2c4](https://github.com/zprzemek378/jtm-s/commit/4fbf2c4d65d82785d432d4750081c1a7cd79d932))

## [1.3.1](https://github.com/zprzemek378/jtm-s/compare/v1.3.0...v1.3.1) (2026-10-03)

### Bug Fixes

* **game:** ignore host keys for a moment after each screen change ([c563d84](https://github.com/zprzemek378/jtm-s/commit/c563d8408e98f2a5899ffd6909a04294d2e171f4))

## [1.3.0](https://github.com/zprzemek378/jtm-s/compare/v1.2.4...v1.3.0) (2026-10-03)

### Features

* **sound:** sound the buzzer on the press, and let a sound start late ([e576d22](https://github.com/zprzemek378/jtm-s/commit/e576d22417afe2b00ae0a3acc829266d5b90628f))

### Bug Fixes

* **game:** show only the bans that apply to the round ahead ([b8cf889](https://github.com/zprzemek378/jtm-s/commit/b8cf8895981b77d01ea7e2c5d3c01c1a962ec238))

### Reverts

* drop the chorus guess button ([3534eff](https://github.com/zprzemek378/jtm-s/commit/3534effa4d9ca6c50a2cd8105fa84c59ece346ce))

### Internal

* adopt Prettier and format the whole project ([5f17bf7](https://github.com/zprzemek378/jtm-s/commit/5f17bf7400b70e56c32855e697045c94eaafb835))

## [1.2.4](https://github.com/zprzemek378/jtm-s/compare/v1.2.3...v1.2.4) (2026-10-02)

### Bug Fixes

* **ci:** release only what has not been released already ([3806c18](https://github.com/zprzemek378/jtm-s/commit/3806c18dfe5765f110a60ffc27718995f62dda98))

## [1.2.3](https://github.com/zprzemek378/jtm-s/compare/v1.2.2...v1.2.3) (2026-10-02)

## [1.2.2](https://github.com/zprzemek378/jtm-s/compare/v1.2.1...v1.2.2) (2026-10-02)

## [1.2.1](https://github.com/zprzemek378/jtm-s/compare/v1.2.0...v1.2.1) (2026-10-02)

### Maintenance

* give every release notes, and a page to read them on ([d16ef3b](https://github.com/zprzemek378/jtm-s/commit/d16ef3b5f136d54b3966ed50708020814cb094e8))

## [1.2.0](https://github.com/zprzemek378/jtm-s/compare/v1.1.1...v1.2.0) (2026-10-02)

### Features

* show when the running version was released ([53c13c0](https://github.com/zprzemek378/jtm-s/commit/53c13c08e1e78dafa7a504bba5b19e387de915f0))

## [1.1.1](https://github.com/zprzemek378/jtm-s/compare/v1.1.0...v1.1.1) (2026-10-02)

### Maintenance

* give every published state a version of its own ([b3476f4](https://github.com/zprzemek378/jtm-s/commit/b3476f452346ff835ded3158db0f0ed2f46c8d7d))

## [1.1.0](https://github.com/zprzemek378/jtm-s/compare/v1.0.1...v1.1.0) (2026-10-02)

### Features

* **game:** add a scrubber, and put every Spotify request behind one queue ([#2](https://github.com/zprzemek378/jtm-s/issues/2)) ([8d04427](https://github.com/zprzemek378/jtm-s/commit/8d044276c880dcc34711f7cedabc1a90b1123043))

## [1.0.1](https://github.com/zprzemek378/jtm-s/compare/v1.0.0...v1.0.1) (2026-10-02)

### Bug Fixes

* stop the version competing with the controls for the sidebar's space ([9e7a124](https://github.com/zprzemek378/jtm-s/commit/9e7a1241698b92d39749ae163943772c4e0cd701))

## 1.0.0 (2026-10-02)

### Features

* add jtm-s, a local Spotify music quiz for 2-8 players ([994e9ff](https://github.com/zprzemek378/jtm-s/commit/994e9ff32a43f7b24f69e5139b7663d22e6f3fa2))
* show the app version and derive it from the commit log ([085688f](https://github.com/zprzemek378/jtm-s/commit/085688f642e7d7f10136bf22bfc22906d6ff912e))

### Bug Fixes

* **ci:** read the Spotify secrets under the names they really have ([9e2f930](https://github.com/zprzemek378/jtm-s/commit/9e2f9303e57e53a8b18734a017ef5111d95f6dc8))
