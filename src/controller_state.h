#pragma once

#include <Arduino.h>
#include <PinButton.h>
#include "config.h"
#include "enc4094.h"
#include "pins.h"

extern long lastUpdate;

extern bool sipoData[fv1controller::SIPO_DATA_BITS];
extern bool oldSipoData[fv1controller::SIPO_DATA_BITS];
extern PinButton encoderButton;

extern uint8_t prevNextCode;
extern uint16_t store;

extern bool momentarySwitch;
extern bool builtinPatchesDisabled;
extern int8_t selectedProgram;
extern int8_t oldSelectedProgram;

uint8_t getAvailablePatchCount();
