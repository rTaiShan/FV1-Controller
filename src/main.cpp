#include <Arduino.h>
#include <enc4094.h>
#include <pins.h>
#include <effects.h>
#include <Adafruit_PCD8544.h>
#include "EEPROM.h"
#include <PinButton.h>

#define DEBUG
#define BAUDRATE 9600
#define NUMPATCHES 32
#define SAVEDPATCHADDR 180

void initializePins();
void drawScreen();
void handleScreen();

Adafruit_PCD8544 display = Adafruit_PCD8544(
    DISPLAYSCLKPIN,
    DISPLAYDINPIN,
    DISPLAYDCPIN,
    DISPLAYCSPIN,
    DISPLATRSTPIN);

bool backLight = true;
long lastUpdate = 0;

bool sipoData[] = {0, 0, 0, 0, 0, 0, 0, 0};
bool oldSipoData[] = {0, 0, 0, 0, 0, 0, 0, 0};
PinButton fswButton(FSWPIN);

uint8_t prevNextCode = 0;
uint16_t store = 0;

bool momentarySwitch = false; // FSW toggle/hold

PinButton encoderButton(ROTARYSWITCHPIN);

int8_t selectedProgram = 0;
int8_t oldSelectedProgram = 32;

void handleScreen()
{
    if (selectedProgram != oldSelectedProgram)
    {
        Serial.println(selectedProgram);
        digitalWrite(BACKLIGHTPIN, HIGH);
        drawScreen();
        oldSelectedProgram = selectedProgram;
        lastUpdate = millis();
    }
    else if (millis() - lastUpdate > 10000)
    {
        digitalWrite(BACKLIGHTPIN, LOW);
    }
}

void drawEffect()
{
    uint8_t startIndex = selectedProgram * 4;
    uint8_t index = 0;
    uint8_t head = 0;
    while (index < startIndex)
        if (EFFECTLIST[head++] == '\n')
            index++;
    uint8_t numLines = 0;
    while (numLines <= 3)
    {
        if (EFFECTLIST[head] == '\n')
        {
            display.println();
            numLines++;
        }
        else
            display.print(EFFECTLIST[head]);
        head++;
    }
}

void drawScreen()
{
    display.clearDisplay(); // clears the screen and buffer
    display.setCursor(0, 0);
    drawEffect();
    display.display();
}

void updateSipoData()
{
    if (momentarySwitch)
    {
        sipoData[RELAYINDEX] = !digitalRead(FSWPIN);
    }
    else
    { // Toggle switch
        fswButton.update();
        if (fswButton.isClick())
        {
            sipoData[RELAYINDEX] = !sipoData[RELAYINDEX];
        }
    }

    // Patches -> 0-31, first 8 are built in, last 24 are external
    sipoData[FV1T0INDEX] = (selectedProgram >= 8); // 0 for internal rom, 1 for external

    sipoData[S0INDEX] = selectedProgram & 1; // Program select LSB
    sipoData[S1INDEX] = selectedProgram & 2;
    sipoData[S2INDEX] = selectedProgram & 4; // Program select MSB

    /*EEPROM Enable: Active low
    i.e. set sipoData[EEPROMENABLE1] = LOW (and all others to HIGH) to use EEPROM1*/
    sipoData[EEPROMENABLE0INDEX] = !(selectedProgram >= 8 && selectedProgram < 16);
    sipoData[EEPROMENABLE1INDEX] = !(selectedProgram >= 16 && selectedProgram < 24);
    sipoData[EEPROMENABLE2INDEX] = !(selectedProgram >= 24);
}

bool dataChanged()
{
    for (int i = 0; i < 8; i++)
    {
        if (sipoData[i] != oldSipoData[i])
        {
            return true;
        }
    }
    return false;
}

void writeSipoData()
{
    // Write data to shift register (takes approx. 272 us)
    if (!dataChanged())
    {
        return;
    }
    digitalWrite(SIPOSTROBEPIN, LOW);
    for (int i = 7; i >= 0; i--)
    {
        digitalWrite(SIPOCLOCKPIN, LOW);
        digitalWrite(SIPODATAPIN, sipoData[i]);
        digitalWrite(SIPOCLOCKPIN, HIGH);
    }
    digitalWrite(SIPOSTROBEPIN, HIGH);
    for (int i = 0; i < 8; i++)
    {
        oldSipoData[i] = sipoData[i];
    }
    digitalWrite(SIPOSTROBEPIN, LOW);
}

void handleSIPOEncoder()
{
    updateSipoData();
    writeSipoData();
}

/*
There are 3 external eeproms with 8 programs each
Also there are 8 builtin programs. The total is 32 programs.
*/

void getFavoritePatch()
{
    int8_t saved = EEPROM.read(SAVEDPATCHADDR);
    selectedProgram = saved;
    if (selectedProgram < 0)
        selectedProgram = NUMPATCHES - 1;
    else if (selectedProgram >= NUMPATCHES)
        selectedProgram = 0;
}

int8_t readRotary()
{
    // A vald CW or  CCW move returns 1, invalid returns 0.
    static int8_t rot_enc_table[] = {0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0};

    prevNextCode <<= 2;
    if (digitalRead(ROTARYDATAPIN))
        prevNextCode |= 0x02;
    if (digitalRead(ROTARYCLOCKPIN))
        prevNextCode |= 0x01;
    prevNextCode &= 0x0f;

    // If valid then store as 16 bit data.
    if (rot_enc_table[prevNextCode])
    {
        store <<= 4;
        store |= prevNextCode;
        // if (store==0xd42b) return 1;
        // if (store==0xe817) return -1;
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
            selectedProgram = NUMPATCHES - 1;
        else if (selectedProgram == NUMPATCHES)
            selectedProgram = 0;
    }
}

void handleEncoderButton()
{
    encoderButton.update();
    if (!encoderButton.isClick())
        return;
    if (encoderButton.isSingleClick())
        momentarySwitch = !momentarySwitch;
    if (encoderButton.isLongClick())
        EEPROM.update(SAVEDPATCHADDR, selectedProgram);
    if (encoderButton.isDoubleClick())
        getFavoritePatch();
}

void initializePins()
{
    // Initializing Inputs
    pinMode(ROTARYCLOCKPIN, INPUT_PULLUP);
    pinMode(ROTARYDATAPIN, INPUT_PULLUP);
    pinMode(ROTARYSWITCHPIN, INPUT_PULLUP);
    pinMode(FSWPIN, INPUT_PULLUP);
    // Initializing outputs
    pinMode(SIPODATAPIN, OUTPUT);
    pinMode(SIPOCLOCKPIN, OUTPUT);
    pinMode(SIPOSTROBEPIN, OUTPUT);
    pinMode(BACKLIGHTPIN, OUTPUT);
}

void setup()
{
    Serial.begin(BAUDRATE / 2); // My pro micro transmits at 2x the baud rate (yes, weird)
    initializePins();
    display.begin();
    display.clearDisplay();

    // Display callibration
    // TODO Make contrast and bias runtime settable, save in internal eeprom
    display.setContrast(70);
    display.setBias(4);
    display.setTextColor(BLACK);
    display.setTextSize(1);

    display.display();

    getFavoritePatch(); // Fetch selected patch from internal EEPROM
}

void loop()
{
    handleEncoderButton();
    updateRotary();
    handleSIPOEncoder();
    handleScreen();
}
