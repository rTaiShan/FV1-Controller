export type AppSerialPort = {
  close: () => Promise<void>
  open: (options: { baudRate: number }) => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

export type SerialNavigator = Navigator & {
  serial?: {
    getPorts: () => Promise<AppSerialPort[]>
    requestPort: (options?: { filters?: SerialPortFilter[] }) => Promise<AppSerialPort>
  }
}

export type SerialPortFilter = {
  usbProductId?: number
  usbVendorId?: number
}

const lineTimeoutMs = 3000

export class ProtocolError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
    this.name = "ProtocolError"
  }
}

export function getSerialApi() {
  if (typeof navigator === "undefined") {
    return undefined
  }

  return (navigator as SerialNavigator).serial
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ")
}

function logSend(command: string) {
  console.debug("[FV1 serial ->]", command)
}

function logReceive(line: string) {
  if (line.startsWith("PRINT ")) {
    console.debug("[FV1 print]", line.slice("PRINT ".length))
    return
  }
  console.debug("[FV1 serial <-]", line)
}

class SerialLineReader {
  private buffer = ""
  private readonly decoder = new TextDecoder()

  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}

  async readLine(timeoutMs: number) {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const bufferedLineEnd = this.buffer.indexOf("\n")
      if (bufferedLineEnd >= 0) {
        const line = this.buffer.slice(0, bufferedLineEnd).replace(/\r/g, "").trim()
        this.buffer = this.buffer.slice(bufferedLineEnd + 1)
        return line
      }

      const remainingMs = Math.max(1, deadline - Date.now())
      const result = await Promise.race([
        this.reader.read(),
        new Promise<"timeout">((resolve) => window.setTimeout(() => resolve("timeout"), remainingMs)),
      ])

      if (result === "timeout") {
        return null
      }

      if (result.done) {
        const line = this.buffer.trim()
        this.buffer = ""
        return line || null
      }

      this.buffer += this.decoder.decode(result.value, { stream: true })
    }

    return null
  }
}

async function sendLine(port: AppSerialPort, command: string) {
  const writer = port.writable?.getWriter()
  if (!writer) {
    throw new ProtocolError("Serial port is not writable.")
  }

  try {
    logSend(command)
    await writer.write(new TextEncoder().encode(`${command}\n`))
  } finally {
    writer.releaseLock()
  }
}

async function readProtocolLine(lineReader: SerialLineReader, timeoutMs = lineTimeoutMs): Promise<string> {
  while (true) {
    const line = await lineReader.readLine(timeoutMs)
    if (!line) {
      throw new ProtocolError("Timed out waiting for the pedal.")
    }
    logReceive(line)
    if (line.startsWith("PRINT ")) {
      continue
    }
    if (line.startsWith("ERR ")) {
      const code = line.slice("ERR ".length)
      console.warn("[FV1 protocol error]", code)
      throw new ProtocolError(`Pedal returned ${code}.`, code)
    }
    return line
  }
}

export async function probePortWithPing(port: AppSerialPort, baudRate: number) {
  await port.open({ baudRate })
  await sendLine(port, "PING")

  if (!port.readable) {
    throw new ProtocolError("Serial port is not readable.")
  }

  const reader = port.readable.getReader()
  try {
    const response = await readProtocolLine(new SerialLineReader(reader), 1500)
    if (response !== "OK FV1_CONTROLLER") {
      throw new ProtocolError(`Unexpected PING response: ${response || "no response"}`)
    }
  } finally {
    reader.releaseLock()
  }
}

export async function dumpEeprom(port: AppSerialPort, idx: number, expectedSize: number) {
  const startedAt = performance.now()
  await sendLine(port, `DUMP ${idx}`)

  if (!port.readable) {
    throw new ProtocolError("Serial port is not readable.")
  }

  const reader = port.readable.getReader()
  try {
    const lineReader = new SerialLineReader(reader)
    const first = await readProtocolLine(lineReader, idx === 0 ? 3000 : 15000)
    const okMatch = /^OK (\d+)$/.exec(first)
    if (!okMatch) {
      throw new ProtocolError(`Unexpected DUMP response: ${first}`)
    }

    const totalBytes = Number(okMatch[1])
    if (totalBytes !== expectedSize) {
      throw new ProtocolError(`Unexpected EEPROM size ${totalBytes}; expected ${expectedSize}.`)
    }

    const bytes = new Uint8Array(totalBytes)
    const seen = new Uint8Array(totalBytes)

    while (true) {
      const line = await readProtocolLine(lineReader, idx === 0 ? 3000 : 15000)
      if (line === "END") {
        break
      }

      const tokens = line.split(" ")
      if (tokens[0] !== "DATA" || tokens.length < 4) {
        throw new ProtocolError(`Unexpected DUMP line: ${line}`)
      }

      const start = Number(tokens[1])
      const len = Number(tokens[2])
      const hexBytes = tokens.slice(3)
      if (!Number.isInteger(start) || !Number.isInteger(len) || len < 0 || hexBytes.length !== len) {
        throw new ProtocolError(`Malformed DATA line: ${line}`)
      }
      if (start < 0 || start + len > totalBytes) {
        throw new ProtocolError(`DATA range is outside EEPROM: ${line}`)
      }

      for (let i = 0; i < len; i++) {
        const value = Number.parseInt(hexBytes[i], 16)
        if (!/^[0-9A-Fa-f]{2}$/.test(hexBytes[i]) || Number.isNaN(value)) {
          throw new ProtocolError(`Malformed DATA byte: ${hexBytes[i]}`)
        }
        bytes[start + i] = value
        seen[start + i] = 1
      }
    }

    const missingByte = seen.indexOf(0)
    if (missingByte >= 0) {
      throw new ProtocolError(`DUMP ${idx} missed byte ${missingByte}.`)
    }

    console.debug("[FV1 dump]", { idx, bytes: totalBytes, ms: Math.round(performance.now() - startedAt) })
    return bytes
  } finally {
    reader.releaseLock()
  }
}

export async function writeEeprom(port: AppSerialPort, idx: number, start: number, payload: Uint8Array) {
  const command = `WRITE ${idx} ${start} ${payload.length} ${bytesToHex(payload)}`
  const startedAt = performance.now()
  await sendLine(port, command)

  if (!port.readable) {
    throw new ProtocolError("Serial port is not readable.")
  }

  const reader = port.readable.getReader()
  try {
    const response = await readProtocolLine(new SerialLineReader(reader), idx === 0 ? 3000 : 10000)
    const expected = `OK ${payload.length}`
    if (response !== expected) {
      throw new ProtocolError(`Unexpected WRITE response: ${response}; expected ${expected}.`)
    }

    console.debug("[FV1 write]", { idx, start, bytes: payload.length, ms: Math.round(performance.now() - startedAt) })
  } finally {
    reader.releaseLock()
  }
}
