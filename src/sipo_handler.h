#pragma once

#include <Arduino.h>
#include "controller_state.h"

void initializeFootswitchInterrupt();
void handleFootswitchInterrupt();
void updateSipoData();
void writeSipoData();
void handleSIPOEncoder();
#ifdef DEBUG
void printSipoData();
#endif
bool dataChanged();
bool beginExternalEepromAccess(uint8_t idx);
void endExternalEepromAccess();
