#include "input_handler.h"

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

void getFavoritePatch()
{
    int8_t saved = EEPROM.read(fv1controller::SAVEDPATCHADDR);
    selectedProgram = saved;
    if (selectedProgram < 0)
        selectedProgram = fv1controller::NUMPATCHES - 1;
    else if (selectedProgram >= fv1controller::NUMPATCHES)
        selectedProgram = 0;
}

void getStoredMode()
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
        getFavoritePatch();
}

void handleScreenCallibration()
{
    if (!Serial.available())
        return;
    switch (Serial.read())
    {
        case 'b':
        {
            int newBias = Serial.parseInt();
            display.setBias(newBias);
            EEPROM.update(fv1controller::BIASADDR, newBias);
            Serial.println("New bias: " + String(newBias));
            break;
        }
        case 'c':
        {
            int newContrast = Serial.parseInt();
            display.setContrast(newContrast);
            EEPROM.update(fv1controller::CONTRASTADDR, newContrast);
            Serial.println("New contrast: " + String(newContrast));
            break;
        }
        default:
            break;
    }
}
