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
  - serial calibration helpers for display bias/contrast

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

### EEPROM-backed patches and settings

The firmware now uses EEPROM for more than simple settings:

- custom patch text for the first 24 patch slots is stored in EEPROM
- favorite patch selection is stored in EEPROM
- momentary/toggle mode is stored in EEPROM
- display bias/contrast values are stored in EEPROM

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

The project has been built successfully with PlatformIO.

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

## Important cautions

- The firmware is still a prototype and has not been validated against a full hardware setup beyond the implemented firmware logic.
- The EEPROM layout is centralized and should be changed carefully to avoid overlap.
- The patch data is stored as a compact string table and is not yet a formal structured patch format.
- If future work introduces a host-side programming protocol, the EEPROM layout and patch serialization format should be considered carefully.

## Suggested next directions

The codebase is in a good state for the next iteration, which could include:

- a host-side serial protocol to upload/edit custom patches
- a formal patch-data format instead of string-table text
- support for writing to external EEPROM devices used by the FV1
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
