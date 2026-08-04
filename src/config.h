#pragma once

#include <Arduino.h>

namespace fv1controller {

// Uncomment to enable protocol-shaped SIPO debug output.
// #define DEBUG

constexpr uint32_t BAUDRATE = 57600;
constexpr uint8_t CUSTOM_PATCH_COUNT = 24;
constexpr uint8_t BUILTIN_PATCH_COUNT = 8;
// Uncomment to hide the 8 built-in FV1 patches and expose only the 24 customizable slots.
// #define DISABLE_BUILTIN_PATCHES
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
constexpr uint8_t PROTOCOL_LINE_BUFFER_SIZE = 128;
constexpr uint8_t PROTOCOL_MAX_WRITE_LEN = 30;
constexpr uint8_t PROTOCOL_DUMP_CHUNK_LEN = 32;
constexpr uint16_t INTERNAL_EEPROM_SIZE = 1024;
constexpr uint16_t EXTERNAL_EEPROM_SIZE = 4096;
constexpr uint8_t EXTERNAL_EEPROM_PAGE_SIZE = 32;
constexpr uint8_t EXTERNAL_EEPROM_I2C_ADDR = 0x50;
constexpr uint32_t EXTERNAL_EEPROM_WIRE_TIMEOUT_US = 25000;

}  // namespace fv1controller
