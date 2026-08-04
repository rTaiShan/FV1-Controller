#pragma once

#include <Arduino.h>
#include "config.h"
#include "controller_state.h"

void initializePins();
void handleEncoderButton();
void updateRotary();
int8_t readRotary();
uint8_t readFavoritePatchSelection();
void loadFavoritePatchSelection();
void loadStoredSwitchMode();
