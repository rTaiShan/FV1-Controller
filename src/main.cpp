#include <Arduino.h>
#include <enc4094.h>
#include <programSelect.h>
#include <pins.h>
#define BAUDRATE 9600

void initializePins();

void setup() {
  getFavoritePatch(); // Fetch selected patch from internal EEPROM
  Serial.begin(BAUDRATE/2); // My pro-micro transmits at 2x the baud rate, for some reason
  initializePins();
  handleSIPOEncoder(); // Send data to CD4094
}

void loop() {
  handleEncoderButton();
  updateRotary();
  handleSIPOEncoder();
}

void initializePins() { 
  // Initializing Inputs
  pinMode(ROTARYCLOCKPIN, INPUT_PULLUP);
  pinMode(ROTARYDATAPIN, INPUT_PULLUP);
  pinMode(ROTARYSWITCHPIN, INPUT_PULLUP);
  pinMode(FSWPIN, INPUT_PULLUP);
  // Initializing outputs
  pinMode(SIPODATAPIN, OUTPUT);
  pinMode(SIPOCLOCKPIN, OUTPUT);
  pinMode(SIPOSTROBEPIN, OUTPUT);
}
