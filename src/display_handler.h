#pragma once

#include <Arduino.h>
#include <Adafruit_PCD8544.h>
#include "config.h"
#include "effects.h"
#include "controller_state.h"

extern Adafruit_PCD8544 display;

void initializeDisplay();
void drawEffect();
void drawScreen();
void handleScreen();
