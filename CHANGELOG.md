# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-08-24

### Added

- Use saved roll name as template title instead of 'Pixels Dice'
- Add signal strength indicator to Known Dice in popup
- Migrate BLE layer to @scooper4711/pixels-ble package
- Add blink-to-identify when clicking a die name in the popup
- Add roll query (?{prompt|default}) support to /pix command
- replace modifier box with saved roll formulas
- Merge dice-roller-parser branch into main
- Allow d100 percentile die to fill d10 slots in prompted rolls
- Allow d8, d12 and d20 to substitute for d4, d6 and d10
- Integrate dice-roller-parser for full Roll20 dice expression support
- Update d4 icon to match Pixels dice shape
- Color-code battery indicator by level
- Sort dice by connection status, die type, then name
- Replace status dots with inline SVG die-type icons
- Sort known dice list by connection status then name
- Two-step disconnect/forget with Bluetooth un-pairing
- Display battery level for connected Pixels dice
- Add icon badge, unprompted toggle, and reorganize popup
- Add /pixels chat command for prompted dice rolls
- Detect die type from BLE protocol instead of name parsing
- Add known dice storage with quick reconnect and status display
- Add configurable roll window slider to modifier box
- Add RollBatcher module for multi-dice roll grouping

### Fixed

- Resolve getPixelByName always returning first die
- Use Roll20 markdown for dice display, remove crit indicators
- Treat d10 face value 0 as 10 for standalone rolls
- Silence spurious error when hiding non-existent modifier box
- Handle d00 and d10 face values and percentile combo
- Show connected/total status using known dice count

### Changed

- add release packaging
- adjust line width to my coding standards
- bump fast-uri from 3.1.2 to 3.1.5 (#13)
- bump the dev-minor-patch group across 1 directory with 3 updates (#5)
- bump postcss from 8.5.15 to 8.5.26 (#15)
- bump brace-expansion from 1.1.15 to 1.1.18 (#14)
- bump actions/upload-artifact from 4 to 7 (#9)
- bump SonarSource/sonarqube-scan-action (#6)
- bump actions/setup-node from 4 to 7 (#10)
- bump eslint from 9.39.4 to 10.8.1 in the prod-major group (#12)
- bump actions/checkout from 4 to 7 (#8)
- bump actions/download-artifact from 4 to 8 (#7)
- configure dependabot
- Bump @scooper4711/pixels-ble to ^0.3.0
- Add CI workflow with SonarCloud analysis and README badges
- Switch to published @scooper4711/pixels-ble@0.2.1 from npm link
- Convert all source files from JavaScript to TypeScript
- add spec files for saved roll formulas feature
- Rename to PixelLink for Roll20
- Add screenshots and reorganize User Guide sections
- Update README and User Guide for dice-roller-parser features
- Replace status box with inline dice count on Known Dice header
- Add third-party icon attribution notices
- Update README and user guide with new features
- Add roll window slider and auto-reconnect to user guide
- Add unit tests for RollBatcher module
- Route dice rolls through RollBatcher instead of posting directly
- add Firefox support implementation plan (native messaging bridge)
- shrink store package from 6.9M to 136K
- document modifier box pop-out and per-profile export

[2.0.0]: https://github.com/scooper4711/pixellink-roll20/releases/tag/v2.0.0
