#include "input_handler.h"
#include <EEPROM.h>

void initializePins()
{
    pinMode(fv1controller::ROTARYCLOCKPIN, INPUT_PULLUP);
    pinMode(fv1controller::ROTARYDATAPIN, INPUT_PULLUP);
    pinMode(fv1controller::ROTARYSWITCHPIN, INPUT_PULLUP);
    pinMode(fv1controller::FSWPIN, INPUT_PULLUP);
    pinMode(fv1controller::SIPODATAPIN, OUTPUT);
    pinMode(fv1controller::SIPOCLOCKPIN, OUTPUT);
    pinMode(fv1controller::SIPOSTROBEPIN, OUTPUT);
    pinMode(fv1controller::BACKLIGHTPIN, OUTPUT);
}

uint8_t readFavoritePatchSelection()
{
    uint8_t saved = EEPROM.read(fv1controller::SAVEDPATCHADDR);
    if (saved >= fv1controller::NUMPATCHES)
    {
        return 0;
    }
    return saved;
}

void loadFavoritePatchSelection()
{
    selectedProgram = readFavoritePatchSelection();
}

void loadStoredSwitchMode()
{
    momentarySwitch = EEPROM.read(fv1controller::MOMENTARYMODEADDR) != 0;
}

int8_t readRotary()
{
    static int8_t rot_enc_table[] = {0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0};

    prevNextCode <<= 2;
    if (digitalRead(fv1controller::ROTARYDATAPIN))
        prevNextCode |= 0x02;
    if (digitalRead(fv1controller::ROTARYCLOCKPIN))
        prevNextCode |= 0x01;
    prevNextCode &= 0x0f;

    if (rot_enc_table[prevNextCode])
    {
        store <<= 4;
        store |= prevNextCode;
        if ((store & 0xff) == 0x2b)
            return -1;
        if ((store & 0xff) == 0x17)
            return 1;
    }
    return 0;
}

void updateRotary()
{
    static int8_t val;
    if ((val = readRotary()))
    {
        selectedProgram += val;
        if (selectedProgram == -1)
            selectedProgram = fv1controller::NUMPATCHES - 1;
        else if (selectedProgram == fv1controller::NUMPATCHES)
            selectedProgram = 0;
    }
}

void handleEncoderButton()
{
    encoderButton.update();
    if (!encoderButton.isClick())
        return;
    if (encoderButton.isSingleClick())
    {
        momentarySwitch = !momentarySwitch;
        EEPROM.update(fv1controller::MOMENTARYMODEADDR, momentarySwitch ? 1 : 0);
    }
    if (encoderButton.isLongClick())
        EEPROM.update(fv1controller::SAVEDPATCHADDR, selectedProgram);
    if (encoderButton.isDoubleClick())
        loadFavoritePatchSelection();
}
