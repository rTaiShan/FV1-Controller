#include <Arduino.h>

namespace fv1controller {

// Hardware pin assignments.
constexpr uint8_t SIPOSTROBEPIN = 4;
constexpr uint8_t SIPODATAPIN = 5;
constexpr uint8_t SIPOCLOCKPIN = 6;
constexpr uint8_t FSWPIN = 2;
constexpr uint8_t ROTARYCLOCKPIN = 7;
constexpr uint8_t ROTARYDATAPIN = 8;
constexpr uint8_t ROTARYSWITCHPIN = 3;
constexpr uint8_t DISPLAYSCLKPIN = 10;
constexpr uint8_t DISPLAYDINPIN = 11;
constexpr uint8_t DISPLAYDCPIN = 12;
constexpr uint8_t DISPLAYCSPIN = A0;
constexpr uint8_t DISPLATRSTPIN = A1;
constexpr uint8_t BACKLIGHTPIN = 9;

}  // namespace fv1controller