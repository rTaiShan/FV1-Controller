#include "sipo_handler.h"
#include "protocol_handler.h"

namespace {

volatile bool footswitchInterruptPending = false;
volatile unsigned long footswitchLastInterruptMicros = 0;
unsigned long footswitchLastDebounceMillis = 0;
constexpr unsigned long FOOTSWITCH_DEBOUNCE_MS = 20;
constexpr unsigned long FOOTSWITCH_ISR_DEBOUNCE_US = 5000;
bool externalEepromAccessActive = false;
bool savedSipoData[fv1controller::SIPO_DATA_BITS];

void clearFootswitchInputState()
{
    unsigned long interruptMicros = micros();
    unsigned long debounceMillis = millis();

    noInterrupts();
    footswitchInterruptPending = false;
    footswitchLastInterruptMicros = interruptMicros;
    interrupts();

    footswitchLastDebounceMillis = debounceMillis;
}

}  // namespace

void initializeFootswitchInterrupt()
{
    attachInterrupt(digitalPinToInterrupt(fv1controller::FSWPIN), handleFootswitchInterrupt, CHANGE);
}

void handleFootswitchInterrupt()
{
    unsigned long now = micros();
    if (now - footswitchLastInterruptMicros < FOOTSWITCH_ISR_DEBOUNCE_US)
    {
        return;
    }
    footswitchLastInterruptMicros = now;
    footswitchInterruptPending = true;
}

void processFootswitchInput()
{
    if (!footswitchInterruptPending)
    {
        return;
    }

    unsigned long now = millis();
    if (now - footswitchLastDebounceMillis < FOOTSWITCH_DEBOUNCE_MS)
    {
        return;
    }

    footswitchInterruptPending = false;
    footswitchLastDebounceMillis = now;

    bool currentState = digitalRead(fv1controller::FSWPIN);
    if (momentarySwitch)
    {
        sipoData[fv1controller::RELAYINDEX] = !currentState;
    }
    else if (currentState == LOW)
    {
        sipoData[fv1controller::RELAYINDEX] = !sipoData[fv1controller::RELAYINDEX];
    }
}

void updateSipoData()
{
    if (externalEepromAccessActive)
    {
        return;
    }

    processFootswitchInput();

    const bool selectedCustomPatch = selectedProgram < fv1controller::CUSTOM_PATCH_COUNT;
    const uint8_t selectedExternalBank = selectedProgram / 8;

    sipoData[fv1controller::T0INDEX] = selectedCustomPatch;
    sipoData[fv1controller::S0INDEX] = selectedProgram & 1;
    sipoData[fv1controller::S1INDEX] = selectedProgram & 2;
    sipoData[fv1controller::S2INDEX] = selectedProgram & 4;

    sipoData[fv1controller::EEPROMENABLE0INDEX] = !(selectedCustomPatch && selectedExternalBank == 0);
    sipoData[fv1controller::EEPROMENABLE1INDEX] = !(selectedCustomPatch && selectedExternalBank == 1);
    sipoData[fv1controller::EEPROMENABLE2INDEX] = !(selectedCustomPatch && selectedExternalBank == 2);
}

bool dataChanged()
{
    for (int i = 0; i < fv1controller::SIPO_DATA_BITS; i++)
    {
        if (sipoData[i] != oldSipoData[i])
        {
            return true;
        }
    }
    return false;
}

void writeSipoData()
{
    if (!dataChanged())
    {
        return;
    }
#ifdef DEBUG
    printSipoData();
#endif
    digitalWrite(fv1controller::SIPOSTROBEPIN, LOW);
    for (int i = fv1controller::SIPO_DATA_BITS - 1; i >= 0; i--)
    {
        digitalWrite(fv1controller::SIPOCLOCKPIN, LOW);
        digitalWrite(fv1controller::SIPODATAPIN, sipoData[i]);
        digitalWrite(fv1controller::SIPOCLOCKPIN, HIGH);
    }
    digitalWrite(fv1controller::SIPOSTROBEPIN, HIGH);
    for (int i = 0; i < fv1controller::SIPO_DATA_BITS; i++)
    {
        oldSipoData[i] = sipoData[i];
    }
    digitalWrite(fv1controller::SIPOSTROBEPIN, LOW);
}

void handleSIPOEncoder()
{
    updateSipoData();
    writeSipoData();
}

bool beginExternalEepromAccess(uint8_t idx)
{
    if (idx < 1 || idx > 3 || externalEepromAccessActive)
    {
        return false;
    }

    for (uint8_t i = 0; i < fv1controller::SIPO_DATA_BITS; i++)
    {
        savedSipoData[i] = sipoData[i];
    }

    clearFootswitchInputState();
    externalEepromAccessActive = true;
    sipoData[fv1controller::RELAYINDEX] = LOW;
    sipoData[fv1controller::T0INDEX] = LOW;
    sipoData[fv1controller::EEPROMENABLE0INDEX] = HIGH;
    sipoData[fv1controller::EEPROMENABLE1INDEX] = HIGH;
    sipoData[fv1controller::EEPROMENABLE2INDEX] = HIGH;

    switch (idx)
    {
        case 1:
            sipoData[fv1controller::EEPROMENABLE0INDEX] = LOW;
            break;
        case 2:
            sipoData[fv1controller::EEPROMENABLE1INDEX] = LOW;
            break;
        case 3:
            sipoData[fv1controller::EEPROMENABLE2INDEX] = LOW;
            break;
        default:
            return false;
    }

    writeSipoData();
    return true;
}

void endExternalEepromAccess()
{
    if (!externalEepromAccessActive)
    {
        return;
    }

    for (uint8_t i = 0; i < fv1controller::SIPO_DATA_BITS; i++)
    {
        sipoData[i] = savedSipoData[i];
    }
    writeSipoData();
    clearFootswitchInputState();
    externalEepromAccessActive = false;
}

#ifdef DEBUG
void printSipoData()
{
    sendProtocolPrint("RELAY at pin Q" + String(fv1controller::RELAYINDEX + 1) + (sipoData[fv1controller::RELAYINDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("T0 at pin Q" + String(fv1controller::T0INDEX + 1) + (sipoData[fv1controller::T0INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("S0 at pin Q" + String(fv1controller::S0INDEX + 1) + (sipoData[fv1controller::S0INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("S1 at pin Q" + String(fv1controller::S1INDEX + 1) + (sipoData[fv1controller::S1INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("S2 at pin Q" + String(fv1controller::S2INDEX + 1) + (sipoData[fv1controller::S2INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("EEPROMENABLE0 at pin Q" + String(fv1controller::EEPROMENABLE0INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE0INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("EEPROMENABLE1 at pin Q" + String(fv1controller::EEPROMENABLE1INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE1INDEX] ? " HIGH" : " LOW"));
    sendProtocolPrint("EEPROMENABLE2 at pin Q" + String(fv1controller::EEPROMENABLE2INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE2INDEX] ? " HIGH" : " LOW"));
}
#endif

namespace {
void (*const sipoVoidEntryPoints[])() = {
    initializeFootswitchInterrupt,
    handleSIPOEncoder,
    endExternalEepromAccess,
};

bool (*const sipoIndexedEntryPoints[])(uint8_t) = {
    beginExternalEepromAccess,
};
}
