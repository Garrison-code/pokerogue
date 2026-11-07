## Purpose

Defines how the system-data merge import accepts exported save files. It covers which fields a server-exported file can carry and how legacy fields are normalized before strict validation.

## ADDED Requirements

### Requirement: Legacy egg gachaType is normalized before strict validation

When decoding an imported system save whose `gameVersion` equals the current game version, the import decoder SHALL normalize every egg entry before strict shape validation: if the egg has no `sourceType` and has a `gachaType`, the decoder SHALL set `sourceType` to the value of `gachaType`; the decoder SHALL then remove `gachaType` from the egg. The decoded result SHALL NOT contain `gachaType` on any egg.

#### Scenario: Same-version file with gachaType on every egg is accepted

- **WHEN** a save file whose `gameVersion` equals the current version contains eggs that each carry `sourceType` and a legacy `gachaType` of 0
- **THEN** decoding succeeds without an `unsupported` error
- **AND** the decoded eggs have no `gachaType` property

#### Scenario: Result is identical to the same file without gachaType

- **WHEN** two otherwise identical save files are decoded, one with `gachaType` on its eggs and one without
- **THEN** both decoded results have the same fingerprint

#### Scenario: gachaType fills a missing sourceType

- **WHEN** an egg has `gachaType` set to 3 and no `sourceType`
- **THEN** the decoded egg has `sourceType` equal to 3

##### Example: precedence between gachaType and sourceType

| Egg input | Decoded sourceType | Notes |
| --------- | ------------------ | ----- |
| `sourceType: 2, gachaType: 0` | 2 | existing `sourceType` is kept |
| `gachaType: 3` (no `sourceType`) | 3 | `gachaType` fills the gap |
| `sourceType: 1` (no `gachaType`) | 1 | unchanged |

### Requirement: Unknown egg fields remain rejected

The import decoder SHALL continue to reject any egg field that is neither a supported egg field nor the legacy `gachaType`, reporting an `unsupported` error that names the field.

#### Scenario: Unknown egg field is rejected

- **WHEN** a save file contains an egg with an unknown field such as `unknown`
- **THEN** decoding fails with an `unsupported` error naming that field
