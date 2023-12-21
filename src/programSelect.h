#define DEBUG

#define SAVEDPATCHADDR 180
#define NUMPATCHES 32

int8_t readRotary();
void getFavoritePatch();
void handleEncoderButton();
void updateRotary();

extern int8_t encoderVal;
extern bool momentarySwitch;
