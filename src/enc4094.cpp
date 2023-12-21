#include <Arduino.h>
#include <enc4094.h>
#include <pins.h>
#include "programSelect.h"
#include <PinButton.h>
#include <programSelect.h>

bool sipoData[] = {0, 0, 0, 0, 0, 0, 0, 0};
bool oldSipoData[] = {0, 0, 0, 0, 0, 0, 0, 0};
PinButton fswButton(FSWPIN);

void updateSipoData() {
    if (momentarySwitch) {
        sipoData[RELAYINDEX] = !digitalRead(FSWPIN);
    }
    else { // Toggle switch
        fswButton.update();
        if (fswButton.isClick()) {
            sipoData[RELAYINDEX] = !sipoData[RELAYINDEX];
        }
    }
    
    // Patches -> 0-31, first 8 are built in, last 24 are external
    sipoData[FV1T0INDEX] = (encoderVal >= 8); // 0 for internal rom, 1 for external

    sipoData[S0INDEX] = encoderVal & 1; // Program select LSB
    sipoData[S1INDEX] = encoderVal & 2;
    sipoData[S2INDEX] = encoderVal & 4; // Program select MSB

    /*EEPROM Enable: Active low
    i.e. set sipoData[EEPROMENABLE1] = LOW (and all others to HIGH) to use EEPROM1*/
    sipoData[EEPROMENABLE0INDEX] = !(encoderVal >= 8 && encoderVal < 16);
    sipoData[EEPROMENABLE1INDEX] = !(encoderVal >= 16 && encoderVal < 24); 
    sipoData[EEPROMENABLE2INDEX] = !(encoderVal >= 24);
}

bool dataChanged() {
    for (int i = 0; i < 8; i ++) {
        if (sipoData[i] != oldSipoData[i]) {
            return true;
        }
    }
    return false;
}

void writeSipoData() {
    // Write data to shift register (takes approx. 272 us)
    if (!dataChanged()) {
        return;
    }
    digitalWrite(SIPOSTROBEPIN, LOW);
    for (int i = 7; i >= 0; i--) {
        digitalWrite(SIPOCLOCKPIN, LOW);
        digitalWrite(SIPODATAPIN, sipoData[i]);
        digitalWrite(SIPOCLOCKPIN, HIGH);
    }
    digitalWrite(SIPOSTROBEPIN, HIGH);
    for (int i = 0; i < 8; i++) {
        oldSipoData[i] = sipoData[i];
    }
    digitalWrite(SIPOSTROBEPIN, LOW);
}

void handleSIPOEncoder() {
    updateSipoData();
    writeSipoData();
}
