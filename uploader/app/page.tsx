"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Cable, ChevronDown, ChevronRight, Download, Menu as MenuIcon, Star, Undo2, Upload } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  bytesToHex,
  dumpEeprom,
  getSerialApi,
  probePortWithPing,
  ProtocolError,
  type AppSerialPort,
  type SerialPortFilter,
  writeEeprom,
} from "@/lib/fv1-protocol"

type Step = "connect" | "settings" | "review"
type FootswitchMode = "toggle" | "momentary"
type PatchText = { name: string; parameters: [string, string, string] }
type ProgramFileState = { bytes: Uint8Array; file: File }
type DeviceState = {
  builtInPatchesDisabled: boolean
  customPatches: PatchText[]
  favoritePatch: number
  footswitchMode: FootswitchMode
  internalBytes: Uint8Array
  screen: { bias: number; contrast: number }
}
type ChangeRow = {
  after: string
  before: string
  label: string
  revert: () => void
}

const BAUD_RATE = 57600
const INTERNAL_EEPROM_SIZE = 1024
const EXTERNAL_EEPROM_SIZE = 4096
const EEPROM_CONFIG_BASE = 768
const SAVEDPATCHADDR = 768
const MOMENTARYMODEADDR = 769
const BIASADDR = 770
const CONTRASTADDR = 771
const BUILTINPATCHESDISABLEDADDR = 772
const CUSTOM_PATCH_COUNT = 24
const BUILTIN_PATCH_COUNT = 8
const MAX_PATCH_COUNT = CUSTOM_PATCH_COUNT + BUILTIN_PATCH_COUNT
const EXTERNAL_PROGRAM_SIZE = 512
const EXTERNAL_PAGE_SIZE = 32
const PROTOCOL_MAX_WRITE_LEN = 30
const SAVED_SERIAL_PERMISSION_KEY = "fv1-controller-serial-authorized"

const serialPortFilters: SerialPortFilter[] = [
  { usbVendorId: 0x2341 },
  { usbVendorId: 0x2a03 },
  { usbVendorId: 0x1a86 },
  { usbVendorId: 0x0403 },
  { usbVendorId: 0x10c4 },
  { usbVendorId: 0x067b },
]

const mockSerialPort: AppSerialPort = {
  close: async () => undefined,
  open: async () => undefined,
  readable: null,
  writable: null,
}

const defaultCustomPatches: PatchText[] = [
  ["Custom 01", "Gain 3", "Tone 2", "Mix 4"],
  ["Custom 02", "Rate 4", "Depth 5", "Mix 6"],
  ["Custom 03", "Delay 3", "FB 4", "Mix 5"],
  ["Custom 04", "Sweep 5", "Res 3", "Env 4"],
  ["Custom 05", "Bass 4", "Mid 3", "Treble 4"],
  ["Custom 06", "Drive 5", "Level 6", "Tone 4"],
  ["Custom 07", "Decay 4", "Tone 3", "Mix 5"],
  ["Custom 08", "Rate 3", "Depth 5", "Mix 6"],
  ["Custom 09", "Time 5", "FB 4", "Pan 2"],
  ["Custom 10", "Cutoff 5", "Res 3", "Env 6"],
  ["Custom 11", "Bits 4", "Rate 3", "Mix 6"],
  ["Custom 12", "Sens 5", "Res 3", "Speed 4"],
  ["Custom 13", "Freq 4", "Depth 5", "Mix 4"],
  ["Custom 14", "Rise 4", "Depth 5", "Mix 5"],
  ["Custom 15", "Gain 4", "Freq 3", "Q 2"],
  ["Custom 16", "Delay 3", "Mix 5", "Tone 4"],
  ["Custom 17", "Rate 4", "Depth 5", "Mix 5"],
  ["Custom 18", "Thresh 4", "Release 3", "Level 5"],
  ["Custom 19", "Gain 6", "Tone 4", "Level 6"],
  ["Custom 20", "Rate 3", "Depth 5", "Mix 6"],
  ["Custom 21", "Gain 5", "Tone 4", "Level 6"],
  ["Custom 22", "Drive 4", "Tone 3", "Level 5"],
  ["Custom 23", "Mix 4", "Depth 5", "Rate 3"],
  ["Custom 24", "Level 5", "Tone 4", "Gain 4"],
].map(([name, parameter1, parameter2, parameter3]) => ({
  name,
  parameters: [parameter1, parameter2, parameter3],
}))

const builtInPatches = [
  { id: 24, name: "Chorus-Reverb", parameters: ["Reverb mix", "Chorus rate", "Chorus mix"] },
  { id: 25, name: "Flange-Reverb", parameters: ["Reverb mix", "Flange rate", "Flange mix"] },
  { id: 26, name: "Tremolo-Reverb", parameters: ["Reverb mix", "Tremolo rate", "Tremolo mix"] },
  { id: 27, name: "Pitch Shift", parameters: ["Pitch +/-4", "Semitones", "-"] },
  { id: 28, name: "Pitch-Echo", parameters: ["Pitch shift", "Echo delay", "Echo mix"] },
  { id: 29, name: "Test", parameters: ["-", "-", "-"] },
  { id: 30, name: "Reverb 1", parameters: ["Reverb time", "HF filter", "LF filter"] },
  { id: 31, name: "Reverb 2", parameters: ["Reverb time", "HF filter", "LF filter"] },
].map((patch) => ({ ...patch, readOnly: true }))

const screenSettings = [
  { key: "bias", label: "Bias", min: 0, max: 7 },
  { key: "contrast", label: "Contrast", min: 0, max: 127 },
] as const

const nerdRows = [
  ["Baud rate", "57600"],
  ["Commands", "PING, DUMP, WRITE"],
  ["Internal EEPROM", "idx 0, 1024 bytes"],
  ["External EEPROMs", "idx 1-3, 4096 bytes each, 32 bytes per page"],
  ["Saved patch", "SAVEDPATCHADDR = 768"],
  ["Momentary mode", "MOMENTARYMODEADDR = 769"],
  ["Screen bias", "BIASADDR = 770, value 0-7"],
  ["Screen contrast", "CONTRASTADDR = 771, value 0-127"],
  ["Built-in patches", "BUILTINPATCHESDISABLEDADDR = 772, 0 enabled, 1 disabled"],
  ["Protocol chunks", "32 bytes for dumps, 30 bytes for writes"],
]

const tableInputClassName =
  "h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring disabled:border-transparent disabled:bg-transparent disabled:opacity-60"

function clonePatch(patch: PatchText): PatchText {
  return { name: patch.name, parameters: [...patch.parameters] as [string, string, string] }
}

function sanitizePatchText(value: string) {
  return value.replaceAll(/\r|\n/g, " ").slice(0, 48)
}

function serializeCustomPatches(patches: PatchText[]) {
  const text = patches
    .map((patch) => [patch.name, ...patch.parameters].map((line) => line.trim() || "-").join("\n"))
    .join("\n")
  return new TextEncoder().encode(`${text}\n\0`)
}

function decodeCustomPatches(bytes: Uint8Array) {
  const end = bytes.findIndex((byte, index) => index < EEPROM_CONFIG_BASE && (byte === 0 || byte === 0xff))
  const textBytes = bytes.slice(0, end >= 0 ? end : EEPROM_CONFIG_BASE)
  const lines = new TextDecoder().decode(textBytes).split("\n")

  return defaultCustomPatches.map((fallback, patchIndex) => {
    const offset = patchIndex * 4
    return {
      name: lines[offset]?.trim() || fallback.name,
      parameters: [
        lines[offset + 1]?.trim() || fallback.parameters[0],
        lines[offset + 2]?.trim() || fallback.parameters[1],
        lines[offset + 3]?.trim() || fallback.parameters[2],
      ] as [string, string, string],
    }
  })
}

function decodeDeviceState(bytes: Uint8Array): DeviceState {
  const builtInPatchesDisabled = bytes[BUILTINPATCHESDISABLEDADDR] === 1
  const availablePatchCount = builtInPatchesDisabled ? CUSTOM_PATCH_COUNT : MAX_PATCH_COUNT
  const favoritePatch = bytes[SAVEDPATCHADDR] < availablePatchCount ? bytes[SAVEDPATCHADDR] : 0

  return {
    builtInPatchesDisabled,
    customPatches: decodeCustomPatches(bytes),
    favoritePatch,
    footswitchMode: bytes[MOMENTARYMODEADDR] === 0 ? "toggle" : "momentary",
    internalBytes: bytes.slice(),
    screen: {
      bias: bytes[BIASADDR] <= 7 ? bytes[BIASADDR] : 4,
      contrast: bytes[CONTRASTADDR] <= 127 ? bytes[CONTRASTADDR] : 85,
    },
  }
}

function createMockInternalBytes() {
  const bytes = new Uint8Array(INTERNAL_EEPROM_SIZE)
  bytes.fill(0xff)
  bytes.set(serializeCustomPatches(defaultCustomPatches).slice(0, EEPROM_CONFIG_BASE), 0)
  bytes[SAVEDPATCHADDR] = 0
  bytes[MOMENTARYMODEADDR] = 0
  bytes[BIASADDR] = 4
  bytes[CONTRASTADDR] = 85
  bytes[BUILTINPATCHESDISABLEDADDR] = 0
  return bytes
}

function createDefaultDeviceState() {
  return decodeDeviceState(createMockInternalBytes())
}

function makeChangedInternalBytes(current: DeviceState) {
  const bytes = current.internalBytes.slice()
  const patchText = serializeCustomPatches(current.customPatches)
  if (patchText.length > EEPROM_CONFIG_BASE) {
    throw new Error(`Patch text is ${patchText.length} bytes; maximum is ${EEPROM_CONFIG_BASE}.`)
  }
  bytes.fill(0, 0, EEPROM_CONFIG_BASE)
  bytes.set(patchText, 0)
  bytes[SAVEDPATCHADDR] = current.favoritePatch
  bytes[MOMENTARYMODEADDR] = current.footswitchMode === "momentary" ? 1 : 0
  bytes[BIASADDR] = current.screen.bias
  bytes[CONTRASTADDR] = current.screen.contrast
  bytes[BUILTINPATCHESDISABLEDADDR] = current.builtInPatchesDisabled ? 1 : 0
  return bytes
}

function buildWriteChunks(idx: number, before: Uint8Array, after: Uint8Array) {
  const chunks: Array<{ idx: number; payload: Uint8Array; start: number }> = []
  let start = -1
  let pending: number[] = []

  function flush() {
    if (start >= 0 && pending.length > 0) {
      chunks.push({ idx, start, payload: new Uint8Array(pending) })
    }
    start = -1
    pending = []
  }

  for (let i = 0; i < after.length; i++) {
    if (before[i] === after[i]) {
      flush()
      continue
    }

    if (start < 0) {
      start = i
    }
    pending.push(after[i])

    const crossesPage =
      idx > 0 && Math.floor(start / EXTERNAL_PAGE_SIZE) !== Math.floor((start + pending.length - 1) / EXTERNAL_PAGE_SIZE)
    if (pending.length === PROTOCOL_MAX_WRITE_LEN || crossesPage) {
      const last = pending.pop()
      flush()
      if (last !== undefined) {
        start = i
        pending = [last]
      }
    }
  }
  flush()
  return chunks
}

function getProgramTarget(patchId: number) {
  const customIndex = patchId
  return {
    idx: Math.floor(customIndex / 8) + 1,
    start: (customIndex % 8) * EXTERNAL_PROGRAM_SIZE,
  }
}

function arraysEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) {
    return false
  }
  return left.every((value, index) => value === right[index])
}

function downloadBytes(fileName: string, bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.length)
  copy.set(bytes)
  const url = URL.createObjectURL(new Blob([copy.buffer as ArrayBuffer], { type: "application/octet-stream" }))
  const link = document.createElement("a")

  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function parseProgramFile(file: File) {
  const fileName = file.name.toLowerCase()
  if (fileName.endsWith(".hex")) {
    return parseIntelHex(await file.text())
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length > EXTERNAL_PROGRAM_SIZE) {
    throw new Error(`Program is ${bytes.length} bytes; maximum slot size is ${EXTERNAL_PROGRAM_SIZE}.`)
  }
  const slotBytes = new Uint8Array(EXTERNAL_PROGRAM_SIZE)
  slotBytes.fill(0xff)
  slotBytes.set(bytes)
  return slotBytes
}

function parseIntelHex(text: string) {
  const bytes = new Uint8Array(EXTERNAL_PROGRAM_SIZE)
  bytes.fill(0xff)
  let upperAddress = 0
  let wroteByte = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    if (!line.startsWith(":") || line.length < 11) {
      throw new Error("Intel HEX line is malformed.")
    }

    const data = line.slice(1)
    const record = new Uint8Array(data.length / 2)
    for (let i = 0; i < record.length; i++) {
      const pair = data.slice(i * 2, i * 2 + 2)
      if (!/^[0-9A-Fa-f]{2}$/.test(pair)) {
        throw new Error("Intel HEX contains a non-hex byte.")
      }
      record[i] = Number.parseInt(pair, 16)
    }

    const checksum = record.reduce((sum, byte) => (sum + byte) & 0xff, 0)
    if (checksum !== 0) {
      throw new Error("Intel HEX checksum failed.")
    }

    const len = record[0]
    const address = (record[1] << 8) | record[2]
    const type = record[3]
    const payload = record.slice(4, 4 + len)

    if (type === 0x00) {
      const absoluteAddress = upperAddress + address
      if (absoluteAddress + payload.length > EXTERNAL_PROGRAM_SIZE) {
        throw new Error(`Intel HEX data exceeds ${EXTERNAL_PROGRAM_SIZE} bytes.`)
      }
      bytes.set(payload, absoluteAddress)
      wroteByte = true
    } else if (type === 0x01) {
      break
    } else if (type === 0x04) {
      upperAddress = ((payload[0] << 8) | payload[1]) << 16
    }
  }

  if (!wroteByte) {
    throw new Error("Intel HEX did not contain program data.")
  }
  return bytes
}

function formatError(error: unknown) {
  if (error instanceof ProtocolError) {
    return error.message
  }
  if (error instanceof Error) {
    return error.message
  }
  return "Unexpected error."
}

function patchProgramFileName(patchName: string, patchNumber: number) {
  return `${String(patchNumber).padStart(2, "0")}-${patchName.toLowerCase().replaceAll(" ", "-")}.bin`
}

function ScreenSettingControl({
  label,
  max,
  min,
  onValueChange,
  value,
}: {
  label: string
  max: number
  min: number
  onValueChange: (value: number) => void
  value: number
}) {
  const percentage = ((value - min) / (max - min)) * 100
  const valuePosition =
    percentage <= 8
      ? { className: "absolute left-0 top-0 font-semibold text-foreground", style: undefined }
      : percentage >= 92
        ? {
            className: "absolute right-0 top-0 font-semibold text-foreground",
            style: undefined,
          }
        : {
            className: "absolute top-0 -translate-x-1/2 font-semibold text-foreground",
            style: { left: `${percentage}%` },
          }

  return (
    <div className="grid min-w-0 gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <ChevronRight className="size-3 rotate-90 text-muted-foreground" />
        <Label htmlFor={label}>{label}</Label>
      </div>
      <div className="grid min-w-0 gap-1">
        <Slider max={max} min={min} onValueChange={onValueChange} value={value} />
        <div className="relative h-5 text-xs text-muted-foreground">
          <span className="absolute left-0 top-0">{min}</span>
          <span className={valuePosition.className} style={valuePosition.style}>
            {value}
          </span>
          <span className="absolute right-0 top-0">{max}</span>
        </div>
      </div>
    </div>
  )
}

function StepTabs({
  activeStep,
  connected,
  onStepChange,
}: {
  activeStep: Step
  connected: boolean
  onStepChange: (step: Step) => void
}) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: "connect", label: "1. Connect" },
    { id: "settings", label: "2. Select Settings" },
    { id: "review", label: "3. Review Changes" },
  ]

  return (
    <Tabs className="mx-auto w-full max-w-5xl" value={activeStep} onValueChange={(value) => onStepChange(value as Step)}>
      <TabsList className="grid h-auto w-full grid-cols-1 gap-1 rounded-lg border border-border bg-card p-1 sm:h-10 sm:grid-cols-3 [&_[data-slot=tabs-trigger]]:h-8 sm:[&_[data-slot=tabs-trigger]]:h-full">
        {steps.map((step) => {
          const locked = step.id !== "connect" && !connected

          return (
            <TabsTrigger
              key={step.id}
              aria-disabled={locked}
              className="data-active:border-primary data-active:bg-primary data-active:text-primary-foreground dark:data-active:border-primary dark:data-active:bg-primary dark:data-active:text-primary-foreground"
              disabled={locked}
              value={step.id}
            >
              {step.label}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

function TabPanel({ children }: { children: ReactNode }) {
  return (
    <section data-testid="active-tab-panel" className="mx-auto grid w-full min-w-0 max-w-5xl gap-5">
      {children}
    </section>
  )
}

function DisabledActionTooltip({
  children,
  disabled,
  message,
}: {
  children: React.ReactElement
  disabled: boolean
  message: string
}) {
  if (!disabled) {
    return children
  }

  return (
    <Tooltip content={message}>
      <span className="inline-flex cursor-not-allowed [&_button]:cursor-not-allowed" tabIndex={0}>
        {children}
      </span>
    </Tooltip>
  )
}

export default function Page() {
  const [aboutOpen, setAboutOpen] = useState(false)
  const [activeStep, setActiveStep] = useState<Step>("connect")
  const [connectionMessage, setConnectionMessage] = useState("Select a serial device to begin.")
  const [connecting, setConnecting] = useState(false)
  const [currentState, setCurrentState] = useState<DeviceState>(() => createDefaultDeviceState())
  const [loadedState, setLoadedState] = useState<DeviceState | null>(null)
  const [programFiles, setProgramFiles] = useState<Record<number, ProgramFileState>>({})
  const [serialBusy, setSerialBusy] = useState(false)
  const [serialPort, setSerialPort] = useState<AppSerialPort | null>(null)
  const lockRef = useRef(false)
  const mockMemoryRef = useRef<{ external: Uint8Array[]; internal: Uint8Array } | null>(null)
  const connected = serialPort !== null
  const visiblePatches = currentState.builtInPatchesDisabled
    ? currentState.customPatches.map((patch, id) => ({ ...patch, id }))
    : [
        ...currentState.customPatches.map((patch, id) => ({ ...patch, id })),
        ...builtInPatches,
      ]

  const changeRows = useMemo(() => {
    if (!loadedState) {
      return []
    }

    const rows: ChangeRow[] = []
    const beforeBytes = loadedState.internalBytes
    const afterBytes = makeChangedInternalBytes(currentState)

    if (loadedState.footswitchMode !== currentState.footswitchMode) {
      rows.push({
        after: currentState.footswitchMode === "toggle" ? "Toggle" : "Momentary",
        before: loadedState.footswitchMode === "toggle" ? "Toggle" : "Momentary",
        label: "Footswitch mode",
        revert: () => setCurrentState((state) => ({ ...state, footswitchMode: loadedState.footswitchMode })),
      })
    }
    if (loadedState.screen.bias !== currentState.screen.bias) {
      rows.push({
        after: String(currentState.screen.bias),
        before: String(loadedState.screen.bias),
        label: "Bias",
        revert: () =>
          setCurrentState((state) => ({ ...state, screen: { ...state.screen, bias: loadedState.screen.bias } })),
      })
    }
    if (loadedState.screen.contrast !== currentState.screen.contrast) {
      rows.push({
        after: String(currentState.screen.contrast),
        before: String(loadedState.screen.contrast),
        label: "Contrast",
        revert: () =>
          setCurrentState((state) => ({
            ...state,
            screen: { ...state.screen, contrast: loadedState.screen.contrast },
          })),
      })
    }
    if (loadedState.builtInPatchesDisabled !== currentState.builtInPatchesDisabled) {
      rows.push({
        after: currentState.builtInPatchesDisabled ? "Disabled" : "Enabled",
        before: loadedState.builtInPatchesDisabled ? "Disabled" : "Enabled",
        label: "Built-in patches",
        revert: () =>
          setCurrentState((state) => ({
            ...state,
            builtInPatchesDisabled: loadedState.builtInPatchesDisabled,
            favoritePatch:
              loadedState.builtInPatchesDisabled && state.favoritePatch >= CUSTOM_PATCH_COUNT ? 0 : state.favoritePatch,
          })),
      })
    }
    if (loadedState.favoritePatch !== currentState.favoritePatch) {
      rows.push({
        after: String(currentState.favoritePatch + 1),
        before: String(loadedState.favoritePatch + 1),
        label: "Favorite patch",
        revert: () => setCurrentState((state) => ({ ...state, favoritePatch: loadedState.favoritePatch })),
      })
    }

    currentState.customPatches.forEach((patch, patchIndex) => {
      const loadedPatch = loadedState.customPatches[patchIndex]
      if (loadedPatch.name !== patch.name) {
        rows.push({
          after: patch.name,
          before: loadedPatch.name,
          label: `Patch ${patchIndex + 1} name`,
          revert: () =>
            setCurrentState((state) => ({
              ...state,
              customPatches: state.customPatches.map((currentPatch, index) =>
                index === patchIndex ? { ...currentPatch, name: loadedPatch.name } : currentPatch
              ),
            })),
        })
      }
      patch.parameters.forEach((parameter, parameterIndex) => {
        if (loadedPatch.parameters[parameterIndex] !== parameter) {
          rows.push({
            after: parameter,
            before: loadedPatch.parameters[parameterIndex],
            label: `Patch ${patchIndex + 1} parameter ${parameterIndex + 1}`,
            revert: () =>
              setCurrentState((state) => ({
                ...state,
                customPatches: state.customPatches.map((currentPatch, index) => {
                  if (index !== patchIndex) {
                    return currentPatch
                  }
                  const parameters = [...currentPatch.parameters] as [string, string, string]
                  parameters[parameterIndex] = loadedPatch.parameters[parameterIndex]
                  return { ...currentPatch, parameters }
                }),
              })),
          })
        }
      })
    })

    Object.entries(programFiles).forEach(([patchId, program]) => {
      rows.push({
        after: program.file.name,
        before: "Pedal EEPROM",
        label: `Patch ${Number(patchId) + 1} program`,
        revert: () =>
          setProgramFiles((currentFiles) => {
            const nextFiles = { ...currentFiles }
            delete nextFiles[Number(patchId)]
            return nextFiles
          }),
      })
    })

    if (arraysEqual(beforeBytes, afterBytes) && Object.keys(programFiles).length === 0) {
      return []
    }
    return rows
  }, [currentState, loadedState, programFiles])
  const hasChanges = changeRows.length > 0

  useEffect(() => {
    const serial = getSerialApi()

    if (!serial) {
      window.setTimeout(() => setConnectionMessage("Web Serial is not available in this browser."), 0)
      return
    }
    const serialApi = serial

    if (window.localStorage.getItem(SAVED_SERIAL_PERMISSION_KEY) !== "1") {
      return
    }

    let cancelled = false

    async function reconnectSavedPort() {
      setConnecting(true)
      setConnectionMessage("Looking for the saved serial device...")

      try {
        const ports = await serialApi.getPorts()

        for (const port of ports) {
          try {
            await probePortWithPing(port, BAUD_RATE)

            if (!cancelled) {
              setSerialPort(port)
              setActiveStep("settings")
              setConnectionMessage("Connected to saved serial device. Reloading settings...")
              const bytes = await dumpEeprom(port, 0, INTERNAL_EEPROM_SIZE)
              const nextState = decodeDeviceState(bytes)
              setLoadedState(nextState)
              setCurrentState({
                ...nextState,
                customPatches: nextState.customPatches.map(clonePatch),
                internalBytes: nextState.internalBytes.slice(),
                screen: { ...nextState.screen },
              })
              setProgramFiles({})
              setConnectionMessage("Connected to saved serial device.")
            }
            return
          } catch {
            await port.close().catch(() => undefined)
          }
        }

        if (!cancelled) {
          setConnectionMessage("Saved serial device is not available. Select a device to continue.")
          window.localStorage.removeItem(SAVED_SERIAL_PERMISSION_KEY)
        }
      } finally {
        if (!cancelled) {
          setConnecting(false)
        }
      }
    }

    void reconnectSavedPort()

    return () => {
      cancelled = true
    }
  }, [])

  function showToast(title: string, message: string, variant: "default" | "destructive" | "success" = "default") {
    const options = { description: message }
    if (variant === "success") {
      toast.success(title, options)
      return
    }
    if (variant === "destructive") {
      toast.error(title, options)
      return
    }
    toast(title, options)
  }

  async function withSerialLock<T>(label: string, operation: () => Promise<T>) {
    if (lockRef.current) {
      showToast("Serial is busy", "Wait for the current device operation to finish.", "destructive")
      throw new Error("Serial operation already in progress.")
    }

    lockRef.current = true
    setSerialBusy(true)
    console.debug("[FV1 operation start]", label)
    try {
      return await operation()
    } catch (error) {
      console.error("[FV1 operation failed]", label, error)
      showToast("Device operation failed", formatError(error), "destructive")
      throw error
    } finally {
      lockRef.current = false
      setSerialBusy(false)
      console.debug("[FV1 operation end]", label)
    }
  }

  async function dumpDeviceEeprom(port: AppSerialPort, idx: number) {
    if (port === mockSerialPort) {
      const memory = ensureMockMemory()
      console.debug("[FV1 mock ->]", `DUMP ${idx}`)
      if (idx === 0) {
        console.debug("[FV1 mock <-]", `OK ${INTERNAL_EEPROM_SIZE}`)
        return memory.internal.slice()
      }
      console.debug("[FV1 mock <-]", `OK ${EXTERNAL_EEPROM_SIZE}`)
      return memory.external[idx - 1].slice()
    }

    return dumpEeprom(port, idx, idx === 0 ? INTERNAL_EEPROM_SIZE : EXTERNAL_EEPROM_SIZE)
  }

  async function writeDeviceEeprom(port: AppSerialPort, idx: number, start: number, payload: Uint8Array) {
    if (port === mockSerialPort) {
      const memory = ensureMockMemory()
      console.debug("[FV1 mock ->]", `WRITE ${idx} ${start} ${payload.length} ${bytesToHex(payload)}`)
      if (idx === 0) {
        memory.internal.set(payload, start)
      } else {
        memory.external[idx - 1].set(payload, start)
      }
      console.debug("[FV1 mock <-]", `OK ${payload.length}`)
      return
    }

    await writeEeprom(port, idx, start, payload)
  }

  function ensureMockMemory() {
    if (!mockMemoryRef.current) {
      mockMemoryRef.current = {
        external: Array.from({ length: 3 }, () => {
          const bytes = new Uint8Array(EXTERNAL_EEPROM_SIZE)
          bytes.fill(0xff)
          return bytes
        }),
        internal: createMockInternalBytes(),
      }
    }
    return mockMemoryRef.current
  }

  async function loadInternalState(port = serialPort, showSuccess = true) {
    if (!port) {
      showToast("No device selected", "Select a serial device before reloading settings.", "destructive")
      return
    }

    await withSerialLock("DUMP 0", async () => {
      setConnectionMessage("Reloading settings from pedal...")
      const bytes = await dumpDeviceEeprom(port, 0)
      const nextState = decodeDeviceState(bytes)
      setLoadedState(nextState)
      setCurrentState({
        ...nextState,
        customPatches: nextState.customPatches.map(clonePatch),
        internalBytes: nextState.internalBytes.slice(),
        screen: { ...nextState.screen },
      })
      setProgramFiles({})
      setConnectionMessage("Settings loaded from pedal.")
      if (showSuccess) {
        showToast("Settings loaded", "The editor now matches the pedal.", "success")
      }
    })
  }

  function goToStep(step: Step) {
    if (step !== "connect" && !connected) {
      setActiveStep("connect")
      setConnectionMessage("Select and verify a serial device before continuing.")
      return
    }

    setActiveStep(step)
  }

  async function selectSerialDevice() {
    const serial = getSerialApi()

    if (!serial) {
      setConnectionMessage("Web Serial is not available in this browser.")
      return
    }
    if (serialBusy) {
      showToast("Serial is busy", "Wait for the current device operation to finish.", "destructive")
      return
    }

    setConnecting(true)
    setConnectionMessage("Waiting for serial device selection...")

    try {
      const nextPort = await serial.requestPort({ filters: serialPortFilters })

      if (serialPort) {
        await serialPort.close().catch(() => undefined)
      }

      setConnectionMessage("Verifying device with PING...")
      await probePortWithPing(nextPort, BAUD_RATE)
      window.localStorage.setItem(SAVED_SERIAL_PERMISSION_KEY, "1")
      setSerialPort(nextPort)
      setActiveStep("settings")
      setConnectionMessage("Connected and verified with PING.")
      showToast("Device connected", "The pedal answered PING.", "success")
      await loadInternalState(nextPort, false)
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        setConnectionMessage("Select a serial device to begin.")
        return
      }

      const detail = formatError(error)
      setConnectionMessage(detail)
      showToast("Connection failed", detail, "destructive")
    } finally {
      setConnecting(false)
    }
  }

  async function connectMockDevice() {
    ensureMockMemory()
    setSerialPort(mockSerialPort)
    setActiveStep("settings")
    setConnectionMessage("Using mocked serial device.")
    showToast("Mock device connected", "Protocol operations will use browser memory.", "success")
    await loadInternalState(mockSerialPort, false)
  }

  function updateBuiltInPatchVisibility(enabled: boolean) {
    setCurrentState((state) => ({
      ...state,
      builtInPatchesDisabled: !enabled,
      favoritePatch: !enabled && state.favoritePatch >= CUSTOM_PATCH_COUNT ? 0 : state.favoritePatch,
    }))
  }

  function updatePatchField(patchId: number, field: "name" | "parameter", value: string, parameterIndex = 0) {
    setCurrentState((state) => ({
      ...state,
      customPatches: state.customPatches.map((patch, index) => {
        if (index !== patchId) {
          return patch
        }
        if (field === "name") {
          return { ...patch, name: sanitizePatchText(value) }
        }
        const parameters = [...patch.parameters] as [string, string, string]
        parameters[parameterIndex] = sanitizePatchText(value)
        return { ...patch, parameters }
      }),
    }))
  }

  async function handleProgramFile(patchId: number, file: File | undefined) {
    if (!file) {
      return
    }

    try {
      const bytes = await parseProgramFile(file)
      setProgramFiles((currentFiles) => ({ ...currentFiles, [patchId]: { bytes, file } }))
      showToast("Program staged", `${file.name} is ready for patch ${patchId + 1}.`, "success")
    } catch (error) {
      showToast("Program file rejected", formatError(error), "destructive")
    }
  }

  function getCurrentSettingsJson() {
    return {
      builtInPatchesEnabled: !currentState.builtInPatchesDisabled,
      favoritePatch: currentState.favoritePatch,
      footswitchMode: currentState.footswitchMode,
      patches: currentState.customPatches,
      screen: currentState.screen,
    }
  }

  function exportCurrentSettingsAsJson() {
    const file = new File([`${JSON.stringify(getCurrentSettingsJson(), null, 2)}\n`], "fv1-pedal-settings.json", {
      type: "application/json",
    })
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")

    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  async function importSettingsFromJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<ReturnType<typeof getCurrentSettingsJson>>

      setCurrentState((state) => ({
        ...state,
        builtInPatchesDisabled:
          typeof parsed.builtInPatchesEnabled === "boolean"
            ? !parsed.builtInPatchesEnabled
            : state.builtInPatchesDisabled,
        customPatches: Array.isArray(parsed.patches)
          ? defaultCustomPatches.map((fallback, index) => {
              const patch = parsed.patches?.[index]
              return {
                name: typeof patch?.name === "string" ? sanitizePatchText(patch.name) : fallback.name,
                parameters: [0, 1, 2].map((parameterIndex) =>
                  typeof patch?.parameters?.[parameterIndex] === "string"
                    ? sanitizePatchText(patch.parameters[parameterIndex])
                    : fallback.parameters[parameterIndex]
                ) as [string, string, string],
              }
            })
          : state.customPatches,
        favoritePatch:
          typeof parsed.favoritePatch === "number"
            ? Math.max(0, Math.min(MAX_PATCH_COUNT - 1, parsed.favoritePatch))
            : state.favoritePatch,
        footswitchMode:
          parsed.footswitchMode === "toggle" || parsed.footswitchMode === "momentary"
            ? parsed.footswitchMode
            : state.footswitchMode,
        screen: {
          bias:
            typeof parsed.screen?.bias === "number" ? Math.max(0, Math.min(7, parsed.screen.bias)) : state.screen.bias,
          contrast:
            typeof parsed.screen?.contrast === "number"
              ? Math.max(0, Math.min(127, parsed.screen.contrast))
              : state.screen.contrast,
        },
      }))
      showToast("Settings imported", "Review the imported changes before uploading.", "success")
    } catch {
      showToast("Import failed", "Could not import settings JSON.", "destructive")
    } finally {
      event.target.value = ""
    }
  }

  async function uploadSettings() {
    if (!serialPort) {
      showToast("No device selected", "Select a serial device before uploading.", "destructive")
      return
    }
    if (!loadedState || !hasChanges) {
      showToast("No changes", "There are no pending changes to upload.", "destructive")
      return
    }

    await withSerialLock("Upload settings", async () => {
      setConnectionMessage("Uploading settings...")
      const nextInternalBytes = makeChangedInternalBytes(currentState)
      const internalChunks = buildWriteChunks(0, loadedState.internalBytes, nextInternalBytes)

      for (const chunk of internalChunks) {
        await writeDeviceEeprom(serialPort, chunk.idx, chunk.start, chunk.payload)
      }

      for (const [patchIdText, program] of Object.entries(programFiles)) {
        const patchId = Number(patchIdText)
        const target = getProgramTarget(patchId)
        const beforeExternal = await dumpDeviceEeprom(serialPort, target.idx)
        const slotBefore = beforeExternal.slice(target.start, target.start + EXTERNAL_PROGRAM_SIZE)
        const programChunks = buildWriteChunks(target.idx, slotBefore, program.bytes).map((chunk) => ({
          ...chunk,
          start: chunk.start + target.start,
        }))

        setConnectionMessage(`Uploading program for patch ${patchId + 1}...`)
        for (const chunk of programChunks) {
          await writeDeviceEeprom(serialPort, chunk.idx, chunk.start, chunk.payload)
        }

        setConnectionMessage(`Verifying program for patch ${patchId + 1}...`)
        const afterExternal = await dumpDeviceEeprom(serialPort, target.idx)
        const verified = afterExternal.slice(target.start, target.start + EXTERNAL_PROGRAM_SIZE)
        if (!arraysEqual(verified, program.bytes)) {
          throw new Error(`Verification failed for patch ${patchId + 1}.`)
        }
      }

      const reloaded = decodeDeviceState(await dumpDeviceEeprom(serialPort, 0))
      setLoadedState(reloaded)
      setCurrentState({
        ...reloaded,
        customPatches: reloaded.customPatches.map(clonePatch),
        internalBytes: reloaded.internalBytes.slice(),
        screen: { ...reloaded.screen },
      })
      setProgramFiles({})
      setConnectionMessage("Upload complete.")
      showToast("Upload complete", "The pedal has been updated and verified.", "success")
    })
  }

  async function downloadPatchProgram(patch: (typeof visiblePatches)[number]) {
    if ("readOnly" in patch && patch.readOnly) {
      const placeholder = new TextEncoder().encode(`Built-in FV-1 ROM program ${patch.id + 1}: ${patch.name}\n`)
      downloadBytes(patchProgramFileName(patch.name, patch.id + 1), placeholder)
      return
    }
    if (!serialPort) {
      showToast("No device selected", "Select a serial device before downloading.", "destructive")
      return
    }

    await withSerialLock(`Download patch ${patch.id + 1}`, async () => {
      const target = getProgramTarget(patch.id)
      setConnectionMessage(`Downloading program for patch ${patch.id + 1}...`)
      const externalBytes = await dumpDeviceEeprom(serialPort, target.idx)
      downloadBytes(
        patchProgramFileName(patch.name, patch.id + 1),
        externalBytes.slice(target.start, target.start + EXTERNAL_PROGRAM_SIZE)
      )
      setConnectionMessage("Program downloaded.")
      showToast("Program downloaded", `Patch ${patch.id + 1} was saved as a binary file.`, "success")
    })
  }

  const unavailableMessage = serialBusy
    ? "Wait for the current device operation to finish."
    : "There are no pending changes to upload or review."

  return (
    <TooltipProvider>
      <main className="flex min-h-svh w-full justify-center overflow-x-hidden bg-background text-foreground">
        <div className="flex min-w-0 w-full max-w-6xl flex-col gap-5 px-3 py-4 sm:px-5 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-border pb-4 text-center md:flex-row md:items-center md:justify-between md:text-left">
            <div className="min-w-0">
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground md:justify-start">
                <Cable className="size-4" />
                <span>FV1 Pedal Editor</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">Edit Settings and Patches</h1>
              <p className="mt-1 text-sm text-muted-foreground">{connectionMessage}</p>
            </div>
            <div className="flex items-center justify-center gap-2 md:justify-end">
              <Input
                id="settings-json-import"
                accept="application/json,.json"
                className="hidden"
                type="file"
                onChange={importSettingsFromJson}
              />
              <DropdownMenu>
                <DropdownMenuTrigger openOnHover render={<Button aria-label="Open menu" size="icon" variant="outline" />}>
                  <MenuIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem disabled={!connected || serialBusy} onClick={() => void loadInternalState()}>
                    Reload Settings from Pedal
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCurrentSettingsAsJson}>
                    Export Current Settings as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={serialBusy}
                    onClick={() => document.getElementById("settings-json-import")?.click()}
                  >
                    Import Settings from JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAboutOpen(true)}>About</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>About</DialogTitle>
                <DialogDescription>
                  These values are used by the browser before it sends any bytes to the pedal.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 sm:grid-cols-2">
                {nerdRows.map(([label, value]) => (
                  <div key={label} className="rounded-md border border-border bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-1 font-mono text-sm">{value}</div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>

          <StepTabs activeStep={activeStep} connected={connected} onStepChange={goToStep} />

          {activeStep === "connect" ? (
            <TabPanel>
            <Card className="w-full">
              <CardHeader className="flex flex-col gap-3 text-center md:flex-row md:items-center md:justify-between md:text-left">
                <div>
                  <CardTitle>Connect to Serial Device</CardTitle>
                  <CardDescription>Select a serial device to begin.</CardDescription>
                </div>
                <ButtonGroup className="mx-auto w-full max-w-sm md:mx-0 md:w-auto">
                  <Button
                    className="min-w-0 flex-1 md:flex-none"
                    disabled={connecting || serialBusy}
                    onClick={selectSerialDevice}
                  >
                    <Cable />
                    {connecting ? "Connecting..." : "Select serial device"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label="More connection options"
                          className="px-2"
                          disabled={connecting || serialBusy}
                        />
                      }
                    >
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => void connectMockDevice()}>Use mock device</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </ButtonGroup>
              </CardHeader>
            </Card>
            </TabPanel>
          ) : null}

          {activeStep === "settings" ? (
            <TabPanel>
              <section className="grid w-full min-w-0 gap-5 lg:grid-cols-2">
                <Card className="w-full">
                  <CardHeader className="text-center md:text-left">
                    <CardTitle>Footswitch</CardTitle>
                    <CardDescription>Bypass switch behavior</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <ToggleGroup
                      aria-label="Footswitch mode"
                      className="grid w-full grid-cols-2 rounded-md border border-input bg-muted/40 p-0.5"
                      spacing={0}
                      value={[currentState.footswitchMode]}
                      onValueChange={(value) => {
                        const nextValue = value[0]
                        if (nextValue === "toggle" || nextValue === "momentary") {
                          setCurrentState((state) => ({ ...state, footswitchMode: nextValue }))
                        }
                      }}
                    >
                      <ToggleGroupItem className="w-full" value="toggle">
                        Toggle
                      </ToggleGroupItem>
                      <ToggleGroupItem className="w-full" value="momentary">
                        Momentary
                      </ToggleGroupItem>
                    </ToggleGroup>
                    <div className="grid gap-1 border-t border-border pt-3">
                      <div className="text-sm font-medium text-foreground">
                        {currentState.footswitchMode === "toggle" ? "Toggle mode" : "Momentary mode"}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {currentState.footswitchMode === "toggle"
                          ? "Press once to switch bypass state."
                          : "Hold to keep the effect active, release to bypass."}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="w-full">
                  <CardHeader className="text-center md:text-left">
                    <CardTitle>Screen Calibration</CardTitle>
                    <CardDescription>Display calibration values</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-5">
                    {screenSettings.map((setting) => (
                      <ScreenSettingControl
                        key={setting.key}
                        label={setting.label}
                        max={setting.max}
                        min={setting.min}
                        onValueChange={(value) =>
                          setCurrentState((state) => ({
                            ...state,
                            screen: { ...state.screen, [setting.key]: value },
                          }))
                        }
                        value={currentState.screen[setting.key]}
                      />
                    ))}
                  </CardContent>
                </Card>
              </section>

              <Card className="w-full">
                <CardHeader className="flex flex-col items-center gap-3 text-center md:flex-row md:items-center md:justify-between md:text-left">
                  <div className="min-w-0">
                    <CardTitle>Edit Patches</CardTitle>
                    <CardDescription>Patch names, screen parameters, favorite patch, and Spin program files</CardDescription>
                  </div>
                  <Tooltip content="Enable or disable the FV-1 built-in patches on the device.">
                    <div className="flex shrink-0 items-center gap-2">
                      <Switch
                        checked={!currentState.builtInPatchesDisabled}
                        id="built-in-patches"
                        onCheckedChange={updateBuiltInPatchVisibility}
                      />
                      <Label htmlFor="built-in-patches">Built-in patches</Label>
                    </div>
                  </Tooltip>
                </CardHeader>
                <CardContent className="space-y-3 p-3 md:p-0">
                  <div className="grid gap-3 md:hidden">
                    {visiblePatches.map((patch) => {
                      const patchValue = patch.id
                      const fileInputId = `program-mobile-${patch.id}`
                      const isReadOnly = Boolean("readOnly" in patch && patch.readOnly)

                      return (
                        <div key={patch.id} className="rounded-md border border-border bg-background p-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">
                                {String(patch.id + 1).padStart(2, "0")}
                              </span>
                              <span className="truncate text-sm font-medium">{patch.name}</span>
                            </div>
                            <Tooltip content="Set as favorite patch">
                              <Button
                                aria-label={`Set patch ${patch.id + 1} as favorite`}
                                className={currentState.favoritePatch === patchValue ? "text-primary" : "text-muted-foreground"}
                                size="icon-sm"
                                type="button"
                                variant="ghost"
                                onClick={() => setCurrentState((state) => ({ ...state, favoritePatch: patchValue }))}
                              >
                                <Star className={currentState.favoritePatch === patchValue ? "fill-current" : ""} />
                              </Button>
                            </Tooltip>
                          </div>

                          <div className="grid gap-2">
                            {isReadOnly ? (
                              <Tooltip content="This field belongs to a built-in FV-1 patch and cannot be edited.">
                                <Input
                                  aria-label={`Patch ${patch.id + 1} name`}
                                  disabled
                                  value={patch.name}
                                  readOnly
                                />
                              </Tooltip>
                            ) : (
                              <Input
                                aria-label={`Patch ${patch.id + 1} name`}
                                value={patch.name}
                                onChange={(event) => updatePatchField(patch.id, "name", event.target.value)}
                              />
                            )}

                            {patch.parameters.map((parameter, index) =>
                              isReadOnly ? (
                                <Tooltip
                                  key={index}
                                  content="This field belongs to a built-in FV-1 patch and cannot be edited."
                                >
                                  <Input
                                    aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                    disabled
                                    value={parameter}
                                    readOnly
                                  />
                                </Tooltip>
                              ) : (
                                <Input
                                  key={index}
                                  aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                  value={parameter}
                                  onChange={(event) => updatePatchField(patch.id, "parameter", event.target.value, index)}
                                />
                              )
                            )}
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                            <span className="text-sm text-muted-foreground">Program</span>
                            {isReadOnly ? (
                              <div className="flex items-center gap-1.5">
                                <Tooltip content="Download built-in program placeholder">
                                  <Button
                                    aria-label={`Download patch ${patch.id + 1} program`}
                                    disabled={serialBusy}
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => void downloadPatchProgram(patch)}
                                  >
                                    <Download />
                                  </Button>
                                </Tooltip>
                                <Tooltip content="Built-in FV-1 programs cannot be replaced.">
                                  <Button
                                    aria-label={`Upload patch ${patch.id + 1} program`}
                                    disabled
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                  >
                                    <Upload />
                                  </Button>
                                </Tooltip>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Input
                                  id={fileInputId}
                                  accept=".hex,.bin"
                                  className="hidden"
                                  type="file"
                                  onChange={(event) => void handleProgramFile(patch.id, event.target.files?.[0])}
                                />
                                <Tooltip content="Download program">
                                  <Button
                                    aria-label={`Download patch ${patch.id + 1} program`}
                                    disabled={serialBusy}
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => void downloadPatchProgram(patch)}
                                  >
                                    <Download />
                                  </Button>
                                </Tooltip>
                                <Tooltip content="Upload binary or Intel HEX program">
                                  <Button
                                    aria-label={`Upload patch ${patch.id + 1} program`}
                                    disabled={serialBusy}
                                    size="icon-sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => document.getElementById(fileInputId)?.click()}
                                  >
                                    <Upload />
                                  </Button>
                                </Tooltip>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="hidden min-w-0 md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-right">#</TableHead>
                        <TableHead className="min-w-44">Patch name</TableHead>
                        <TableHead className="min-w-36">Parameter 1</TableHead>
                        <TableHead className="min-w-36">Parameter 2</TableHead>
                        <TableHead className="min-w-36">Parameter 3</TableHead>
                        <TableHead className="w-24 text-center">Favorite</TableHead>
                        <TableHead className="w-24">Program</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visiblePatches.map((patch) => {
                        const patchValue = patch.id
                        const fileInputId = `program-${patch.id}`
                        const isReadOnly = Boolean("readOnly" in patch && patch.readOnly)

                        return (
                          <TableRow key={patch.id}>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {patch.id + 1}
                            </TableCell>
                            <TableCell>
                              {isReadOnly ? (
                                <Tooltip content="This field belongs to a built-in FV-1 patch and cannot be edited.">
                                  <Input
                                    aria-label={`Patch ${patch.id + 1} name`}
                                    className={tableInputClassName}
                                    disabled
                                    value={patch.name}
                                    readOnly
                                  />
                                </Tooltip>
                              ) : (
                                <Input
                                  aria-label={`Patch ${patch.id + 1} name`}
                                  className={tableInputClassName}
                                  value={patch.name}
                                  onChange={(event) => updatePatchField(patch.id, "name", event.target.value)}
                                />
                              )}
                            </TableCell>
                            {patch.parameters.map((parameter, index) => (
                              <TableCell key={index}>
                                {isReadOnly ? (
                                  <Tooltip content="This field belongs to a built-in FV-1 patch and cannot be edited.">
                                    <Input
                                      aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                      className={tableInputClassName}
                                      disabled
                                      value={parameter}
                                      readOnly
                                    />
                                  </Tooltip>
                                ) : (
                                  <Input
                                    aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                    className={tableInputClassName}
                                    value={parameter}
                                    onChange={(event) =>
                                      updatePatchField(patch.id, "parameter", event.target.value, index)
                                    }
                                  />
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <Tooltip content="Set as favorite patch">
                                <Button
                                  aria-label={`Set patch ${patch.id + 1} as favorite`}
                                  className={currentState.favoritePatch === patchValue ? "text-primary" : "text-muted-foreground"}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setCurrentState((state) => ({ ...state, favoritePatch: patchValue }))}
                                >
                                  <Star className={currentState.favoritePatch === patchValue ? "fill-current" : ""} />
                                </Button>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {isReadOnly ? (
                                <div className="flex items-center gap-1.5">
                                  <Tooltip content="Download built-in program placeholder">
                                    <Button
                                      aria-label={`Download patch ${patch.id + 1} program`}
                                      disabled={serialBusy}
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => void downloadPatchProgram(patch)}
                                    >
                                      <Download />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip content="Built-in FV-1 programs cannot be replaced.">
                                    <Button
                                      aria-label={`Upload patch ${patch.id + 1} program`}
                                      disabled
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                    >
                                      <Upload />
                                    </Button>
                                  </Tooltip>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    id={fileInputId}
                                    accept=".hex,.bin"
                                    className="hidden"
                                    type="file"
                                    onChange={(event) => void handleProgramFile(patch.id, event.target.files?.[0])}
                                  />
                                  <Tooltip content="Download program">
                                    <Button
                                      aria-label={`Download patch ${patch.id + 1} program`}
                                      disabled={serialBusy}
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => void downloadPatchProgram(patch)}
                                    >
                                      <Download />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip content="Upload binary or Intel HEX program">
                                    <Button
                                      aria-label={`Upload patch ${patch.id + 1} program`}
                                      disabled={serialBusy}
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => document.getElementById(fileInputId)?.click()}
                                    >
                                      <Upload />
                                    </Button>
                                  </Tooltip>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </CardContent>
              </Card>

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <DisabledActionTooltip disabled={!hasChanges || serialBusy} message={unavailableMessage}>
                  <Button
                    className="w-full sm:w-auto"
                    disabled={!hasChanges || serialBusy}
                    variant="outline"
                    onClick={() => void uploadSettings()}
                  >
                    <Upload />
                    Upload settings without reviewing
                  </Button>
                </DisabledActionTooltip>
                <DisabledActionTooltip disabled={!hasChanges || serialBusy} message={unavailableMessage}>
                  <Button className="w-full sm:w-auto" disabled={!hasChanges || serialBusy} onClick={() => goToStep("review")}>
                    Review Changes
                  </Button>
                </DisabledActionTooltip>
              </div>
            </TabPanel>
          ) : null}

          {activeStep === "review" ? (
            <TabPanel>
            <Card className="w-full">
              <CardHeader className="flex flex-col items-center gap-3 text-center md:flex-row md:items-center md:justify-between md:text-left">
                <div className="min-w-0">
                  <CardTitle>View and Modify Changes</CardTitle>
                  <CardDescription>Review the staged settings before uploading them to the pedal.</CardDescription>
                </div>
                <Badge className="bg-muted text-muted-foreground">{changeRows.length} pending</Badge>
              </CardHeader>
              <CardContent className="grid gap-4">
                {changeRows.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Setting</TableHead>
                        <TableHead>Current</TableHead>
                        <TableHead>New</TableHead>
                        <TableHead className="w-20 text-center">Revert</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changeRows.map((row) => (
                        <TableRow key={`${row.label}-${row.before}-${row.after}`}>
                          <TableCell className="font-medium">{row.label}</TableCell>
                          <TableCell className="text-muted-foreground">{row.before}</TableCell>
                          <TableCell className="font-medium text-primary">{row.after}</TableCell>
                          <TableCell className="text-center">
                            <Tooltip content={`Discard ${row.label} change`}>
                              <Button
                                aria-label={`Discard ${row.label} change`}
                                size="icon-sm"
                                type="button"
                                variant="destructive"
                                onClick={row.revert}
                              >
                                <Undo2 />
                              </Button>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No settings have changed.
                  </div>
                )}
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                  <Button className="w-full sm:w-auto" variant="outline" onClick={() => goToStep("settings")}>
                    Change Settings
                  </Button>
                  <DisabledActionTooltip disabled={!hasChanges || serialBusy} message={unavailableMessage}>
                    <Button className="w-full sm:w-auto" disabled={!hasChanges || serialBusy} onClick={() => void uploadSettings()}>
                      <Upload />
                      Upload settings
                    </Button>
                  </DisabledActionTooltip>
                </div>
              </CardContent>
            </Card>
            </TabPanel>
          ) : null}
        </div>
      </main>
    </TooltipProvider>
  )
}
