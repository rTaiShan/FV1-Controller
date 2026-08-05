#include <Arduino.h>
#include "config.h"
#include "controller_state.h"
#include "display_handler.h"
#include "input_handler.h"
#include "protocol_handler.h"
#include "sipo_handler.h"

void setup()
{
    Serial.begin(fv1controller::BAUDRATE);
    initializePins();
    initializeFootswitchInterrupt();
    initializeDisplay();
    loadFavoritePatchSelection();
    loadStoredSwitchMode();
}

void loop()
{
    handleProtocol();
    handleEncoderButton();
    updateRotary();
    handleSIPOEncoder();
    handleScreen();
}

namespace {
void (*const arduinoEntryPoints[])() = {setup, loop};
}
