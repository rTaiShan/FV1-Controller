#include <Arduino.h>
#include <enc4094.h>
#include <programSelect.h>

#define BAUDRATE 9600

void setup() {
  getFavoritePatch();
  // My pro-micro transmits at 2x the baud rate, for some reason
  Serial.begin(BAUDRATE/2); 
  // Initializing Inputs
  pinMode(ROTARYCLOCKPIN, INPUT_PULLUP);
  pinMode(ROTARYDATAPIN, INPUT_PULLUP);
  pinMode(ROTARYSWITCHPIN, INPUT_PULLUP);
  pinMode(FSWPIN, INPUT_PULLUP);
  // Initializing outputs
  pinMode(SIPODATAPIN, OUTPUT);
  pinMode(SIPOCLOCKPIN, OUTPUT);
  pinMode(SIPOSTROBEPIN, OUTPUT);
  // Send data to CD4094
  handleSIPOEncoder();
}

void loop() {
  handleEncoderButton();
  updateRotary();
  handleSIPOEncoder();
}
