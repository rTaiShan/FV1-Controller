#include "display_handler.h"

Adafruit_PCD8544 display = Adafruit_PCD8544(
    fv1controller::DISPLAYSCLKPIN,
    fv1controller::DISPLAYDINPIN,
    fv1controller::DISPLAYDCPIN,
    fv1controller::DISPLAYCSPIN,
    fv1controller::DISPLATRSTPIN);

static bool lastDisplayedMomentarySwitch = false;
static bool lastDisplayedFavoriteState = false;

void drawEffect()
{
    bool isFavorite = (selectedProgram == EEPROM.read(fv1controller::SAVEDPATCHADDR));
    display.print(momentarySwitch ? "[M" : "[T");
    if (isFavorite)
    {
        display.print('*');
    }
    display.print("] ");
    display.print(selectedProgram + 1);
    display.print(". ");
    uint8_t startIndex = selectedProgram * fv1controller::EFFECT_LINES_PER_PATCH;
    uint8_t index = 0;
    uint16_t head = 0;
    while (index < startIndex)
    {
        if (pgm_read_byte_near(EFFECTLIST + head) == '\n')
            index++;
        head++;
    }
    uint8_t numLines = 0;
    while (numLines < fv1controller::EFFECT_LINES_PER_PATCH)
    {
        char c = static_cast<char>(pgm_read_byte_near(EFFECTLIST + head));
        if (c == '\n')
        {
            display.println();
            numLines++;
        }
        else
        {
            display.print(c);
        }
        head++;
    }
}

void drawScreen()
{
    display.clearDisplay();
    display.setCursor(0, 0);
    drawEffect();
    display.display();
}

void handleScreen()
{
    bool isFavorite = (selectedProgram == EEPROM.read(fv1controller::SAVEDPATCHADDR));
    bool shouldRefresh = (selectedProgram != oldSelectedProgram) || (momentarySwitch != lastDisplayedMomentarySwitch) || (isFavorite != lastDisplayedFavoriteState);
    if (shouldRefresh)
    {
        digitalWrite(fv1controller::BACKLIGHTPIN, HIGH);
        drawScreen();
        oldSelectedProgram = selectedProgram;
        lastDisplayedMomentarySwitch = momentarySwitch;
        lastDisplayedFavoriteState = isFavorite;
        lastUpdate = millis();
    }
    else if (millis() - lastUpdate > fv1controller::DISPLAY_BACKLIGHT_TIMEOUT_MS)
    {
        digitalWrite(fv1controller::BACKLIGHTPIN, LOW);
    }
}

void initializeDisplay()
{
    display.begin();
    display.clearDisplay();
    display.setContrast(EEPROM.read(fv1controller::CONTRASTADDR));
    display.setBias(EEPROM.read(fv1controller::BIASADDR));
    display.setTextColor(BLACK);
    display.setTextSize(1);
    display.display();
}
