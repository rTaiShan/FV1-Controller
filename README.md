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
- input_handler.cpp/.h: rotary encoder handling, encoder-button behavior, and EEPROM-backed settings
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

### Confirmed wiring notes

The current known wiring model is:

- The Arduino drives a CD4094 shift register using `SIPOSTROBEPIN`, `SIPODATAPIN`, and `SIPOCLOCKPIN`.
- The CD4094 output bits control the bypass relay, FV-1 program/source selection lines, and the external EEPROM address-select lines.
- `T0INDEX` controls the FV-1 external/internal program source. The current design assumes `T0 LOW` selects FV-1 internal programs and `T0 HIGH` selects external EEPROM programs.
- `S0INDEX`, `S1INDEX`, and `S2INDEX` control the FV-1 program-select bits.
- `EEPROMENABLE0INDEX`, `EEPROMENABLE1INDEX`, and `EEPROMENABLE2INDEX` control the `A0` address pin on the three external `24LC32A` EEPROM chips.
- The external EEPROM `A0` controls are active-low in the current firmware: the selected EEPROM has `A0 LOW`, and the other EEPROMs have `A0 HIGH`.
- The external EEPROM `A1` pins should remain grounded. They are not planned to be connected to Arduino GPIO.
- The external EEPROM `A2` pins are grounded.
- The Arduino is expected to use I2C to read/write the external `24LC32A` EEPROMs.
- Arduino SDA/SCL are wired to the same I2C bus used by the FV-1 and external EEPROMs.
- SDA/SCL are believed to be pulled up to 3.3 V with 10k resistors.
- The relay is active-high for effect mode and active-low for bypass. Relay `LOW` should bypass the effect so the pedal still passes unprocessed sound when powered off.

With the expected `24LC32A` address wiring, the selected external EEPROM is accessed at the FV-1-compatible base address while its `A0` line is low. During upload/programming, the Arduino should select the target EEPROM by temporarily driving only that EEPROM's `A0` low through the CD4094.

Current FV-1 EEPROM-bus operating assumption:

- The FV-1 is not expected to continuously read the external EEPROM.
- The FV-1 loads one selected 512-byte program into its internal control store, then executes from that internal memory.
- The FV-1 is expected to read external EEPROM when the external program selection changes.
- Changing `S0`/`S1`/`S2` or switching internal/external selection can trigger the FV-1 to copy a selected program into internal memory.
- If no program change occurs, or if the FV-1 is in internal-ROM mode, in-circuit EEPROM programming is expected to be acceptable.

This assumption comes from Spin architecture documentation and Spin forum guidance, but it should still be verified on the actual hardware.

Open hardware questions:

- Confirm the exact SDA/SCL pull-up values; current expectation is 10k to 3.3 V.
- Confirm on hardware that `T0 LOW` plus locked `S0`/`S1`/`S2` prevents FV-1 external EEPROM access during upload.

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

The firmware exposes a minimal command/response EEPROM programming protocol. The host computer is expected to be the smarter side of the system: it owns address-map knowledge, protects against accidental overwrites, splits external EEPROM writes on page boundaries, and sends small write commands to the Arduino. Display bias and contrast calibration are handled by writing raw bytes to `BIASADDR` and `CONTRASTADDR` through `WRITE 0`.

The Arduino parses commands, performs basic mechanical validation, executes the requested EEPROM operation, and responds with success or an error.

### Agreed EEPROM programming protocol

The protocol is line-oriented ASCII over the existing serial port. Each command is sent as one newline-terminated line. The Arduino responds to every command.

Supported commands:

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

`PING` verifies that the controller is present.

Example:

```text
PING
```

Example response:

```text
OK FV1_CONTROLLER
```

`DUMP <idx>` dumps the full contents of the selected EEPROM. This replaces separate commands such as dump config, read internal EEPROM, dump external EEPROM, and read external EEPROM. The host can extract settings, custom effect text, or external EEPROM images from the returned dump.

Examples:

```text
DUMP 0
DUMP 1
```

The dump response must be hex encoded instead of raw binary so the host can parse it reliably even when EEPROM bytes contain control characters. The response uses `DATA <start> <len>` lines so the host can piece together the image and detect missing, duplicated, or out-of-order chunks:

```text
OK <total-bytes>
DATA <start> <len> <hex bytes...>
DATA <start> <len> <hex bytes...>
END
```

Dump chunks should contain up to 32 data bytes. This matches the `24LC32A` page size and remains practical for line-oriented hex output.

`WRITE <idx> <start> <len> <hex bytes...>` writes bytes to the selected EEPROM. This single command replaces separate setting writes, internal EEPROM writes, custom effect list writes, and external EEPROM writes.

`start` and `len` are parsed as decimal integers. Payload bytes are parsed as two-digit hexadecimal bytes.

Examples:

```text
WRITE 0 770 1 04
WRITE 0 771 1 55
WRITE 0 768 1 0C
WRITE 0 769 1 01
WRITE 0 128 3 42 AA 00
WRITE 3 512 16 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
```

Those examples write display bias, display contrast, saved patch, momentary mode, three custom internal EEPROM bytes, and sixteen bytes to the third external EEPROM.

On success, `WRITE` responds with the number of bytes written:

```text
OK <bytes-written>
```

The Arduino uses a 128-byte protocol input line buffer and accepts a maximum write length of 30 bytes per command. This value is intentionally smaller than the 32-byte `24LC32A` page size because the standard AVR Arduino `Wire` transmit buffer is 32 bytes total, and an external EEPROM write transaction must include two memory-address bytes before the data bytes. A 30-byte write also keeps the ASCII command line comfortably below 128 bytes and preserves SRAM on the ATmega328P.

The same 30-byte maximum should apply to internal and external EEPROM writes so host behavior stays uniform.

The Arduino validates that:

- `idx` is in the supported range
- `len` is nonzero and no greater than the configured maximum
- the number of hex bytes matches `len`
- `start + len` fits inside the selected EEPROM
- external EEPROM writes do not cross a 32-byte page boundary

The host should handle EEPROM page splitting for external EEPROM writes. For example, if an external EEPROM has 32-byte pages, a write beginning at address 30 with length 4 must be split by the host:

```text
WRITE 1 30 2 AA BB
WRITE 1 32 2 CC DD
```

The Arduino must reject page-crossing external writes with `ERR PAGE_CROSS` instead of silently allowing page wraparound.

Arduino output line prefixes:

```text
OK
OK <bytes-written>
PRINT <message>
ERR BAD_COMMAND
ERR BAD_IDX
ERR BAD_RANGE
ERR BAD_LEN
ERR BAD_HEX
ERR PAGE_CROSS
ERR WRITE_FAILED
```

The raw internal EEPROM address map remains in `config.h`. With the current layout:

- saved patch is at `SAVEDPATCHADDR`
- momentary/toggle mode is at `MOMENTARYMODEADDR`
- display bias is at `BIASADDR`
- display contrast is at `CONTRASTADDR`
- custom effect text occupies the EEPROM area before `EEPROM_CONFIG_BASE`

The host may write these raw addresses directly. The firmware does not need semantic commands such as `SET BIAS`; those are host-side conveniences if an editor application wants to expose them.

The Arduino can write to the external EEPROMs over the shared I2C bus using the `Wire` library. Selection of the target EEPROM is handled through the existing CD4094-controlled `A0` lines. `Wire` is not initialized at boot; external EEPROM operations temporarily call `Wire.begin()` after entering upload/access mode, set a 25 ms Wire timeout with reset-on-timeout enabled, and call `Wire.end()` before restoring normal FV-1 control state.

`PRINT <message>` is reserved for human-readable informational/debug output from the Arduino to the host. The host should treat it as an asynchronous informational line and should not interpret it as command success or failure. Messages must be single-line text; any carriage returns or newlines in the message should be replaced before transmission.

The current agreed wiring uses the existing CD4094 EEPROM-enable outputs to drive the external EEPROM `A0` pins. During upload mode, the firmware selects the requested external EEPROM by setting only that EEPROM's `A0` low and the other external EEPROM `A0` pins high. The external EEPROM `A1` pins should stay grounded and are not part of upload control.

Before external EEPROM reads or writes, the firmware temporarily puts the FV-1 into a state where it is not expected to access the external EEPROM bus:

```text
1. Save the current bypass, T0, S0, S1, S2, and EEPROM A0-select state.
2. Force the pedal into bypass by driving the relay state LOW.
3. Set FV-1 T0 LOW to select internal program mode.
4. Lock or ignore S0/S1/S2 changes while the upload operation is active.
5. Select the requested external EEPROM by driving its A0 LOW and the other EEPROM A0 pins HIGH.
6. Perform the Arduino I2C dump/write operation.
7. Restore the previous bypass, T0, S0, S1, S2, and EEPROM A0-select state.
```

The serial baud rate is configured centrally in config.h.

## Build and flash

This project uses PlatformIO.

1. Install PlatformIO.
2. Build the firmware from the repository root:
   - pio run
3. Upload it to the board:
   - pio run --target upload

## Testing

See `TEST_PLAN.md` for the step-by-step validation plan. It includes native and AVR PlatformIO Unity tests, the `test/host/protocol_smoke_test.py` Python/pyserial protocol test script, and a manual hardware checklist for LCD, favorite patch, footswitch, relay, SIPO, FV-1, and external EEPROM behavior.

## Notes on status

The firmware is a functional prototype rather than a production design. The core control flow, display behavior, and EEPROM/PROGMEM patch handling are implemented and verified by compilation, but the system has not been validated on a complete hardware setup beyond the firmware-level implementation.

## Project structure

- include/: empty project include folder retained by PlatformIO
- lib/: empty project library folder retained by PlatformIO
- src/: firmware sources and headers
- test/: PlatformIO Unity tests and host-side protocol smoke tests
