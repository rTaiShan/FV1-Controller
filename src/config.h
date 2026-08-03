#pragma once

#include <Arduino.h>

namespace fv1controller {

constexpr uint32_t BAUDRATE = 9600;
constexpr uint8_t NUMPATCHES = 32;
constexpr uint8_t SAVEDPATCHADDR = 180;
constexpr uint8_t BIASADDR = 128;
constexpr uint8_t CONTRASTADDR = 132;
constexpr uint8_t SIPO_DATA_BITS = 8;
constexpr uint32_t DISPLAY_BACKLIGHT_TIMEOUT_MS = 20000;
constexpr uint8_t EFFECT_LINES_PER_PATCH = 4;

}  // namespace fv1controller
