#include <Arduino.h>
#include "config.h"
#include "controller_state.h"
#include "display_handler.h"
#include "input_handler.h"
#include "sipo_handler.h"

// #define DEBUG

void setup()
{
    Serial.begin(fv1controller::BAUDRATE);
    initializePins();
    initializeFootswitchInterrupt();
    initializeDisplay();
    getFavoritePatch();
    getStoredMode();
}

void loop()
{
    handleEncoderButton();
    updateRotary();
    handleSIPOEncoder();
#ifdef DEBUG
    handleScreenCallibration();
#endif
    handleScreen();
}
