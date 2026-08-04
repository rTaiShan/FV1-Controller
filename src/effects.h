#include <Arduino.h>
#include <avr/eeprom.h>
#include "config.h"

const char CUSTOM_EFFECTLIST[] EEMEM =
    "Custom 01\nGain 3\nTone 2\nMix 4\n"
    "Custom 02\nRate 4\nDepth 5\nMix 6\n"
    "Custom 03\nDelay 3\nFB 4\nMix 5\n"
    "Custom 04\nSweep 5\nRes 3\nEnv 4\n"
    "Custom 05\nBass 4\nMid 3\nTreble 4\n"
    "Custom 06\nDrive 5\nLevel 6\nTone 4\n"
    "Custom 07\nDecay 4\nTone 3\nMix 5\n"
    "Custom 08\nRate 3\nDepth 5\nMix 6\n"
    "Custom 09\nTime 5\nFB 4\nPan 2\n"
    "Custom 10\nCutoff 5\nRes 3\nEnv 6\n"
    "Custom 11\nBits 4\nRate 3\nMix 6\n"
    "Custom 12\nSens 5\nRes 3\nSpeed 4\n"
    "Custom 13\nFreq 4\nDepth 5\nMix 4\n"
    "Custom 14\nRise 4\nDepth 5\nMix 5\n"
    "Custom 15\nGain 4\nFreq 3\nQ 2\n"
    "Custom 16\nDelay 3\nMix 5\nTone 4\n"
    "Custom 17\nRate 4\nDepth 5\nMix 5\n"
    "Custom 18\nThresh 4\nRelease 3\nLevel 5\n"
    "Custom 19\nGain 6\nTone 4\nLevel 6\n"
    "Custom 20\nRate 3\nDepth 5\nMix 6\n"
    "Custom 21\nGain 5\nTone 4\nLevel 6\n"
    "Custom 22\nDrive 4\nTone 3\nLevel 5\n"
    "Custom 23\nMix 4\nDepth 5\nRate 3\n"
    "Custom 24\nLevel 5\nTone 4\nGain 4\n";

const char BUILTIN_EFFECTLIST[] PROGMEM =
    "Chorus-Reverb\nReverb mix\nChorus rate\nChorus mix\n"
    "Flange-Reverb\nReverb mix\nFlange rate\nFlange mix\n"
    "Tremolo-Reverb\nReverb mix\nTremolo rate\nTremolo mix\n"
    "Pitch Shift\nPitch +/-4\nsemitones\n-\n"
    "Pitch-Echo\nPitch shift\nEcho delay\nEcho mix\n"
    "Test\n-\n-\n-\n"
    "Reverb 1\nReverb time\nHF filter\nLF filter\n"
    "Reverb 2\nReverb time\nHF filter\nLF filter\n";

inline uint16_t getCustomEffectListMaxLength()
{
    const uint16_t listStart = static_cast<uint16_t>(reinterpret_cast<uintptr_t>(CUSTOM_EFFECTLIST));
    if (listStart >= fv1controller::EEPROM_CONFIG_BASE)
    {
        return 0;
    }
    return fv1controller::EEPROM_CONFIG_BASE - listStart;
}

inline uint16_t getEffectListLengthForPatch(uint8_t patchIndex)
{
    if (patchIndex >= fv1controller::NUMPATCHES)
    {
        return 0;
    }
    if (patchIndex >= fv1controller::CUSTOM_PATCH_COUNT)
    {
        return sizeof(BUILTIN_EFFECTLIST) - 1;
    }
    return getCustomEffectListMaxLength();
}

inline uint16_t getEffectOffsetForPatch(uint8_t patchIndex)
{
    if (patchIndex >= fv1controller::NUMPATCHES)
    {
        return 0;
    }

    const bool useBuiltin = (patchIndex >= fv1controller::CUSTOM_PATCH_COUNT);
    const uint16_t listLength = getEffectListLengthForPatch(patchIndex);
    uint16_t head = 0;
    uint8_t linesToSkip = useBuiltin ? (patchIndex - fv1controller::CUSTOM_PATCH_COUNT) * fv1controller::EFFECT_LINES_PER_PATCH
                                     : patchIndex * fv1controller::EFFECT_LINES_PER_PATCH;
    uint8_t linesSkipped = 0;

    while (linesSkipped < linesToSkip && head < listLength)
    {
        char c = useBuiltin ? static_cast<char>(pgm_read_byte_near(BUILTIN_EFFECTLIST + head))
                           : static_cast<char>(eeprom_read_byte(reinterpret_cast<const uint8_t*>(CUSTOM_EFFECTLIST + head)));
        if (c == '\n')
        {
            linesSkipped++;
        }
        head++;
    }

    return head;
}

inline char readEffectByte(uint8_t patchIndex, uint16_t offset)
{
    if (patchIndex >= fv1controller::NUMPATCHES || offset >= getEffectListLengthForPatch(patchIndex))
    {
        return '\0';
    }

    const bool useBuiltin = (patchIndex >= fv1controller::CUSTOM_PATCH_COUNT);
    if (useBuiltin)
    {
        return static_cast<char>(pgm_read_byte_near(BUILTIN_EFFECTLIST + offset));
    }
    return static_cast<char>(eeprom_read_byte(reinterpret_cast<const uint8_t*>(CUSTOM_EFFECTLIST + offset)));
}
