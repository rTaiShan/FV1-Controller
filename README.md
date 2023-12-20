## FV1 Controller
This repository contains firmware for the Arduino Pro-Mini 3v3.

It is meant to control a FV1 multi-effects pedal. For such, it must include features for:

* Bypass, including:
    * Button (1 input)
    * Relay + LED (1 output)
    * Momentary/Toggle switch (0 inputs, as a single click from the rotary encoder can work as the switch)
    
* Program selection, including:
    * Encoder + Button (3 inputs)
    * EEPROM Select (3 outputs)
    * ESP32 Program pins (3+1 outputs)
    * Screen (? outputs, ? inputs)
    * Store and retrieve favorite patch from internal EEPROM

To optimize the available pins, a CD4094 SIPO shift register will be used, so that it controls:

* EEPROM Select (3 outputs)
* ESP32 Program pins (3+1 outputs)
* Relay + LED (1 output)
    
With 3 pins:
* SDA
* SCL
* Strobe

Making it so that the total pinout is:
* 4 inputs (+ screen inputs)
* 3 outputs (+ screen outputs)
