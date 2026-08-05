#include "controller_state.h"

long lastUpdate = 0;

bool sipoData[fv1controller::SIPO_DATA_BITS] = {0, 0, 0, 0, 0, 0, 0, 0};
bool oldSipoData[fv1controller::SIPO_DATA_BITS] = {0, 0, 0, 0, 0, 0, 0, 0};
PinButton encoderButton(fv1controller::ROTARYSWITCHPIN);

uint8_t prevNextCode = 0;
uint16_t store = 0;

bool momentarySwitch = false;
bool builtinPatchesDisabled = false;
int8_t selectedProgram = 0;
int8_t oldSelectedProgram = fv1controller::MAX_PATCH_COUNT;

uint8_t getAvailablePatchCount()
{
    return builtinPatchesDisabled ? fv1controller::CUSTOM_PATCH_COUNT : fv1controller::MAX_PATCH_COUNT;
}
