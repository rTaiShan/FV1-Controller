#pragma once

#include <Arduino.h>

namespace fv1controller {

constexpr uint32_t BAUDRATE = 57600;
constexpr uint8_t CUSTOM_PATCH_COUNT = 24;
constexpr uint8_t BUILTIN_PATCH_COUNT = 8;
#ifdef DISABLE_BUILTIN_PATCHES
constexpr uint8_t NUMPATCHES = CUSTOM_PATCH_COUNT;
#else
constexpr uint8_t NUMPATCHES = CUSTOM_PATCH_COUNT + BUILTIN_PATCH_COUNT;
#endif
constexpr uint16_t EEPROM_CONFIG_BASE = 768;
constexpr uint16_t SAVEDPATCHADDR = EEPROM_CONFIG_BASE;
constexpr uint16_t MOMENTARYMODEADDR = EEPROM_CONFIG_BASE + 1;
constexpr uint16_t BIASADDR = EEPROM_CONFIG_BASE + 2;
constexpr uint16_t CONTRASTADDR = EEPROM_CONFIG_BASE + 3;
constexpr uint8_t SIPO_DATA_BITS = 8;
constexpr uint32_t DISPLAY_BACKLIGHT_TIMEOUT_MS = 20000;
constexpr uint8_t EFFECT_LINES_PER_PATCH = 4;

}  // namespace fv1controller
