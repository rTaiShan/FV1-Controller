#pragma once

#include <Arduino.h>
#include <EEPROM.h>
#include "config.h"
#include "controller_state.h"
#include "display_handler.h"

void initializePins();
void handleEncoderButton();
void updateRotary();
int8_t readRotary();
void getFavoritePatch();
void getStoredMode();
void handleScreenCallibration();
