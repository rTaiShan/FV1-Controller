"use client"

import { useEffect, useState } from "react"
import { Cable, ChevronDown, ChevronRight, Download, Menu as MenuIcon, Star, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SegmentedControl, type SegmentedControlOption } from "@/components/ui/segmented-control"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip"

type AppSerialPort = {
  close: () => Promise<void>
  open: (options: { baudRate: number }) => Promise<void>
  readable: ReadableStream<Uint8Array> | null
  writable: WritableStream<Uint8Array> | null
}

type SerialNavigator = Navigator & {
  serial?: {
    getPorts: () => Promise<AppSerialPort[]>
    requestPort: (options?: { filters?: SerialPortFilter[] }) => Promise<AppSerialPort>
  }
}

type SerialPortFilter = {
  usbProductId?: number
  usbVendorId?: number
}

type Step = "connect" | "settings" | "review"

const BAUD_RATE = 57600
const SAVED_SERIAL_PERMISSION_KEY = "fv1-controller-serial-authorized"
const serialPortFilters: SerialPortFilter[] = [
  { usbVendorId: 0x2341 }, // Arduino
  { usbVendorId: 0x2a03 }, // Arduino.org
  { usbVendorId: 0x1a86 }, // WCH CH340/CH341
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x067b }, // Prolific PL2303
]

const mockSerialPort: AppSerialPort = {
  close: async () => undefined,
  open: async () => undefined,
  readable: null,
  writable: null,
}

const footswitchModeOptions: SegmentedControlOption[] = [
  { value: "toggle", label: "Toggle" },
  { value: "momentary", label: "Momentary" },
]

const screenSettings = [
  { key: "bias", label: "Bias", defaultValue: 4, min: 0, max: 7 },
  { key: "contrast", label: "Contrast", defaultValue: 85, min: 0, max: 127 },
] as const

const tableInputClassName =
  "h-8 border-transparent bg-transparent shadow-none hover:border-input focus-visible:border-ring disabled:border-transparent disabled:bg-transparent disabled:opacity-60"

const editablePatches = Array.from({ length: 24 }, (_, index) => ({
  id: index,
  name: `Custom ${String(index + 1).padStart(2, "0")}`,
  parameters:
    index === 0
      ? ["Gain 3", "Tone 2", "Mix 4"]
      : index === 1
        ? ["Rate 4", "Depth 5", "Mix 6"]
        : index === 2
          ? ["Delay 3", "FB 4", "Mix 5"]
          : ["-", "-", "-"],
  programFile: "",
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

function getSerialApi() {
  if (typeof navigator === "undefined") {
    return undefined
  }

  return (navigator as SerialNavigator).serial
}

async function readSerialLine(reader: ReadableStreamDefaultReader<Uint8Array>, timeoutMs: number) {
  const decoder = new TextDecoder()
  const deadline = Date.now() + timeoutMs
  let buffer = ""

  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now())
    const result = await Promise.race([
      reader.read(),
      new Promise<"timeout">((resolve) => window.setTimeout(() => resolve("timeout"), remainingMs)),
    ])

    if (result === "timeout") {
      await reader.cancel()
      return buffer.trim()
    }

    if (result.done) {
      return buffer.trim()
    }

    buffer += decoder.decode(result.value, { stream: true })
    const lineEnd = buffer.indexOf("\n")

    if (lineEnd >= 0) {
      return buffer.slice(0, lineEnd).replace(/\r/g, "").trim()
    }
  }

  return buffer.trim()
}

async function probePortWithPing(port: AppSerialPort) {
  await port.open({ baudRate: BAUD_RATE })

  const writer = port.writable?.getWriter()
  if (!writer || !port.readable) {
    throw new Error("Serial port is not readable and writable.")
  }

  try {
    await writer.write(new TextEncoder().encode("PING\n"))
  } finally {
    writer.releaseLock()
  }

  const reader = port.readable.getReader()
  try {
    const response = await readSerialLine(reader, 1500)
    if (response !== "OK FV1_CONTROLLER") {
      throw new Error(`Unexpected PING response: ${response || "no response"}`)
    }
  } finally {
    reader.releaseLock()
  }
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

  function updateValue(nextValue: number) {
    onValueChange(Math.min(max, Math.max(min, nextValue)))
  }

  return (
    <div className="grid gap-2.5">
      <div className="flex items-center gap-2">
        <ChevronRight className="size-3 rotate-90 text-muted-foreground" />
        <Label htmlFor={label}>{label}</Label>
      </div>
      <div className="grid gap-1">
        <Slider max={max} min={min} onValueChange={updateValue} value={value} />
        <div className="relative h-5 text-xs text-muted-foreground">
          <span className="absolute left-0 top-0">{min}</span>
          <span
            className="absolute top-0 -translate-x-1/2 font-semibold text-foreground"
            style={{ left: `${percentage}%` }}
          >
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
    { id: "connect", label: "1. Connect to Serial device" },
    { id: "settings", label: "2. Select Settings" },
    { id: "review", label: "3. View and modify changes" },
  ]

  return (
    <div className="grid gap-2 rounded-lg border border-border bg-card p-1 md:grid-cols-3">
      {steps.map((step) => {
        const locked = step.id !== "connect" && !connected

        return (
          <button
            key={step.id}
            className={[
              "rounded-md px-3 py-2 text-center text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              activeStep === step.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              locked ? "cursor-not-allowed opacity-50 hover:bg-transparent" : "",
            ].join(" ")}
            onClick={() => onStepChange(step.id)}
            type="button"
          >
            {step.label}
          </button>
        )
      })}
    </div>
  )
}

function DisabledActionTooltip({
  children,
  disabled,
}: {
  children: React.ReactElement
  disabled: boolean
}) {
  if (!disabled) {
    return children
  }

  return (
    <Tooltip content="There are no pending changes to upload or review.">
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
  const [footswitchMode, setFootswitchMode] = useState("toggle")
  const [favoritePatch, setFavoritePatch] = useState("0")
  const [builtInPatchesDisabled, setBuiltInPatchesDisabled] = useState(false)
  const [programFiles, setProgramFiles] = useState<Record<number, File>>({})
  const [serialPort, setSerialPort] = useState<AppSerialPort | null>(null)
  const [screenValues, setScreenValues] = useState({ bias: 4, contrast: 85 })
  const visiblePatches = builtInPatchesDisabled ? editablePatches : [...editablePatches, ...builtInPatches]
  const connected = serialPort !== null

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
            await probePortWithPing(port)

            if (!cancelled) {
              setSerialPort(port)
              setActiveStep("settings")
              setConnectionMessage("Connected to saved serial device.")
            }
            return
          } catch {
            try {
              await port.close()
            } catch {
              // Ignore close failures while probing stale saved ports.
            }
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

  function getPatchProgramFileName(patchName: string, patchNumber: number) {
    return `${String(patchNumber).padStart(2, "0")}-${patchName.toLowerCase().replaceAll(" ", "-")}.spn`
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

    setConnecting(true)
    setConnectionMessage("Waiting for serial device selection...")

    try {
      const nextPort = await serial.requestPort({ filters: serialPortFilters })

      if (serialPort) {
        await serialPort.close().catch(() => undefined)
      }

      setConnectionMessage("Verifying device with PING...")
      await probePortWithPing(nextPort)
      window.localStorage.setItem(SAVED_SERIAL_PERMISSION_KEY, "1")
      setSerialPort(nextPort)
      setConnectionMessage("Connected and verified with PING.")
      setActiveStep("settings")
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        setConnectionMessage("Select a serial device to begin.")
        return
      }

      const detail = error instanceof Error ? error.message : "Could not connect to the serial device."

      setConnectionMessage(detail)
    } finally {
      setConnecting(false)
    }
  }

  function useMockDevice() {
    setSerialPort(mockSerialPort)
    setActiveStep("settings")
    setConnectionMessage("Using mocked serial device.")
  }

  function downloadPatchProgram(patch: (typeof visiblePatches)[number]) {
    const uploadedFile = programFiles[patch.id]
    const file =
      uploadedFile ||
      new File(
        [
          `; ${patch.name}\n`,
          `; ${patch.parameters[0]}\n`,
          `; ${patch.parameters[1]}\n`,
          `; ${patch.parameters[2]}\n`,
          ";\n; Program download will contain real FV-1 program bytes once device reads are wired.\n",
        ],
        getPatchProgramFileName(patch.name, patch.id + 1),
        { type: "text/plain" }
      )
    const url = URL.createObjectURL(file)
    const link = document.createElement("a")

    link.href = url
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  function uploadSettings() {
    setConnectionMessage("Upload flow is ready for protocol wiring.")
  }

  function reloadSettingsFromPedal() {
    setConnectionMessage("Reload settings from pedal is ready for DUMP protocol wiring.")
  }

  function getCurrentSettingsJson() {
    return {
      builtInPatchesEnabled: !builtInPatchesDisabled,
      favoritePatch: Number(favoritePatch),
      footswitchMode,
      screen: screenValues,
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

      if (parsed.footswitchMode === "toggle" || parsed.footswitchMode === "momentary") {
        setFootswitchMode(parsed.footswitchMode)
      }
      if (typeof parsed.favoritePatch === "number") {
        setFavoritePatch(String(Math.max(0, Math.min(31, parsed.favoritePatch))))
      }
      if (typeof parsed.builtInPatchesEnabled === "boolean") {
        updateBuiltInPatchVisibility(parsed.builtInPatchesEnabled)
      }
      if (parsed.screen) {
        setScreenValues((current) => ({
          bias:
            typeof parsed.screen?.bias === "number"
              ? Math.max(0, Math.min(7, parsed.screen.bias))
              : current.bias,
          contrast:
            typeof parsed.screen?.contrast === "number"
              ? Math.max(0, Math.min(127, parsed.screen.contrast))
              : current.contrast,
        }))
      }
    } catch {
      setConnectionMessage("Could not import settings JSON.")
    } finally {
      event.target.value = ""
    }
  }

  function updateBuiltInPatchVisibility(enabled: boolean) {
    setBuiltInPatchesDisabled(!enabled)
    if (!enabled && Number(favoritePatch) >= editablePatches.length) {
      setFavoritePatch("0")
    }
  }

  const possibleChangeRows = [
    ["Footswitch mode", "Toggle", footswitchMode === "toggle" ? "Toggle" : "Momentary"],
    ["Bias", "4", String(screenValues.bias)],
    ["Contrast", "85", String(screenValues.contrast)],
    ["Built-in patches", "Enabled", builtInPatchesDisabled ? "Disabled" : "Enabled"],
    ["Favorite patch", "1", String(Number(favoritePatch) + 1)],
  ]
  const changeRows = possibleChangeRows.filter(([, before, after]) => before !== after)
  const hasChanges = changeRows.length > 0

  return (
    <TooltipProvider>
      <main className="min-h-svh overflow-x-hidden bg-background text-foreground">
        <div className="mx-auto flex min-w-0 w-full max-w-6xl flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Cable className="size-4" />
                <span>FV1 Pedal Editor</span>
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-normal md:text-3xl">Edit Settings and Patches</h1>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="settings-json-import"
                accept="application/json,.json"
                className="sr-only"
                type="file"
                onChange={importSettingsFromJson}
              />
              <DropdownMenu>
                <DropdownMenuTrigger openOnHover render={<Button aria-label="Open menu" size="icon" variant="outline" />}>
                  <MenuIcon />
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={reloadSettingsFromPedal}>Reload Settings from Pedal</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportCurrentSettingsAsJson}>
                    Export Current Settings as JSON
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => document.getElementById("settings-json-import")?.click()}>
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
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Connect to Serial Device</CardTitle>
                  <CardDescription>{connectionMessage}</CardDescription>
                </div>
                <div className="flex">
                  <Button className="rounded-r-none" disabled={connecting} onClick={selectSerialDevice}>
                    <Cable />
                    {connecting ? "Connecting..." : "Select serial device"}
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          aria-label="More connection options"
                          className="rounded-l-none border-l-primary-foreground/20 px-2"
                          disabled={connecting}
                        />
                      }
                    >
                      <ChevronDown />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={useMockDevice}>Use mock device</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
            </Card>
          ) : null}

          {activeStep === "settings" ? (
            <div className="grid min-w-0 gap-5">
              <section className="grid min-w-0 gap-5 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Footswitch</CardTitle>
                    <CardDescription>Bypass switch behavior</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                      <SegmentedControl
                        aria-label="Footswitch mode"
                        onValueChange={setFootswitchMode}
                        options={footswitchModeOptions}
                        value={footswitchMode}
                      />
                      <div className="grid gap-1 border-t border-border pt-3">
                        <div className="text-sm font-medium text-foreground">
                          {footswitchMode === "toggle" ? "Toggle mode" : "Momentary mode"}
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {footswitchMode === "toggle"
                            ? "Press once to switch bypass state."
                            : "Hold to keep the effect active, release to bypass."}
                        </p>
                      </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
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
                        onValueChange={(value) => setScreenValues((current) => ({ ...current, [setting.key]: value }))}
                        value={screenValues[setting.key]}
                      />
                    ))}
                  </CardContent>
                </Card>
              </section>

              <Card>
                <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Edit Patches</CardTitle>
                    <CardDescription>Patch names, screen parameters, favorite patch, and Spin program files</CardDescription>
                  </div>
                  <Tooltip content="Enable or disable the FV-1 built-in patches on the device.">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!builtInPatchesDisabled}
                        id="built-in-patches"
                        onCheckedChange={updateBuiltInPatchVisibility}
                      />
                      <Label htmlFor="built-in-patches">Built-in patches</Label>
                    </div>
                  </Tooltip>
                </CardHeader>
                <CardContent className="space-y-4 p-0">
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
                        const patchValue = String(patch.id)
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
                                    defaultValue={patch.name}
                                    disabled
                                  />
                                </Tooltip>
                              ) : (
                                <Input
                                  aria-label={`Patch ${patch.id + 1} name`}
                                  className={tableInputClassName}
                                  defaultValue={patch.name}
                                />
                              )}
                            </TableCell>
                            {patch.parameters.map((parameter, index) => (
                              <TableCell key={index}>
                                {isReadOnly ? (
                                  <Tooltip content="This field belongs to a built-in FV-1 patch and cannot be edited.">
                                    <Input
                                      defaultValue={parameter}
                                      aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                      className={tableInputClassName}
                                      disabled
                                    />
                                  </Tooltip>
                                ) : (
                                  <Input
                                    defaultValue={parameter}
                                    aria-label={`Patch ${patch.id + 1} parameter ${index + 1}`}
                                    className={tableInputClassName}
                                  />
                                )}
                              </TableCell>
                            ))}
                            <TableCell className="text-center">
                              <Tooltip content="Set as favorite patch">
                                <Button
                                  aria-label={`Set patch ${patch.id + 1} as favorite`}
                                  className={favoritePatch === patchValue ? "text-primary" : "text-muted-foreground"}
                                  size="icon-sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setFavoritePatch(patchValue)}
                                >
                                  <Star className={favoritePatch === patchValue ? "fill-current" : ""} />
                                </Button>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {isReadOnly ? (
                                <div className="flex items-center gap-1.5">
                                  <Tooltip content="Download built-in program">
                                    <Button
                                      aria-label={`Download patch ${patch.id + 1} program`}
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => downloadPatchProgram(patch)}
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
                                    accept=".spn,.spin,.hex,.bin"
                                    className="sr-only"
                                    type="file"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0]
                                      if (file) {
                                        setProgramFiles((currentFiles) => ({
                                          ...currentFiles,
                                          [patch.id]: file,
                                        }))
                                      }
                                    }}
                                  />
                                  <Tooltip content="Download program">
                                    <Button
                                      aria-label={`Download patch ${patch.id + 1} program`}
                                      size="icon-sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => downloadPatchProgram(patch)}
                                    >
                                      <Download />
                                    </Button>
                                  </Tooltip>
                                  <Tooltip content="Upload Spin file">
                                    <Button
                                      aria-label={`Upload patch ${patch.id + 1} program`}
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
                </CardContent>
              </Card>

              <div className="flex flex-wrap justify-end gap-2">
                <DisabledActionTooltip disabled={!hasChanges}>
                  <Button disabled={!hasChanges} variant="outline" onClick={uploadSettings}>
                    <Upload />
                    Upload settings without reviewing
                  </Button>
                </DisabledActionTooltip>
                <DisabledActionTooltip disabled={!hasChanges}>
                  <Button disabled={!hasChanges} onClick={() => goToStep("review")}>
                    Review Changes
                  </Button>
                </DisabledActionTooltip>
              </div>
            </div>
          ) : null}

          {activeStep === "review" ? (
            <Card>
              <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changeRows.map(([label, before, after]) => (
                        <TableRow key={label}>
                          <TableCell className="font-medium">{label}</TableCell>
                          <TableCell className="text-muted-foreground">{before}</TableCell>
                          <TableCell className="font-medium text-primary">{after}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                    No settings have changed.
                  </div>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <DisabledActionTooltip disabled={!hasChanges}>
                    <Button disabled={!hasChanges} onClick={uploadSettings}>
                      <Upload />
                      Upload settings
                    </Button>
                  </DisabledActionTooltip>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </main>
    </TooltipProvider>
  )
}
