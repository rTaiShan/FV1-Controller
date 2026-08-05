#ifdef ARDUINO
#include <Arduino.h>
#endif
#include <unity.h>
#include "protocol_utils.h"

using namespace fv1controller::protocol;

void test_parse_decimal_accepts_valid_values()
{
    uint16_t value = 0;

    TEST_ASSERT_TRUE(parseDecimalToken("0", value));
    TEST_ASSERT_EQUAL_UINT16(0, value);

    TEST_ASSERT_TRUE(parseDecimalToken("128", value));
    TEST_ASSERT_EQUAL_UINT16(128, value);

    TEST_ASSERT_TRUE(parseDecimalToken("65535", value));
    TEST_ASSERT_EQUAL_UINT16(65535, value);
}

void test_parse_decimal_rejects_malformed_values()
{
    uint16_t value = 123;

    TEST_ASSERT_FALSE(parseDecimalToken(nullptr, value));
    TEST_ASSERT_FALSE(parseDecimalToken("", value));
    TEST_ASSERT_FALSE(parseDecimalToken("12x", value));
    TEST_ASSERT_FALSE(parseDecimalToken("-1", value));
    TEST_ASSERT_FALSE(parseDecimalToken("65536", value));
}

void test_parse_hex_byte_accepts_two_digit_hex()
{
    uint8_t value = 0;

    TEST_ASSERT_TRUE(parseHexByteToken("00", value));
    TEST_ASSERT_EQUAL_UINT8(0x00, value);

    TEST_ASSERT_TRUE(parseHexByteToken("AA", value));
    TEST_ASSERT_EQUAL_UINT8(0xaa, value);

    TEST_ASSERT_TRUE(parseHexByteToken("fF", value));
    TEST_ASSERT_EQUAL_UINT8(0xff, value);
}

void test_parse_hex_byte_rejects_bad_tokens()
{
    uint8_t value = 0;

    TEST_ASSERT_FALSE(parseHexByteToken(nullptr, value));
    TEST_ASSERT_FALSE(parseHexByteToken("", value));
    TEST_ASSERT_FALSE(parseHexByteToken("0", value));
    TEST_ASSERT_FALSE(parseHexByteToken("000", value));
    TEST_ASSERT_FALSE(parseHexByteToken("ZZ", value));
}

void test_eeprom_index_validation()
{
    TEST_ASSERT_TRUE(isValidEepromIdx(0));
    TEST_ASSERT_TRUE(isValidEepromIdx(1));
    TEST_ASSERT_TRUE(isValidEepromIdx(2));
    TEST_ASSERT_TRUE(isValidEepromIdx(3));
    TEST_ASSERT_FALSE(isValidEepromIdx(4));

    TEST_ASSERT_FALSE(isExternalEepromIdx(0));
    TEST_ASSERT_TRUE(isExternalEepromIdx(1));
    TEST_ASSERT_TRUE(isExternalEepromIdx(2));
    TEST_ASSERT_TRUE(isExternalEepromIdx(3));
    TEST_ASSERT_FALSE(isExternalEepromIdx(4));
}

void test_range_fits()
{
    TEST_ASSERT_TRUE(rangeFits(0, 1, 1024));
    TEST_ASSERT_TRUE(rangeFits(1023, 1, 1024));
    TEST_ASSERT_TRUE(rangeFits(0, 1024, 1024));
    TEST_ASSERT_TRUE(rangeFits(100, 0, 1024));

    TEST_ASSERT_FALSE(rangeFits(1023, 2, 1024));
    TEST_ASSERT_FALSE(rangeFits(1024, 1, 1024));
    TEST_ASSERT_FALSE(rangeFits(65535, 2, 65535));
}

void test_external_page_crossing()
{
    TEST_ASSERT_FALSE(crossesExternalEepromPage(0, 1));
    TEST_ASSERT_FALSE(crossesExternalEepromPage(0, 30));
    TEST_ASSERT_FALSE(crossesExternalEepromPage(2, 30));
    TEST_ASSERT_FALSE(crossesExternalEepromPage(32, 30));
    TEST_ASSERT_FALSE(crossesExternalEepromPage(30, 2));
    TEST_ASSERT_FALSE(crossesExternalEepromPage(0, 0));

    TEST_ASSERT_TRUE(crossesExternalEepromPage(30, 3));
    TEST_ASSERT_TRUE(crossesExternalEepromPage(31, 2));
    TEST_ASSERT_TRUE(crossesExternalEepromPage(60, 8));
}

void runProtocolUtilsTests()
{
    UNITY_BEGIN();
    RUN_TEST(test_parse_decimal_accepts_valid_values);
    RUN_TEST(test_parse_decimal_rejects_malformed_values);
    RUN_TEST(test_parse_hex_byte_accepts_two_digit_hex);
    RUN_TEST(test_parse_hex_byte_rejects_bad_tokens);
    RUN_TEST(test_eeprom_index_validation);
    RUN_TEST(test_range_fits);
    RUN_TEST(test_external_page_crossing);
    UNITY_END();
}

#ifdef ARDUINO
void setup()
{
    delay(2000);
    runProtocolUtilsTests();
}

void loop()
{
}
#else
int main()
{
    runProtocolUtilsTests();
    return 0;
}
#endif
