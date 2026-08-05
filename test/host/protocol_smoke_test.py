#!/usr/bin/env python3
"""Host-side smoke tests for the FV1 Controller serial EEPROM protocol."""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from typing import Callable, Iterable

try:
    import serial
except ImportError:  # pragma: no cover - user environment setup path
    print("FAIL pyserial is not installed. Run: python3 -m pip install pyserial")
    sys.exit(2)


BAUDRATE = 57600
INTERNAL_SIZE = 1024
EXTERNAL_SIZE = 4096
DUMP_CHUNK_MAX = 32
WRITE_MAX_LEN = 30
SCRATCH_ADDR = 760
SAVEDPATCHADDR = 768
MOMENTARYMODEADDR = 769
BIASADDR = 770
CONTRASTADDR = 771


class ProtocolError(RuntimeError):
    pass


@dataclass
class TestResult:
    status: str
    name: str
    detail: str = ""


class Reporter:
    def __init__(self) -> None:
        self.results: list[TestResult] = []

    def pass_(self, name: str, detail: str = "") -> None:
        self._record("PASS", name, detail)

    def warn(self, name: str, detail: str = "") -> None:
        self._record("WARN", name, detail)

    def fail(self, name: str, detail: str = "") -> None:
        self._record("FAIL", name, detail)

    def _record(self, status: str, name: str, detail: str) -> None:
        self.results.append(TestResult(status, name, detail))
        line = f"{status:<4} {name}"
        if detail:
            line += f" - {detail}"
        print(line)

    def summary(self) -> int:
        passed = sum(1 for result in self.results if result.status == "PASS")
        warned = sum(1 for result in self.results if result.status == "WARN")
        failed = sum(1 for result in self.results if result.status == "FAIL")
        print()
        print(f"SUMMARY pass={passed} warn={warned} fail={failed}")
        if failed:
            print()
            print("Failures:")
            for result in self.results:
                if result.status == "FAIL":
                    detail = f": {result.detail}" if result.detail else ""
                    print(f"- {result.name}{detail}")
        if warned:
            print()
            print("Warnings:")
            for result in self.results:
                if result.status == "WARN":
                    detail = f": {result.detail}" if result.detail else ""
                    print(f"- {result.name}{detail}")
        return 1 if failed else 0


class ProtocolClient:
    def __init__(self, port: str, baud: int, timeout: float, echo: bool) -> None:
        self.echo = echo
        self.ser = serial.Serial(port=port, baudrate=baud, timeout=0.1, write_timeout=timeout)
        self.deadline_timeout = timeout

    def close(self) -> None:
        self.ser.close()

    def reset_input(self) -> None:
        self.ser.reset_input_buffer()

    def send_line(self, command: str) -> None:
        if self.echo:
            print(f">>> {command}")
        self.ser.write((command + "\n").encode("ascii"))
        self.ser.flush()

    def read_line(self, timeout: float | None = None) -> str | None:
        deadline = time.monotonic() + (timeout if timeout is not None else self.deadline_timeout)
        while time.monotonic() < deadline:
            raw = self.ser.readline()
            if not raw:
                continue
            line = raw.decode("ascii", errors="replace").strip()
            if self.echo:
                print(f"<<< {line}")
            return line
        return None

    def read_protocol_line(self, timeout: float | None = None) -> str | None:
        deadline = time.monotonic() + (timeout if timeout is not None else self.deadline_timeout)
        while time.monotonic() < deadline:
            line = self.read_line(timeout=max(0.05, deadline - time.monotonic()))
            if line is None:
                return None
            if line.startswith("PRINT "):
                continue
            return line
        return None

    def command(self, command: str, timeout: float | None = None) -> str:
        self.send_line(command)
        line = self.read_protocol_line(timeout)
        if line is None:
            raise ProtocolError(f"timeout waiting for response to {command!r}")
        return line

    def expect_line(self, name: str, command: str, expected: str, reporter: Reporter, timeout: float | None = None) -> bool:
        try:
            actual = self.command(command, timeout)
        except ProtocolError as exc:
            reporter.fail(name, str(exc))
            return False
        if actual != expected:
            reporter.fail(name, f"expected {expected!r}, got {actual!r}")
            return False
        reporter.pass_(name, actual)
        return True

    def expect_no_response(self, name: str, command: str, reporter: Reporter, timeout: float = 0.5) -> bool:
        self.send_line(command)
        line = self.read_protocol_line(timeout)
        if line is not None:
            reporter.fail(name, f"expected no response, got {line!r}")
            return False
        reporter.pass_(name, "no response")
        return True

    def dump(self, idx: int, expected_size: int, reporter: Reporter, name: str, timeout: float | None = None) -> bytearray | None:
        command = f"DUMP {idx}"
        try:
            self.send_line(command)
            first = self.read_protocol_line(timeout)
        except ProtocolError as exc:
            reporter.fail(name, str(exc))
            return None

        if first is None:
            reporter.fail(name, f"timeout waiting for response to {command!r}")
            return None
        if first.startswith("ERR "):
            reporter.fail(name, first)
            return None
        expected_ok = f"OK {expected_size}"
        if first != expected_ok:
            reporter.fail(name, f"expected {expected_ok!r}, got {first!r}")
            return None

        data = bytearray(expected_size)
        seen = [False] * expected_size
        while True:
            line = self.read_protocol_line(timeout)
            if line is None:
                reporter.fail(name, "timeout before END")
                return None
            if line == "END":
                break
            if not line.startswith("DATA "):
                reporter.fail(name, f"expected DATA or END, got {line!r}")
                return None
            try:
                start, payload = parse_data_line(line)
            except ValueError as exc:
                reporter.fail(name, str(exc))
                return None
            if len(payload) > DUMP_CHUNK_MAX:
                reporter.fail(name, f"chunk at {start} is too long: {len(payload)}")
                return None
            if start + len(payload) > expected_size:
                reporter.fail(name, f"chunk at {start} overflows expected size")
                return None
            for offset, value in enumerate(payload):
                address = start + offset
                if seen[address]:
                    reporter.fail(name, f"duplicate byte at address {address}")
                    return None
                data[address] = value
                seen[address] = True

        missing = [i for i, value in enumerate(seen) if not value]
        if missing:
            reporter.fail(name, f"missing {len(missing)} bytes; first missing address {missing[0]}")
            return None

        reporter.pass_(name, f"{len(data)} bytes")
        return data


def parse_data_line(line: str) -> tuple[int, list[int]]:
    tokens = line.split()
    if len(tokens) < 4:
        raise ValueError(f"malformed DATA line: {line!r}")
    if tokens[0] != "DATA":
        raise ValueError(f"not a DATA line: {line!r}")
    try:
        start = int(tokens[1], 10)
        length = int(tokens[2], 10)
    except ValueError as exc:
        raise ValueError(f"malformed DATA start/len: {line!r}") from exc
    hex_tokens = tokens[3:]
    if len(hex_tokens) != length:
        raise ValueError(f"DATA length mismatch at {start}: len={length}, hex_count={len(hex_tokens)}")
    payload: list[int] = []
    for token in hex_tokens:
        if len(token) != 2:
            raise ValueError(f"bad hex byte {token!r} in {line!r}")
        try:
            payload.append(int(token, 16))
        except ValueError as exc:
            raise ValueError(f"bad hex byte {token!r} in {line!r}") from exc
    return start, payload


def hex_byte(value: int) -> str:
    return f"{value & 0xff:02X}"


def hex_bytes(values: Iterable[int]) -> str:
    return " ".join(hex_byte(value) for value in values)


def write_bytes(client: ProtocolClient, idx: int, start: int, values: Iterable[int], timeout: float | None = None) -> str:
    payload = list(values)
    command = f"WRITE {idx} {start} {len(payload)} {hex_bytes(payload)}"
    return client.command(command, timeout)


def restore_bytes(client: ProtocolClient, reporter: Reporter, name: str, idx: int, start: int, values: Iterable[int], timeout: float | None = None) -> bool:
    payload = list(values)
    try:
        response = write_bytes(client, idx, start, payload, timeout)
    except ProtocolError as exc:
        reporter.fail(name, str(exc))
        return False
    expected = f"OK {len(payload)}"
    if response != expected:
        reporter.fail(name, f"expected {expected!r}, got {response!r}")
        return False
    reporter.pass_(name, response)
    return True


def run_case(reporter: Reporter, name: str, test: Callable[[], None]) -> None:
    try:
        test()
    except Exception as exc:  # noqa: BLE001 - top-level test isolation
        reporter.fail(name, f"unexpected exception: {exc}")


def test_connection_and_parser(client: ProtocolClient, reporter: Reporter) -> None:
    client.expect_line("PING", "PING", "OK FV1_CONTROLLER", reporter)
    client.expect_line("PING rejects extra token", "PING extra", "ERR BAD_COMMAND", reporter)
    client.expect_line("lowercase command rejected", "dump 0", "ERR BAD_COMMAND", reporter)
    client.expect_no_response("empty line ignored", "", reporter)


def test_internal_dump(client: ProtocolClient, reporter: Reporter) -> bytearray | None:
    return client.dump(0, INTERNAL_SIZE, reporter, "DUMP 0 reconstructs internal EEPROM")


def test_internal_write_restore(client: ProtocolClient, reporter: Reporter, internal_backup: bytearray) -> None:
    original = internal_backup[SCRATCH_ADDR]
    wrote_scratch = False
    try:
        response = write_bytes(client, 0, SCRATCH_ADDR, [0xA5])
        if response == "OK 1":
            wrote_scratch = True
            reporter.pass_("WRITE 0 scratch byte", response)
        else:
            reporter.fail("WRITE 0 scratch byte", f"expected 'OK 1', got {response!r}")
            return

        after_write = client.dump(0, INTERNAL_SIZE, reporter, "DUMP 0 after scratch write")
        if after_write is not None and after_write[SCRATCH_ADDR] == 0xA5:
            reporter.pass_("scratch byte persisted", f"address {SCRATCH_ADDR}=A5")
        elif after_write is not None:
            reporter.fail("scratch byte persisted", f"address {SCRATCH_ADDR}={hex_byte(after_write[SCRATCH_ADDR])}")
    finally:
        if wrote_scratch:
            restore_bytes(client, reporter, "restore scratch byte", 0, SCRATCH_ADDR, [original])

    restored = client.dump(0, INTERNAL_SIZE, reporter, "DUMP 0 after scratch restore")
    if restored is not None and restored[SCRATCH_ADDR] == original:
        reporter.pass_("scratch byte restored", f"address {SCRATCH_ADDR}={hex_byte(original)}")
    elif restored is not None:
        reporter.fail("scratch byte restored", f"address {SCRATCH_ADDR}={hex_byte(restored[SCRATCH_ADDR])}")


def test_internal_settings_restore(client: ProtocolClient, reporter: Reporter, internal_backup: bytearray) -> None:
    original = [
        internal_backup[SAVEDPATCHADDR],
        internal_backup[MOMENTARYMODEADDR],
        internal_backup[BIASADDR],
        internal_backup[CONTRASTADDR],
    ]

    modified_settings = False
    try:
        checks = [
            ("WRITE 0 applies bias byte", BIASADDR, [0x04]),
            ("WRITE 0 applies contrast byte", CONTRASTADDR, [0x55]),
            ("WRITE 0 accepts erased favorite", SAVEDPATCHADDR, [0xFF]),
        ]
        for name, address, payload in checks:
            response = write_bytes(client, 0, address, payload)
            if response == f"OK {len(payload)}":
                modified_settings = True
                reporter.pass_(name, response)
            else:
                reporter.fail(name, f"expected 'OK {len(payload)}', got {response!r}")

        settings_dump = client.dump(0, INTERNAL_SIZE, reporter, "DUMP 0 after settings writes")
        if settings_dump is not None:
            expected = {BIASADDR: 0x04, CONTRASTADDR: 0x55, SAVEDPATCHADDR: 0xFF}
            for address, value in expected.items():
                actual = settings_dump[address]
                if actual == value:
                    reporter.pass_(f"setting byte {address} persisted", hex_byte(actual))
                else:
                    reporter.fail(f"setting byte {address} persisted", f"expected {hex_byte(value)}, got {hex_byte(actual)}")
    finally:
        if modified_settings:
            restore_bytes(client, reporter, "restore settings bytes", 0, SAVEDPATCHADDR, original)

    restored = client.dump(0, INTERNAL_SIZE, reporter, "DUMP 0 after settings restore")
    if restored is None:
        return
    restored_values = [
        restored[SAVEDPATCHADDR],
        restored[MOMENTARYMODEADDR],
        restored[BIASADDR],
        restored[CONTRASTADDR],
    ]
    if restored_values == original:
        reporter.pass_("settings bytes restored", hex_bytes(original))
    else:
        reporter.fail("settings bytes restored", f"expected {hex_bytes(original)}, got {hex_bytes(restored_values)}")


def test_parser_errors(client: ProtocolClient, reporter: Reporter) -> None:
    cases = [
        ("DUMP rejects idx 4", "DUMP 4", "ERR BAD_IDX"),
        ("WRITE rejects malformed decimal", "WRITE 0 abc 1 AA", "ERR BAD_RANGE"),
        ("WRITE rejects zero length", "WRITE 0 128 0", "ERR BAD_LEN"),
        (
            "WRITE rejects len greater than max",
            f"WRITE 0 128 {WRITE_MAX_LEN + 1} " + " ".join(["00"] * (WRITE_MAX_LEN + 1)),
            "ERR BAD_LEN",
        ),
        ("WRITE rejects malformed hex", "WRITE 0 128 3 42 ZZ 00", "ERR BAD_HEX"),
        ("WRITE rejects too few bytes", "WRITE 0 128 3 42 AA", "ERR BAD_HEX"),
        ("WRITE rejects too many bytes", "WRITE 0 128 3 42 AA 00 FF", "ERR BAD_LEN"),
        ("WRITE rejects internal overflow", "WRITE 0 1023 2 AA BB", "ERR BAD_RANGE"),
    ]
    for name, command, expected in cases:
        client.expect_line(name, command, expected, reporter)

    overlong = "PING " + ("X" * 128)
    client.expect_line("overlong line rejected", overlong, "ERR BAD_LEN", reporter)


def test_external_eeprom(client: ProtocolClient, reporter: Reporter, idx: int) -> None:
    dump_name = f"DUMP {idx} reconstructs external EEPROM"
    external_backup = client.dump(idx, EXTERNAL_SIZE, reporter, dump_name, timeout=15)
    if external_backup is None:
        reporter.warn("external write tests skipped", f"could not dump idx {idx}")
        return

    original = external_backup[0]
    wrote_external = False
    try:
        response = write_bytes(client, idx, 0, [0xAA], timeout=5)
        if response == "OK 1":
            wrote_external = True
            reporter.pass_(f"WRITE {idx} external byte", response)
        else:
            reporter.fail(f"WRITE {idx} external byte", f"expected 'OK 1', got {response!r}")
            return

        after_write = client.dump(idx, EXTERNAL_SIZE, reporter, f"DUMP {idx} after external write", timeout=15)
        if after_write is not None and after_write[0] == 0xAA:
            reporter.pass_("external byte persisted", "address 0=AA")
        elif after_write is not None:
            reporter.fail("external byte persisted", f"address 0={hex_byte(after_write[0])}")
    finally:
        if wrote_external:
            restore_bytes(client, reporter, "restore external byte", idx, 0, [original], timeout=5)

    restored = client.dump(idx, EXTERNAL_SIZE, reporter, f"DUMP {idx} after external restore", timeout=15)
    if restored is not None and restored[0] == original:
        reporter.pass_("external byte restored", f"address 0={hex_byte(original)}")
    elif restored is not None:
        reporter.fail("external byte restored", f"address 0={hex_byte(restored[0])}")

    client.expect_line(
        "external page-crossing write rejected",
        f"WRITE {idx} 30 4 AA BB CC DD",
        "ERR PAGE_CROSS",
        reporter,
    )
    client.expect_line(
        "external range overflow rejected",
        f"WRITE {idx} 4095 2 AA BB",
        "ERR BAD_RANGE",
        reporter,
    )


def test_missing_external(client: ProtocolClient, reporter: Reporter, idx: int) -> None:
    client.expect_line(
        "missing external DUMP fails without hang",
        f"DUMP {idx}",
        "ERR WRITE_FAILED",
        reporter,
        timeout=8,
    )
    client.expect_line(
        "missing external WRITE fails without hang",
        f"WRITE {idx} 0 1 AA",
        "ERR WRITE_FAILED",
        reporter,
        timeout=8,
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run FV1 Controller serial protocol smoke tests.")
    parser.add_argument("--port", required=True, help="Serial port, for example /dev/ttyUSB0 or COM3.")
    parser.add_argument("--baud", type=int, default=BAUDRATE, help=f"Serial baud rate. Default: {BAUDRATE}.")
    parser.add_argument("--timeout", type=float, default=3.0, help="Default serial response timeout in seconds.")
    parser.add_argument("--settle", type=float, default=2.0, help="Seconds to wait after opening serial.")
    parser.add_argument("--external", type=int, choices=[1, 2, 3], help="Run connected external EEPROM tests for index 1, 2, or 3.")
    parser.add_argument(
        "--test-missing-external",
        type=int,
        choices=[1, 2, 3],
        help="Run missing/unresponsive external EEPROM tests for index 1, 2, or 3. Use only when hardware is intentionally disconnected.",
    )
    parser.add_argument("--echo", action="store_true", help="Print raw command and response lines.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    reporter = Reporter()
    client: ProtocolClient | None = None

    try:
        client = ProtocolClient(args.port, args.baud, args.timeout, args.echo)
    except serial.SerialException as exc:
        reporter.fail("open serial port", str(exc))
        return reporter.summary()

    try:
        time.sleep(args.settle)
        client.reset_input()
        reporter.pass_("open serial port", f"{args.port} @ {args.baud}")

        run_case(reporter, "connection/parser smoke tests", lambda: test_connection_and_parser(client, reporter))
        internal_backup = test_internal_dump(client, reporter)
        if internal_backup is None:
            reporter.fail("internal EEPROM dependent tests skipped", "DUMP 0 failed")
        else:
            run_case(reporter, "internal write/restore tests", lambda: test_internal_write_restore(client, reporter, internal_backup))
            run_case(reporter, "internal settings/restore tests", lambda: test_internal_settings_restore(client, reporter, internal_backup))
        run_case(reporter, "parser error tests", lambda: test_parser_errors(client, reporter))

        if args.external is None:
            reporter.warn("external EEPROM tests skipped", "pass --external 1, --external 2, or --external 3")
        else:
            run_case(reporter, f"external EEPROM idx {args.external} tests", lambda: test_external_eeprom(client, reporter, args.external))

        if args.test_missing_external is None:
            reporter.warn("missing external EEPROM tests skipped", "pass --test-missing-external N only when that EEPROM is disconnected")
        else:
            run_case(
                reporter,
                f"missing external EEPROM idx {args.test_missing_external} tests",
                lambda: test_missing_external(client, reporter, args.test_missing_external),
            )
    finally:
        if client is not None:
            client.close()

    return reporter.summary()


if __name__ == "__main__":
    sys.exit(main())
