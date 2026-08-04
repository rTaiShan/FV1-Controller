#pragma once

#include <Arduino.h>
#include "controller_state.h"

void initializeFootswitchInterrupt();
void handleFootswitchInterrupt();
void updateSipoData();
void writeSipoData();
void handleSIPOEncoder();
void printSipoData();
bool dataChanged();
bool beginExternalEepromAccess(uint8_t idx);
void endExternalEepromAccess();
