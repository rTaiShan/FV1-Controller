#include <Arduino.h>
#include "EEPROM.h"
#include <PinButton.h>
#include <programSelect.h>

uint8_t prevNextCode = 0;
uint16_t store = 0;
int8_t lastEncoderVal, encoderVal;

bool momentarySwitch = false; // FSW toggle/hold

PinButton encoderButton(ROTARYSWITCHPIN);

/*
There are 3 external eeproms with 8 programs each
Also there are 8 builtin programs. The total is 32 programs.
*/

void getFavoritePatch() {
  uint8_t saved = EEPROM.read(SAVEDPATCHADDR);
  encoderVal = saved;
  if (encoderVal < 0) encoderVal = NUMPATCHES - 1;
  else if (encoderVal >= NUMPATCHES) encoderVal = 0;
  Serial.println("Favorite patch: " + String(encoderVal));
}

int8_t readRotary() {
  // A vald CW or  CCW move returns 1, invalid returns 0.
  static int8_t rot_enc_table[] = {0,1,1,0,1,0,0,1,1,0,0,1,0,1,1,0};

  prevNextCode <<= 2;
  if (digitalRead(ROTARYDATAPIN)) prevNextCode |= 0x02;
  if (digitalRead(ROTARYCLOCKPIN)) prevNextCode |= 0x01;
  prevNextCode &= 0x0f;

  // If valid then store as 16 bit data.
  if  (rot_enc_table[prevNextCode] ) {
    store <<= 4;
    store |= prevNextCode;
    //if (store==0xd42b) return 1;
    //if (store==0xe817) return -1;
    if ((store&0xff)==0x2b) return -1;
    if ((store&0xff)==0x17) return 1;
  }
  return 0;
}

void updateRotary() {
  static int8_t val;
  if((val=readRotary())) {
    encoderVal +=val;
    if (encoderVal == -1) encoderVal = NUMPATCHES - 1;
    else if (encoderVal == NUMPATCHES) encoderVal = 0;
  }
  if (encoderVal != lastEncoderVal) {
    lastEncoderVal = encoderVal;
    Serial.println("New encoderVal: " + String(encoderVal));
  }
}

void handleEncoderButton() {
  encoderButton.update();

  if (encoderButton.isSingleClick()) {
    momentarySwitch = !momentarySwitch;
    Serial.println("Single click, momentarySwitch: " + String(momentarySwitch ? "True" : "False"));
  }
  if (encoderButton.isLongClick()) {
    EEPROM.update(SAVEDPATCHADDR, encoderVal);
    Serial.println("Long click, encoderVal: " + String(encoderVal));
  }
  if (encoderButton.isDoubleClick()) {
    getFavoritePatch();
    Serial.println("Double click, encoderVal: " + String(encoderVal));
  }
}