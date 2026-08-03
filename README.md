# FV1 Controller

This repository contains firmware for an Arduino Pro Mini 3.3 V / ATmega328P board that acts as a controller for an FV1 multi-effects pedal.

## Objective

The project implements a compact hardware controller that lets the user:

- switch the FV1 pedal in and out of bypass
- select among a set of FV1 patch slots with a rotary encoder
- store and recall a favorite patch
- show patch information on a small LCD screen
- expose a clear separation between runtime control logic, hardware pin mapping, and display data

The firmware is intended as a practical prototype for controlling the FV1 from a small external controller rather than as a finished commercial product.

## Current implementation

The firmware is organized into a small set of modules:

- main.cpp: firmware entry point, setup, and main loop
- input_handler.cpp/.h: rotary encoder handling, encoder-button behavior, EEPROM-backed settings, and serial calibration helpers
- sipo_handler.cpp/.h: shift-register output updates, relay control, and footswitch handling
- display_handler.cpp/.h: LCD drawing, patch-name rendering, and backlight timeout behavior
- controller_state.{h,cpp}: shared runtime state such as the selected program, relay state, and the SIPO output cache
- config.h: baud rate, EEPROM addresses, patch counts, and display constants
- pins.h: hardware pin assignments
- enc4094.h: CD4094/SIPO bit mapping used by the FV1 control lines
- effects.h: patch text data, split between EEPROM-backed custom patches and PROGMEM-backed built-in FV1-style patches

## Hardware model

The controller targets a simple AVR-based hardware layout:

- rotary encoder for program selection
- encoder button for mode changes and favorite-patch actions
- footswitch input for bypass behavior
- relay output for the bypass path
- CD4094 shift register to expand the available output bits for:
  - relay control
  - FV1 program-select lines
  - EEPROM-enable lines
- Nokia 5110-style LCD for basic patch feedback

The firmware assumes an Arduino Pro Mini 3.3 V / 8 MHz board and uses the Arduino framework for AVR.

## Behavior

### Program selection

The rotary encoder changes the selected patch index. The selected value is clamped to the available patch range.

### Mode handling

The encoder button supports three behaviors:

- single click: toggles momentary/toggle mode for the bypass footswitch
- long click: stores the current patch as the favorite patch in EEPROM
- double click: restores the favorite patch

### Bypass control

The footswitch input is handled through an interrupt-driven path with debounce. The main loop updates the relay state after the interrupt is processed, so the ISR stays short and the firmware remains responsive.

### Display output

The LCD shows:

- a compact header with bypass mode indicator
- a star when the current program is the favorite patch
- the current patch number
- display text for the selected patch

The patch text is split into two categories:

- the first 24 slots are customizable patches and are stored in EEPROM
- the last 8 slots are built-in FV1-style patches and are stored in PROGMEM

A compile-time define, DISABLE_BUILTIN_PATCHES, can be used to hide the built-in patches and expose only the customizable slots.

## EEPROM usage

The firmware uses EEPROM for:

- the favorite patch index
- the stored momentary/toggle mode
- display bias and contrast settings
- custom patch text for the first 24 patch slots

The EEPROM address map is centralized in config.h to keep the layout explicit and avoid accidental overlap.

## Serial support

The firmware uses serial communication for debugging and calibration helpers. It currently supports:

- changing display bias with a serial command
- changing display contrast with a serial command

The serial baud rate is configured centrally in config.h.

## Build and flash

This project uses PlatformIO.

1. Install PlatformIO.
2. Build the firmware from the repository root:
   - pio run
3. Upload it to the board:
   - pio run --target upload

## Notes on status

The firmware is a functional prototype rather than a production design. The core control flow, display behavior, and EEPROM/PROGMEM patch handling are implemented and verified by compilation, but the system has not been validated on a complete hardware setup beyond the firmware-level implementation.

## Project structure

- include/: empty project include folder retained by PlatformIO
- lib/: empty project library folder retained by PlatformIO
- src/: firmware sources and headers
- test/: placeholder test folder
