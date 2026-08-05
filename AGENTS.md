# AGENTS

This file captures the current state of the FV1 Controller project so a future agent or developer can resume the work without re-discovering the design decisions.

## Project purpose

This repository contains firmware for an Arduino Pro Mini 3.3 V / ATmega328P board that acts as a controller for an FV1 multi-effects pedal.

The firmware is a prototype controller that:

- switches the FV1 pedal in and out of bypass
- selects among patch slots with a rotary encoder
- stores and restores a favorite patch
- shows patch information on a small Nokia 5110-style LCD
- drives the FV1 control lines through a CD4094 shift register

The implementation is intentionally modular and designed around a simple AVR/PlatformIO firmware layout.

## Current architecture

The firmware is split into the following source files:

- src/main.cpp
  - entry point
  - setup() initializes serial, pins, display, and persisted state
  - loop() handles encoder input, SIPO updates, and screen updates

- src/input_handler.cpp / src/input_handler.h
  - rotary encoder decoding
  - encoder-button behavior
  - favorite-patch persistence in EEPROM
  - momentary/toggle mode persistence in EEPROM

- src/sipo_handler.cpp / src/sipo_handler.h
  - shift-register output updates
  - relay control state updates
  - footswitch input handling with debounce and interrupt-driven processing
  - writes the SIPO data to the CD4094 output lines

- src/display_handler.cpp / src/display_handler.h
  - initializes and updates the Nokia 5110 LCD
  - renders patch text to the display
  - handles display backlight timeout

- src/controller_state.h / src/controller_state.cpp
  - shared runtime state variables such as:
    - selectedProgram
    - oldSelectedProgram
    - momentarySwitch
    - sipoData
    - oldSipoData
    - button state variables

- src/config.h
  - centralized configuration values
  - baud rate
  - EEPROM addresses
  - patch counts
  - display timing constants

- src/pins.h
  - hardware pin assignments

- src/enc4094.h
  - CD4094/SIPO bit mapping

- src/effects.h
  - patch display data
  - split into two sections:
    - 24 customizable patches stored in EEPROM
    - 8 built-in FV1-style patches stored in PROGMEM
  - supports a compile-time define: DISABLE_BUILTIN_PATCHES

## Important implementation decisions

### Agreed host-side EEPROM programming protocol

The serial interface is a minimal command/response protocol where the computer is the smarter side and the Arduino is the executor.

The protocol is line-oriented ASCII over the existing serial port. Every command is newline-terminated and gets a response.

Commands:

- `PING`
- `DUMP <idx>`
- `WRITE <idx> <start> <len> <hex bytes...>`

Arduino-originated informational lines:

- `PRINT <message>`

EEPROM indexes:

- `0`: Arduino internal EEPROM
- `1`: external EEPROM 0
- `2`: external EEPROM 1
- `3`: external EEPROM 2

`DUMP <idx>` replaces separate commands such as dump config, read internal EEPROM, dump external EEPROM, and read external EEPROM. It should dump the full selected EEPROM as hex-encoded chunks. The `DATA <start> <len>` lines let the host piece together the image and detect missing, duplicated, or out-of-order chunks:

- `OK <total-bytes>`
- `DATA <start> <len> <hex bytes...>`
- repeated `DATA` lines as needed
- `END`

Dump chunks should contain up to 32 data bytes.

`WRITE <idx> <start> <len> <hex bytes...>` replaces setting writes, custom effect list writes, internal EEPROM writes, and external EEPROM writes. Settings are written by raw internal EEPROM address, for example:

- `WRITE 0 768 1 0C` writes the saved patch byte
- `WRITE 0 769 1 01` writes the momentary mode byte
- `WRITE 0 770 1 04` writes display bias
- `WRITE 0 771 1 55` writes display contrast

`start` and `len` are decimal integers. Payload bytes are two-digit hexadecimal bytes. Successful writes respond with `OK <bytes-written>`.

The host is responsible for knowing the EEPROM map, protecting against accidental overwrites, and splitting external EEPROM writes on page boundaries. The Arduino should still do basic validation:

- supported `idx`
- nonzero write length
- write length no greater than the configured maximum of 30 bytes
- exact number of hex bytes
- address range fits inside the selected EEPROM
- external EEPROM writes do not cross a 32-byte page boundary

The firmware uses a 128-byte protocol input line buffer. The 30-byte maximum write size is chosen because the `24LC32A` has 32-byte pages, the standard AVR Arduino `Wire` transmit buffer is 32 bytes total, and external EEPROM writes consume two buffer bytes for the target memory address before data bytes. The same write limit is used for internal EEPROM for host-side consistency.

Arduino output line prefixes:

- `OK`
- `OK <bytes-written>`
- `PRINT <message>`
- `ERR BAD_COMMAND`
- `ERR BAD_IDX`
- `ERR BAD_RANGE`
- `ERR BAD_LEN`
- `ERR BAD_HEX`
- `ERR PAGE_CROSS`
- `ERR WRITE_FAILED`

The Arduino can write to the three external EEPROMs over the shared I2C bus using `Wire`. Target selection is handled through the existing CD4094-controlled EEPROM `A0` lines. `Wire` is not initialized at boot; external EEPROM operations temporarily call `Wire.begin()` after entering upload/access mode, set a 25 ms Wire timeout with reset-on-timeout enabled, and call `Wire.end()` before restoring normal FV-1 control state.

`PRINT <message>` is reserved for human-readable informational/debug output from the Arduino to the host. The host should treat it as an asynchronous informational line, not as command success or failure. Messages must be single-line text; replace embedded carriage returns or newlines before sending.

### EEPROM-backed patches and settings

The firmware now uses EEPROM for more than simple settings:

- custom patch text for the first 24 patch slots is stored in EEPROM
- favorite patch selection is stored in EEPROM
- momentary/toggle mode is stored in EEPROM
- display bias/contrast values are stored in EEPROM

Display bias and contrast calibration now use the serial protocol by writing raw bytes to `BIASADDR` and `CONTRASTADDR` through `WRITE 0`.

The EEPROM address map is centralized in src/config.h.

### Built-in patches and custom patches

The effect list is intentionally split into two kinds of patches:

- Custom patches: first 24 slots, stored in EEPROM
- Built-in patches: last 8 slots, stored in PROGMEM

This was done so the firmware can support a future host-side programming workflow for custom patch data while still presenting built-in FV1-style patch names.

### Built-in patch disable switch

The compile-time define DISABLE_BUILTIN_PATCHES can be enabled to hide the last 8 built-in patches and expose only the first 24 customizable slots.

### Display rendering

The LCD renderer reads the selected patch text from either EEPROM or PROGMEM depending on the patch index. The logic is handled through helper functions defined in src/effects.h.

### Footswitch handling

The footswitch input is interrupt-driven but the ISR only sets a pending flag. The actual state transition is processed in the main loop after a debounce interval. This keeps the ISR short and reduces the risk of timing issues.

## Current hardware assumptions

The project targets:

- Arduino Pro Mini 3.3 V / 8 MHz
- ATmega328P
- Nokia 5110-style display
- CD4094 shift register
- rotary encoder with switch
- footswitch input
- relay output

Confirmed external EEPROM wiring/design notes:

- The external EEPROM chips are `24LC32A`.
- The existing CD4094 EEPROM-enable outputs drive the external EEPROM `A0` address pins.
- EEPROM selection is active-low: the selected EEPROM has `A0 LOW`; the other EEPROMs have `A0 HIGH`.
- The external EEPROM `A1` pins should remain grounded and are not planned to use Arduino GPIO.
- The external EEPROM `A2` pins are grounded.
- The Arduino is expected to read/write the external EEPROMs over I2C.
- Arduino SDA/SCL are wired to the same I2C bus used by the FV-1 and external EEPROMs.
- SDA/SCL are believed to be pulled up to 3.3 V with 10k resistors.
- Relay `LOW` means bypassed, so the pedal passes unprocessed sound when powered off.
- Upload mode should not require three new Arduino select pins because the CD4094 already controls the three EEPROM `A0` lines.

Agreed external EEPROM upload sequence:

- save current bypass, T0, S0, S1, S2, and EEPROM A0-select state
- force pedal bypass by driving relay state LOW
- set FV-1 `T0 LOW` to select internal program mode
- lock or ignore S0/S1/S2 changes while upload is active
- select the requested external EEPROM by setting its `A0 LOW` and the other EEPROM `A0` lines HIGH
- perform the Arduino I2C dump/write
- restore previous bypass, T0, S0, S1, S2, and EEPROM A0-select state

Current FV-1 EEPROM-bus operating assumption:

- The FV-1 is not expected to continuously read the external EEPROM.
- It loads one selected 512-byte program into its internal control store, then executes from that internal memory.
- It reads external EEPROM when the external program selection changes.
- Changing `S0`/`S1`/`S2` or switching internal/external selection can trigger a program copy into internal memory.
- If no program change occurs, or if the FV-1 is in internal-ROM mode, in-circuit EEPROM programming is expected to be acceptable.
- This assumption is based on Spin architecture documentation and Spin forum guidance, but should still be verified on the physical hardware.

Open hardware questions:

- confirm exact SDA/SCL pull-up values; current expectation is 10k to 3.3 V
- confirm on hardware that `T0 LOW` plus locked `S0`/`S1`/`S2` prevents FV-1 external EEPROM access during upload

## Current build environment

The project uses PlatformIO.

Main environment:

- env: pro8MHzatmega328
- platform: atmelavr
- board: pro8MHzatmega328
- framework: arduino

Dependencies:

- MultiButton
- Adafruit PCD8544 Nokia 5110 LCD library

## Build and flash commands

From the repository root:

- Build:
  - pio run
- Upload:
  - pio run --target upload

Test commands:

- Native protocol helper tests:
  - pio test -e native -f test_protocol_utils
- Unity protocol helper tests:
  - pio test -e pro8MHzatmega328 -f test_protocol_utils
- Unity protocol helper compile-only check:
  - pio test -e pro8MHzatmega328 -f test_protocol_utils --without-uploading --without-testing
- Host-side serial protocol smoke test:
  - python3 test/host/protocol_smoke_test.py --port /dev/ttyUSB0
- PlatformIO VS Code sidebar custom targets:
  - Test: Native Protocol Utils
  - Test: Protocol Utils Build
  - Test: Protocol Utils
  - Test: Host Protocol Smoke

The project has been built successfully with PlatformIO.

The test layout is split intentionally:

- test/test_protocol_utils contains PlatformIO/Unity firmware tests for pure protocol helper logic.
- test/host contains Python/pyserial smoke tests that talk to the already-flashed normal firmware over serial.
- env:native runs the pure protocol helper Unity tests locally without uploading to Arduino hardware.

## Current known state

The firmware is a working prototype with the following implemented behaviors:

- encoder-based patch selection
- favorite-patch save/restore
- momentary/toggle mode for bypass handling
- interrupt-driven footswitch input with debounce
- SIPO output updates for FV1 control lines
- LCD rendering with patch labels and status markers
- EEPROM-backed custom patch text and settings
- built-in patch list separated from custom patch data
- serial protocol parsing for `PING`, `DUMP`, and `WRITE`
- internal Arduino EEPROM dump/write support through protocol index `0`
- external `24LC32A` EEPROM dump/write support through protocol indexes `1`, `2`, and `3`

## Important cautions

- The firmware is still a prototype and has not been validated against a full hardware setup beyond the implemented firmware logic.
- The EEPROM layout is centralized and should be changed carefully to avoid overlap.
- The patch data is stored as a compact string table and is not yet a formal structured patch format.
- The agreed host-side programming protocol intentionally exposes raw EEPROM addresses to the host. Keep the host-side EEPROM map aligned with config.h.
- External EEPROM writing depends on hardware-level chip selection or bus isolation. Do not assume three same-address EEPROMs can be selected in software alone.

## Suggested next directions

The codebase is in a good state for the next iteration, which could include:

- hardware-testing the completed `PING`, `DUMP`, and `WRITE` serial protocol
- a formal patch-data format instead of string-table text
- more robust validation of patch data before writing to EEPROM
- more complete hardware testing on the physical controller

## Notes for future agents

When editing this project:

- preserve the modular structure
- keep hardware constants in config.h and pins.h
- keep EEPROM addresses centralized in config.h
- prefer small, localized changes over large rewrites
- validate with PlatformIO after edits
- keep documentation and this AGENTS file aligned with the implementation
