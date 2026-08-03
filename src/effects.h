#include <Arduino.h>

// struct FV1Effect {
//   const char* name;
//   const char* parameters[3];
// };

const char EFFECTLIST[] PROGMEM = 
    "Chorus-Reverb\nReverb mix\nChorus rate\nChorus mix\n"
    "Flange-Reverb\nReverb mix\nFlange rate\nFlange mix\n"
    "Tremolo-Reverb\nReverb mix\nTremolo rate\nTremolo mix\n"
    "Pitch Shift\nPitch +/-4\nsemitones\n-\n"
    "Pitch-Echo\nPitch shift\nEcho delay\nEcho mix\n"
    "Test\n-\n-\n-\n"
    "Reverb 1\nReverb time\nHF filter\nLF filter\n"
    "Reverb 2\nReverb time\nHF filter\nLF filter\n"
    "Drive Fuzz\nGain 5\nTone 4\nLevel 6\n"
    "Compressor\nSustain 5\nLevel 6\nAttack 3\n"
    "Phaser Wave\nRate 3\nDepth 5\nMix 6\n"
    "Octave Up\nOct 1\nLevel 6\nBlend 4\n"
    "Lo-Fi Tape\nWow 3\nNoise 2\nTone 4\n"
    "Filter Sweep\nCutoff 5\nRes 3\nEnv 6\n"
    "Dual Echo\nTime 5\nFB 4\nPan 2\n"
    "Spring Verb\nDecay 4\nTone 3\nMix 5\n"
    "Guitar EQ\nBass 4\nMid 3\nTreble 4\n"
    "Bit Crusher\nBits 4\nRate 3\nMix 6\n"
    "Envelope Filter\nSens 5\nRes 3\nSpeed 4\n"
    "Ring Mod\nFreq 4\nDepth 5\nMix 4\n"
    "Reverse Delay\nTime 4\nFB 5\nMix 6\n"
    "Chorus+Flange\nRate 4\nDepth 5\nMix 6\n"
    "Tape Echo\nTime 5\nTone 3\nMix 6\n"
    "Swell Shimmer\nRise 4\nDepth 5\nMix 5\n"
    "Sine Trem\nRate 4\nDepth 5\nMix 6\n"
    "Mid Boost\nGain 4\nFreq 3\nQ 2\n"
    "Doubler\nDelay 3\nMix 5\nTone 4\n"
    "Phase Shift\nRate 4\nDepth 5\nMix 5\n"
    "Noise Gate\nThresh 4\nRelease 3\nLevel 5\n"
    "Fuzz Drive\nGain 6\nTone 4\nLevel 6\n"
    "Space Mod\nRate 3\nDepth 5\nMix 6\n"
    "Lead Boost\nGain 5\nTone 4\nLevel 6\n";