#include "sipo_handler.h"

namespace {

volatile bool footswitchInterruptPending = false;
volatile unsigned long footswitchLastInterruptMicros = 0;
unsigned long footswitchLastDebounceMillis = 0;
constexpr unsigned long FOOTSWITCH_DEBOUNCE_MS = 20;
constexpr unsigned long FOOTSWITCH_ISR_DEBOUNCE_US = 5000;

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
    processFootswitchInput();

    sipoData[fv1controller::T0INDEX] = (selectedProgram >= 8);
    sipoData[fv1controller::S0INDEX] = selectedProgram & 1;
    sipoData[fv1controller::S1INDEX] = selectedProgram & 2;
    sipoData[fv1controller::S2INDEX] = selectedProgram & 4;

    sipoData[fv1controller::EEPROMENABLE0INDEX] = !(selectedProgram >= 8 && selectedProgram < 16);
    sipoData[fv1controller::EEPROMENABLE1INDEX] = !(selectedProgram >= 16 && selectedProgram < 24);
    sipoData[fv1controller::EEPROMENABLE2INDEX] = !(selectedProgram >= 24);
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

void printSipoData()
{
    Serial.println("RELAY at pin Q" + String(fv1controller::RELAYINDEX + 1) + (sipoData[fv1controller::RELAYINDEX] ? " HIGH" : " LOW"));
    Serial.println("T0 at pin Q" + String(fv1controller::T0INDEX + 1) + (sipoData[fv1controller::T0INDEX] ? " HIGH" : " LOW"));
    Serial.println("S0 at pin Q" + String(fv1controller::S0INDEX + 1) + (sipoData[fv1controller::S0INDEX] ? " HIGH" : " LOW"));
    Serial.println("S1 at pin Q" + String(fv1controller::S1INDEX + 1) + (sipoData[fv1controller::S1INDEX] ? " HIGH" : " LOW"));
    Serial.println("S2 at pin Q" + String(fv1controller::S2INDEX + 1) + (sipoData[fv1controller::S2INDEX] ? " HIGH" : " LOW"));
    Serial.println("EEPROMENABLE0 at pin Q" + String(fv1controller::EEPROMENABLE0INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE0INDEX] ? " HIGH" : " LOW"));
    Serial.println("EEPROMENABLE1 at pin Q" + String(fv1controller::EEPROMENABLE1INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE1INDEX] ? " HIGH" : " LOW"));
    Serial.println("EEPROMENABLE2 at pin Q" + String(fv1controller::EEPROMENABLE2INDEX + 1) + (sipoData[fv1controller::EEPROMENABLE2INDEX] ? " HIGH" : " LOW"));
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
