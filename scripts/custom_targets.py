from pathlib import Path
import subprocess
import sys

Import("env")

PROJECT_DIR = Path(env.subst("$PROJECT_DIR"))
ENV_NAME = env.subst("$PIOENV")


def run_command(args):
    print(" ".join(str(arg) for arg in args))
    return subprocess.call([str(arg) for arg in args], cwd=PROJECT_DIR)


def run_protocol_unity_build(source, target, env):
    return run_command(
        [
            sys.executable,
            "-m",
            "platformio",
            "test",
            "--environment",
            ENV_NAME,
            "--filter",
            "test_protocol_utils",
            "--without-uploading",
            "--without-testing",
        ]
    )


def run_protocol_unity(source, target, env):
    return run_command(
        [
            sys.executable,
            "-m",
            "platformio",
            "test",
            "--environment",
            ENV_NAME,
            "--filter",
            "test_protocol_utils",
        ]
    )


def get_serial_port(env):
    monitor_port = env.GetProjectOption("monitor_port", "")
    if monitor_port:
        return monitor_port
    return env.GetProjectOption("upload_port", "")


def run_host_protocol_smoke(source, target, env):
    port = get_serial_port(env)
    if not port:
        print("No serial port configured. Set monitor_port or upload_port in platformio.ini.")
        return 1

    return run_command(
        [
            sys.executable,
            str(PROJECT_DIR / "test" / "host" / "protocol_smoke_test.py"),
            "--port",
            port,
        ]
    )


if ENV_NAME == "native":
    env.AddCustomTarget(
        "test_native_protocol_utils",
        None,
        run_protocol_unity,
        title="Test: Native Protocol Utils",
        description="Run protocol Unity tests locally without uploading.",
    )
else:
    env.AddCustomTarget(
        "test_protocol_utils_build",
        None,
        run_protocol_unity_build,
        title="Test: Protocol Utils Build",
        description="Compile the protocol Unity test firmware without uploading.",
    )

    env.AddCustomTarget(
        "test_protocol_utils",
        None,
        run_protocol_unity,
        title="Test: Protocol Utils",
        description="Upload and run the protocol Unity tests on the board.",
    )

    env.AddCustomTarget(
        "test_host_protocol_smoke",
        None,
        run_host_protocol_smoke,
        title="Test: Host Protocol Smoke",
        description="Run the Python serial protocol smoke test using monitor_port/upload_port.",
    )
