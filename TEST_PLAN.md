# FV1 Controller Test Plan

This plan is split into two parts:

- automated serial protocol tests run from a host computer
- manual hardware tests for display, encoder, footswitch, relay, SIPO, FV-1, and external EEPROM behavior

The automated tests are good at proving command parsing, response shapes, EEPROM byte persistence, bounds checks, and timeout/error behavior. They cannot fully prove the user-facing controller behavior, because several important outcomes are physical: LCD contents, relay state, FV-1 program selection, and whether the FV-1 stays off the I2C bus during upload.

## Before Testing

1. Build and upload the firmware:

   ```sh
   pio run --target upload
   ```

2. Identify the serial port.

   Common examples:

   ```text
   /dev/ttyUSB0
   /dev/ttyACM0
   COM3
   ```

3. Use the configured baud rate from `src/config.h`.

   Current value:

   ```text
   57600
   ```

4. Start with a known hardware setup:

   - Arduino powered at 3.3 V
   - serial adapter connected at 3.3 V logic level
   - LCD connected
   - rotary encoder connected
   - footswitch connected
   - CD4094 connected
   - external EEPROMs connected only for the external EEPROM tests

5. Treat EEPROM writes as destructive.

   The automated protocol test should dump and save original bytes before writing, then restore them before exiting. If a test is interrupted, use the saved dump to restore changed addresses manually.

## Part 1: Automated Serial Protocol Tests

### PlatformIO Unity Tests

The project includes Unity tests for protocol validation helpers:

```text
test/test_protocol_utils/test_main.cpp
```

Run them locally without uploading:

```sh
pio test -e native -f test_protocol_utils
```

Run them with PlatformIO:

```sh
pio test -e pro8MHzatmega328 -f test_protocol_utils
```

Compile the Unity test firmware without uploading to a board:

```sh
pio test -e pro8MHzatmega328 -f test_protocol_utils --without-uploading --without-testing
```

In the PlatformIO VS Code sidebar, use:

- `Test: Native Protocol Utils` to run the protocol Unity tests locally on the host.
- `Test: Protocol Utils Build` to compile the Unity test firmware without a board.
- `Test: Protocol Utils` to upload and run the Unity test firmware on the board.

These tests cover decimal parsing, hex byte parsing, EEPROM index validation, address-range checks, and external EEPROM page-crossing detection. They are firmware-level unit tests and do not replace the host serial smoke test below.

Good native-test candidates in the current codebase:

- `src/protocol_utils.h`: already native-tested; pure parsing/range/page validation.
- rotary encoder state transitions: good candidate after extracting the table/state transition from `digitalRead()`.
- favorite patch defaulting: good candidate after extracting the EEPROM byte-to-selected-patch rule from `EEPROM.read()`.
- SIPO patch-to-output mapping: good candidate after extracting selected-program-to-`T0`/`S0`/`S1`/`S2`/EEPROM-enable logic from `updateSipoData()`.
- protocol command parsing: good candidate after separating token parsing/validation from `Serial`, `EEPROM`, and `Wire` side effects.

### Host Smoke Test Script

The project includes a Python smoke-test script:

```text
test/host/protocol_smoke_test.py
```

Recommended dependencies:

```sh
python3 -m pip install pyserial
```

Run internal protocol tests:

```sh
python3 test/host/protocol_smoke_test.py --port /dev/ttyUSB0
```

In the PlatformIO VS Code sidebar, use `Test: Host Protocol Smoke`. This target reads the serial port from `monitor_port` first, then `upload_port`, in `platformio.ini`.

Run internal protocol tests plus connected external EEPROM tests:

```sh
python3 test/host/protocol_smoke_test.py --port /dev/ttyUSB0 --external 1
```

Run missing/unresponsive external EEPROM tests only when that EEPROM is intentionally disconnected:

```sh
python3 test/host/protocol_smoke_test.py --port /dev/ttyUSB0 --test-missing-external 1
```

The script does the following:

1. Open the serial port.
2. Wait briefly for the Arduino to reset after serial open.
3. Flush stale input.
4. Send one newline-terminated command at a time.
5. Ignore asynchronous `PRINT <message>` lines while waiting for command responses.
6. Fail the test if no terminal response arrives before timeout.
7. For `DUMP`, collect all `DATA` lines until `END`.
8. Validate every response line shape.
9. Save a pre-test internal EEPROM dump.
10. Restore every byte it modifies before exiting.

### Response Parsing Rules

The test script should recognize these terminal responses:

```text
OK FV1_CONTROLLER
OK <bytes-written>
OK <total-bytes>
ERR BAD_COMMAND
ERR BAD_IDX
ERR BAD_RANGE
ERR BAD_LEN
ERR BAD_HEX
ERR PAGE_CROSS
ERR WRITE_FAILED
END
```

For `DUMP`, `OK <total-bytes>` starts a multi-line response and `END` terminates it.

For `WRITE`, `OK <bytes-written>` is terminal.

For malformed commands, `ERR ...` is terminal.

### Automated Test Steps

#### A. Connection and Parser Smoke Tests

1. Send:

   ```text
   PING
   ```

   Expect:

   ```text
   OK FV1_CONTROLLER
   ```

2. Send:

   ```text
   PING extra
   ```

   Expect:

   ```text
   ERR BAD_COMMAND
   ```

3. Send:

   ```text
   dump 0
   ```

   Expect:

   ```text
   ERR BAD_COMMAND
   ```

4. Send an empty line.

   Expect no response.

#### B. Internal EEPROM Dump Tests

1. Send:

   ```text
   DUMP 0
   ```

2. Expect first line:

   ```text
   OK 1024
   ```

3. Collect `DATA` lines until:

   ```text
   END
   ```

4. Validate:

   - total reconstructed bytes equal `1024`
   - each `DATA <start> <len>` line has exactly `len` hex bytes
   - chunk lengths are no greater than `32`
   - chunks are contiguous and non-overlapping
   - each hex byte is two hex digits

5. Save this dump as the internal EEPROM backup for the rest of the test.

#### C. Internal EEPROM Write Tests

Use an internal scratch address and restore it afterward. Address `760` is currently before `EEPROM_CONFIG_BASE`, so it is custom-effect text space; the test must save and restore the original byte.

1. From the internal dump, store original byte at address `760`.

2. Send:

   ```text
   WRITE 0 760 1 A5
   ```

   Expect:

   ```text
   OK 1
   ```

3. Send:

   ```text
   DUMP 0
   ```

   Expect byte `760` to be `A5`.

4. Restore the original byte:

   ```text
   WRITE 0 760 1 <original-byte>
   ```

   Expect:

   ```text
   OK 1
   ```

5. Verify with another `DUMP 0`.

#### D. Internal Settings Write Tests

These tests prove that raw setting addresses can be written. They should restore original values afterward.

Current addresses:

```text
SAVEDPATCHADDR = 768
MOMENTARYMODEADDR = 769
BIASADDR = 770
CONTRASTADDR = 771
```

1. Store original bytes at addresses `768`, `769`, `770`, and `771` from the internal dump.

2. Send:

   ```text
   WRITE 0 770 1 04
   ```

   Expect:

   ```text
   OK 1
   ```

3. Send:

   ```text
   WRITE 0 771 1 55
   ```

   Expect:

   ```text
   OK 1
   ```

4. Send:

   ```text
   WRITE 0 768 1 FF
   ```

   Expect:

   ```text
   OK 1
   ```

   This writes the erased favorite-patch value. The automated script can verify that the byte was written, but the actual default-to-patch-0 behavior is verified manually after reboot.

5. Restore original bytes:

   ```text
   WRITE 0 768 4 <saved> <mode> <bias> <contrast>
   ```

6. Verify restored bytes with `DUMP 0`.

#### E. Parser Error Tests

1. Invalid EEPROM index:

   ```text
   DUMP 4
   ```

   Expect:

   ```text
   ERR BAD_IDX
   ```

2. Malformed decimal:

   ```text
   WRITE 0 abc 1 AA
   ```

   Expect:

   ```text
   ERR BAD_RANGE
   ```

3. Zero write length:

   ```text
   WRITE 0 128 0
   ```

   Expect:

   ```text
   ERR BAD_LEN
   ```

4. Write length greater than max:

   ```text
   WRITE 0 128 31 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
   ```

   Expect:

   ```text
   ERR BAD_LEN
   ```

5. Malformed hex:

   ```text
   WRITE 0 128 3 42 ZZ 00
   ```

   Expect:

   ```text
   ERR BAD_HEX
   ```

6. Too few hex bytes:

   ```text
   WRITE 0 128 3 42 AA
   ```

   Expect:

   ```text
   ERR BAD_HEX
   ```

7. Too many hex bytes:

   ```text
   WRITE 0 128 3 42 AA 00 FF
   ```

   Expect:

   ```text
   ERR BAD_LEN
   ```

8. Internal range overflow:

   ```text
   WRITE 0 1023 2 AA BB
   ```

   Expect:

   ```text
   ERR BAD_RANGE
   ```

9. Overlong line:

   Send a command line longer than `127` characters before the newline.

   Expect:

   ```text
   ERR BAD_LEN
   ```

#### F. External EEPROM Tests

Run these only when at least one external `24LC32A` is connected and selectable.

1. Choose target index `1`, `2`, or `3`.

2. Send:

   ```text
   DUMP 1
   ```

3. Expect first line:

   ```text
   OK 4096
   ```

4. Validate:

   - total reconstructed bytes equal `4096`
   - each chunk is no greater than `32` bytes
   - chunks are contiguous and non-overlapping
   - response ends with `END`

5. Save this dump as the external EEPROM backup for the selected index.

6. Store original byte at address `0`.

7. Send:

   ```text
   WRITE 1 0 1 AA
   ```

   Expect:

   ```text
   OK 1
   ```

8. Send:

   ```text
   DUMP 1
   ```

   Expect byte `0` to be `AA`.

9. Restore original byte:

   ```text
   WRITE 1 0 1 <original-byte>
   ```

10. Verify restored byte with another `DUMP 1`.

11. Page-crossing write:

   ```text
   WRITE 1 30 4 AA BB CC DD
   ```

   Expect:

   ```text
   ERR PAGE_CROSS
   ```

12. External range overflow:

   ```text
   WRITE 1 4095 2 AA BB
   ```

   Expect:

   ```text
   ERR BAD_RANGE
   ```

#### G. Missing or Stuck External EEPROM Tests

Run this only when it is safe to disconnect or disable the external EEPROM hardware.

1. Power down.
2. Disconnect or disable the selected external EEPROM.
3. Power up.
4. Send:

   ```text
   DUMP 1
   ```

5. Expect a finite response, not a hang:

   ```text
   ERR WRITE_FAILED
   ```

6. Send:

   ```text
   WRITE 1 0 1 AA
   ```

7. Expect:

   ```text
   ERR WRITE_FAILED
   ```

8. Reconnect the EEPROM before continuing.

## Part 2: Manual Hardware Tests

### A. Power-On Sanity

1. Power the pedal/controller normally.
2. Confirm the LCD initializes.
3. Confirm the displayed patch is valid.
4. Confirm the pedal starts in the expected bypass/effect state.
5. Confirm no unexpected serial output appears unless `DEBUG` is enabled.

### B. Favorite Patch Behavior

1. Use the encoder to select patch `5`.
2. Long-click the encoder button to save it as favorite.
3. Confirm the LCD shows the favorite star on patch `5`.
4. Rotate to patch `6`.
5. Confirm the favorite star disappears.
6. Double-click the encoder button.
7. Confirm the selected patch returns to patch `5`.
8. Power-cycle the controller.
9. Confirm the controller restores patch `5`.
10. Use serial to write erased favorite:

    ```text
    WRITE 0 768 1 FF
    ```

11. Power-cycle the controller.
12. Confirm the controller defaults to patch `0`, displayed as patch number `1`.

### C. Momentary and Toggle Mode

1. Single-click the encoder button.
2. Confirm the LCD mode indicator changes between `[M` and `[T`.
3. In toggle mode, press the footswitch once.
4. Confirm the relay toggles state once.
5. Release the footswitch.
6. Confirm the relay does not toggle on release.
7. In momentary mode, press and hold the footswitch.
8. Confirm the relay follows the pressed state.
9. Release the footswitch.
10. Confirm the relay returns to the released state.
11. Power-cycle the controller.
12. Confirm the selected mode persists.

### D. Rotary Patch Selection

1. Rotate one detent clockwise.
2. Confirm the patch number increments by one.
3. Rotate one detent counter-clockwise.
4. Confirm the patch number decrements by one.
5. Rotate below patch `0`.
6. Confirm selection wraps to the last enabled patch.
7. Rotate above the last enabled patch.
8. Confirm selection wraps to patch `0`.
9. Confirm the LCD text changes with the selected patch.

### E. Display Bias and Contrast Calibration

1. Send:

   ```text
   WRITE 0 770 1 04
   ```

2. Confirm the LCD bias changes immediately if the change is visually noticeable.
3. Send:

   ```text
   WRITE 0 771 1 55
   ```

4. Confirm the LCD contrast changes immediately.
5. Power-cycle the controller.
6. Confirm the selected bias/contrast values persist.
7. Restore preferred values using `WRITE 0`.

### F. Custom Patch Text Rendering

1. Dump internal EEPROM:

   ```text
   DUMP 0
   ```

2. Save the current custom patch text bytes before modifying them.
3. Write a simple valid custom patch string near the start of internal EEPROM:

   ```text
   WRITE 0 0 30 54 65 73 74 20 50 61 74 63 68 0A 50 31 0A 50 32 0A 50 33 0A 0A 0A 0A 0A 0A 0A 0A 0A
   ```

   This begins with:

   ```text
   Test Patch
   P1
   P2
   P3
   ```

4. Select patch `0`.
5. Confirm the LCD displays the new text.
6. Write malformed text without enough newlines into a saved/restorable area.
7. Select the affected patch.
8. Confirm the display does not hang or show unrelated memory indefinitely.
9. Restore the original custom patch text bytes from the dump.

### G. External EEPROM Upload Mode

Run this with external EEPROMs connected.

1. Select a custom patch that uses external EEPROM bank `1`.
2. Confirm the effect works before upload.
3. Send:

   ```text
   DUMP 1
   ```

4. During the dump, confirm the relay is forced to bypass.
5. Confirm the controller restores the previous relay/program-selection state after the dump.
6. Press or wiggle the footswitch during another `DUMP 1`.
7. Confirm no delayed bypass toggle happens after the dump finishes.
8. Send a valid external write that modifies a saved/restorable byte:

   ```text
   WRITE 1 0 1 AA
   ```

9. Confirm the response is:

   ```text
   OK 1
   ```

10. Restore the original external EEPROM byte.
11. Confirm normal patch selection still works afterward.

### H. FV-1 Bus Isolation Assumption

This test validates the current assumption that `T0 LOW` plus locked `S0`/`S1`/`S2` keeps the FV-1 from using the EEPROM bus during Arduino upload.

1. Start on a working external FV-1 program.
2. Begin a long external dump:

   ```text
   DUMP 1
   ```

3. Watch for audible glitches, lockups, or unexpected program changes.
4. If available, observe SDA/SCL with a logic analyzer.
5. Confirm the Arduino controls I2C only during the operation.
6. Confirm the FV-1 resumes normal operation afterward.
7. Repeat for indexes `2` and `3`.

### I. Missing EEPROM Timeout

1. Power down.
2. Disconnect one external EEPROM or prevent its `A0` selection from reaching the expected state.
3. Power up.
4. Send:

   ```text
   DUMP 1
   ```

5. Confirm the controller returns:

   ```text
   ERR WRITE_FAILED
   ```

6. Confirm the firmware does not hang.
7. Confirm encoder, display, and footswitch still work afterward.

## Pass Criteria

The firmware passes this plan when:

- `PING` works reliably.
- `DUMP 0` reconstructs exactly `1024` bytes.
- `DUMP 1..3` reconstruct exactly `4096` bytes when matching hardware is connected.
- `WRITE 0` persists bytes and applies bias/contrast/favorite/mode side effects.
- `WRITE 1..3` persists bytes, rejects page-crossing writes, and never hangs on missing hardware.
- malformed commands return the expected `ERR` lines.
- malformed patch text does not hang display rendering.
- erased favorite patch value `0xFF` defaults to patch `0` after reboot.
- upload mode forces bypass and restores the previous state.
- footswitch activity during upload mode does not replay after upload finishes.
- normal encoder, display, relay, and FV-1 behavior still work after protocol operations.
