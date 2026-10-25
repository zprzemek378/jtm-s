# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

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
