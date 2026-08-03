# FV1 Controller

This repository contains firmware for an Arduino Pro Mini 3.3 V board that acts as a controller for an FV1 multi-effects pedal.

## Overview

The controller is designed to:

- switch the pedal in and out of bypass
- select between FV1 programs using a rotary encoder
- persist a favorite patch in EEPROM
- drive the required FV1 control lines through a CD4094 shift register
- show basic patch information on a Nokia 5110 LCD

## Current functionality

Implemented in the firmware:

- rotary encoder-based program selection
- encoder button handling for mode changes and saving favorites
- bypass control through a footswitch input and relay output
- SIPO output handling for FV1 program selection and EEPROM enables
- EEPROM persistence for the last/favorite patch
- basic LCD initialization and rendering

## Hardware notes

The project targets a compact Arduino-based controller with:

- an input side for the rotary encoder, encoder button, and footswitch
- a display for patch feedback
- a CD4094 shift register to expand the available output lines for:
  - relay control
  - FV1 program select lines
  - EEPROM chip enables

## Software structure

The firmware has been organized into separate modules for clarity:

- main.cpp: firmware entry point and main loop
- input_handler: encoder, button, EEPROM, and calibration handling
- sipo_handler: shift-register update and output sequencing
- display_handler: LCD drawing and backlight control
- controller_state: shared runtime state
- config.h, pins.h, and enc4094.h: shared constants and hardware mappings

## Building and flashing

This project uses PlatformIO.

1. Install PlatformIO.
2. From the repository root, build the firmware:
   - pio run
3. Upload it to the board:
   - pio run --target upload

## Status

This is a functional prototype rather than a finished production build. The core control logic is present, but the display content is still basic and should be expanded with real FV1 patch metadata in a future iteration.
