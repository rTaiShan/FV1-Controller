#pragma once

#if __has_include(<Arduino.h>)
#include <Arduino.h>
#else
#include <stdint.h>
#endif
#include <stdlib.h>
#include "config.h"

namespace fv1controller {
namespace protocol {

inline bool isExternalEepromIdx(uint8_t idx)
{
    return idx >= 1 && idx <= 3;
}

inline bool isValidEepromIdx(uint8_t idx)
{
    return idx == 0 || isExternalEepromIdx(idx);
}

inline bool rangeFits(uint16_t start, uint16_t len, uint16_t size)
{
    return static_cast<uint32_t>(start) + len <= size;
}

inline bool crossesExternalEepromPage(uint16_t start, uint16_t len)
{
    return len > 0 &&
           (start / EXTERNAL_EEPROM_PAGE_SIZE) !=
               ((start + len - 1) / EXTERNAL_EEPROM_PAGE_SIZE);
}

inline bool parseDecimalToken(const char* token, uint16_t& value)
{
    if (token == nullptr || *token == '\0')
    {
        return false;
    }

    char* end = nullptr;
    unsigned long parsed = strtoul(token, &end, 10);
    if (*end != '\0' || parsed > 0xffff)
    {
        return false;
    }

    value = static_cast<uint16_t>(parsed);
    return true;
}

inline int8_t hexValue(char c)
{
    if (c >= '0' && c <= '9')
    {
        return c - '0';
    }
    if (c >= 'A' && c <= 'F')
    {
        return c - 'A' + 10;
    }
    if (c >= 'a' && c <= 'f')
    {
        return c - 'a' + 10;
    }
    return -1;
}

inline bool parseHexByteToken(const char* token, uint8_t& value)
{
    if (token == nullptr || token[0] == '\0' || token[1] == '\0' || token[2] != '\0')
    {
        return false;
    }

    int8_t high = hexValue(token[0]);
    int8_t low = hexValue(token[1]);
    if (high < 0 || low < 0)
    {
        return false;
    }

    value = static_cast<uint8_t>((high << 4) | low);
    return true;
}

}  // namespace protocol
}  // namespace fv1controller
