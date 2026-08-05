#include "protocol_handler.h"
#include <EEPROM.h>
#include <Wire.h>
#include <stdlib.h>
#include <string.h>
#include "config.h"
#include "display_handler.h"
#include "input_handler.h"
#include "protocol_utils.h"
#include "sipo_handler.h"

namespace {

char protocolLine[fv1controller::PROTOCOL_LINE_BUFFER_SIZE];
uint8_t protocolLineLength = 0;
bool protocolLineOverflow = false;
constexpr uint8_t EXTERNAL_EEPROM_ACK_POLL_ATTEMPTS = 50;

char* nextToken()
{
    return strtok(nullptr, " ");
}

void sendError(const __FlashStringHelper* error)
{
    Serial.print(F("ERR "));
    Serial.println(error);
}

void beginExternalWire()
{
    Wire.begin();
    Wire.setWireTimeout(fv1controller::EXTERNAL_EEPROM_WIRE_TIMEOUT_US, true);
    Wire.clearWireTimeoutFlag();
}

bool wireTimedOut()
{
    return Wire.getWireTimeoutFlag();
}

void clearWireTimeout()
{
    Wire.clearWireTimeoutFlag();
}

void printHexByte(uint8_t value)
{
    if (value < 0x10)
    {
        Serial.print('0');
    }
    Serial.print(value, HEX);
}

void dumpInternalEeprom()
{
    Serial.print(F("OK "));
    Serial.println(fv1controller::INTERNAL_EEPROM_SIZE);

    for (uint16_t start = 0; start < fv1controller::INTERNAL_EEPROM_SIZE; start += fv1controller::PROTOCOL_DUMP_CHUNK_LEN)
    {
        uint8_t len = fv1controller::PROTOCOL_DUMP_CHUNK_LEN;
        if (start + len > fv1controller::INTERNAL_EEPROM_SIZE)
        {
            len = fv1controller::INTERNAL_EEPROM_SIZE - start;
        }

        Serial.print(F("DATA "));
        Serial.print(start);
        Serial.print(' ');
        Serial.print(len);
        for (uint8_t i = 0; i < len; i++)
        {
            Serial.print(' ');
            printHexByte(EEPROM.read(start + i));
        }
        Serial.println();
    }

    Serial.println(F("END"));
}

bool overlapsAddress(uint16_t start, uint16_t len, uint16_t address)
{
    return start <= address && address < static_cast<uint32_t>(start) + len;
}

void applyInternalEepromWrite(uint16_t start, uint16_t len)
{
    if (overlapsAddress(start, len, fv1controller::BIASADDR))
    {
        display.setBias(EEPROM.read(fv1controller::BIASADDR));
    }
    if (overlapsAddress(start, len, fv1controller::CONTRASTADDR))
    {
        display.setContrast(EEPROM.read(fv1controller::CONTRASTADDR));
    }
    if (overlapsAddress(start, len, fv1controller::SAVEDPATCHADDR))
    {
        loadFavoritePatchSelection();
    }
    if (overlapsAddress(start, len, fv1controller::MOMENTARYMODEADDR))
    {
        loadStoredSwitchMode();
    }
}

void writeInternalEeprom(uint16_t start, const uint8_t* payload, uint16_t len)
{
    if (!fv1controller::protocol::rangeFits(start, len, fv1controller::INTERNAL_EEPROM_SIZE))
    {
        sendError(F("BAD_RANGE"));
        return;
    }

    for (uint16_t i = 0; i < len; i++)
    {
        EEPROM.update(start + i, payload[i]);
    }
    applyInternalEepromWrite(start, len);

    Serial.print(F("OK "));
    Serial.println(len);
}

bool readExternalEepromChunk(uint16_t start, uint8_t* buffer, uint8_t len)
{
    clearWireTimeout();
    Wire.beginTransmission(fv1controller::EXTERNAL_EEPROM_I2C_ADDR);
    Wire.write(static_cast<uint8_t>(start >> 8));
    Wire.write(static_cast<uint8_t>(start & 0xff));
    if (Wire.endTransmission(false) != 0 || wireTimedOut())
    {
        return false;
    }

    clearWireTimeout();
    if (Wire.requestFrom(fv1controller::EXTERNAL_EEPROM_I2C_ADDR, len) != len || wireTimedOut())
    {
        return false;
    }

    for (uint8_t i = 0; i < len; i++)
    {
        if (!Wire.available())
        {
            return false;
        }
        buffer[i] = Wire.read();
    }
    return true;
}

bool waitForExternalEepromReady()
{
    for (uint8_t attempt = 0; attempt < EXTERNAL_EEPROM_ACK_POLL_ATTEMPTS; attempt++)
    {
        clearWireTimeout();
        Wire.beginTransmission(fv1controller::EXTERNAL_EEPROM_I2C_ADDR);
        if (Wire.endTransmission() == 0 && !wireTimedOut())
        {
            return true;
        }
        if (wireTimedOut())
        {
            return false;
        }
        delay(1);
    }
    return false;
}

bool writeExternalEeprom(uint16_t start, const uint8_t* payload, uint16_t len)
{
    clearWireTimeout();
    Wire.beginTransmission(fv1controller::EXTERNAL_EEPROM_I2C_ADDR);
    Wire.write(static_cast<uint8_t>(start >> 8));
    Wire.write(static_cast<uint8_t>(start & 0xff));
    for (uint16_t i = 0; i < len; i++)
    {
        Wire.write(payload[i]);
    }

    return Wire.endTransmission() == 0 && !wireTimedOut() && waitForExternalEepromReady();
}

void dumpExternalEeprom(uint8_t idx)
{
    if (!beginExternalEepromAccess(idx))
    {
        sendError(F("WRITE_FAILED"));
        return;
    }

    beginExternalWire();
    uint8_t buffer[fv1controller::PROTOCOL_DUMP_CHUNK_LEN];

    if (!waitForExternalEepromReady())
    {
        Wire.end();
        endExternalEepromAccess();
        sendError(F("WRITE_FAILED"));
        return;
    }

    Serial.print(F("OK "));
    Serial.println(fv1controller::EXTERNAL_EEPROM_SIZE);

    for (uint16_t start = 0; start < fv1controller::EXTERNAL_EEPROM_SIZE; start += fv1controller::PROTOCOL_DUMP_CHUNK_LEN)
    {
        uint8_t len = fv1controller::PROTOCOL_DUMP_CHUNK_LEN;
        if (start + len > fv1controller::EXTERNAL_EEPROM_SIZE)
        {
            len = fv1controller::EXTERNAL_EEPROM_SIZE - start;
        }

        if (!readExternalEepromChunk(start, buffer, len))
        {
            Wire.end();
            endExternalEepromAccess();
            sendError(F("WRITE_FAILED"));
            return;
        }

        Serial.print(F("DATA "));
        Serial.print(start);
        Serial.print(' ');
        Serial.print(len);
        for (uint8_t i = 0; i < len; i++)
        {
            Serial.print(' ');
            printHexByte(buffer[i]);
        }
        Serial.println();
    }

    Serial.println(F("END"));
    Wire.end();
    endExternalEepromAccess();
}

void handleExternalEepromWrite(uint8_t idx, uint16_t start, const uint8_t* payload, uint16_t len)
{
    if (!fv1controller::protocol::rangeFits(start, len, fv1controller::EXTERNAL_EEPROM_SIZE))
    {
        sendError(F("BAD_RANGE"));
        return;
    }
    if (fv1controller::protocol::crossesExternalEepromPage(start, len))
    {
        sendError(F("PAGE_CROSS"));
        return;
    }
    if (!beginExternalEepromAccess(idx))
    {
        sendError(F("WRITE_FAILED"));
        return;
    }

    beginExternalWire();
    bool written = writeExternalEeprom(start, payload, len);
    Wire.end();
    endExternalEepromAccess();

    if (!written)
    {
        sendError(F("WRITE_FAILED"));
        return;
    }

    Serial.print(F("OK "));
    Serial.println(len);
}

void handlePing()
{
    if (nextToken() != nullptr)
    {
        sendError(F("BAD_COMMAND"));
        return;
    }

    Serial.println(F("OK FV1_CONTROLLER"));
}

void handleDumpCommand()
{
    uint16_t idx = 0;
    if (!fv1controller::protocol::parseDecimalToken(nextToken(), idx))
    {
        sendError(F("BAD_RANGE"));
        return;
    }
    if (nextToken() != nullptr)
    {
        sendError(F("BAD_COMMAND"));
        return;
    }
    if (idx > 0xff || !fv1controller::protocol::isValidEepromIdx(static_cast<uint8_t>(idx)))
    {
        sendError(F("BAD_IDX"));
        return;
    }

    if (idx == 0)
    {
        dumpInternalEeprom();
        return;
    }

    dumpExternalEeprom(static_cast<uint8_t>(idx));
}

void handleWriteCommand()
{
    uint16_t idx = 0;
    uint16_t start = 0;
    uint16_t len = 0;

    if (!fv1controller::protocol::parseDecimalToken(nextToken(), idx) ||
        !fv1controller::protocol::parseDecimalToken(nextToken(), start) ||
        !fv1controller::protocol::parseDecimalToken(nextToken(), len))
    {
        sendError(F("BAD_RANGE"));
        return;
    }
    if (idx > 0xff || !fv1controller::protocol::isValidEepromIdx(static_cast<uint8_t>(idx)))
    {
        sendError(F("BAD_IDX"));
        return;
    }
    if (len == 0 || len > fv1controller::PROTOCOL_MAX_WRITE_LEN)
    {
        sendError(F("BAD_LEN"));
        return;
    }

    uint8_t payload[fv1controller::PROTOCOL_MAX_WRITE_LEN];
    for (uint16_t i = 0; i < len; i++)
    {
        if (!fv1controller::protocol::parseHexByteToken(nextToken(), payload[i]))
        {
            sendError(F("BAD_HEX"));
            return;
        }
    }
    if (nextToken() != nullptr)
    {
        sendError(F("BAD_LEN"));
        return;
    }

    if (idx == 0)
    {
        writeInternalEeprom(start, payload, len);
        return;
    }

    handleExternalEepromWrite(static_cast<uint8_t>(idx), start, payload, len);
}

void processProtocolLine(char* line)
{
    // strtok replaces spaces with '\0' and keeps an internal cursor for following tokens.
    const char* command = strtok(line, " ");
    if (command == nullptr)
    {
        return;
    }

    if (strcmp(command, "PING") == 0)
    {
        handlePing();
    }
    else if (strcmp(command, "DUMP") == 0)
    {
        handleDumpCommand();
    }
    else if (strcmp(command, "WRITE") == 0)
    {
        handleWriteCommand();
    }
    else
    {
        sendError(F("BAD_COMMAND"));
    }
}

void handleProtocolByte(char c)
{
    if (c == '\r')
    {
        return;
    }

    if (c == '\n')
    {
        if (protocolLineOverflow)
        {
            protocolLineOverflow = false;
            protocolLineLength = 0;
            sendError(F("BAD_LEN"));
            return;
        }

        protocolLine[protocolLineLength] = '\0';
        processProtocolLine(protocolLine);
        protocolLineLength = 0;
        return;
    }

    if (protocolLineOverflow)
    {
        return;
    }

    if (protocolLineLength >= fv1controller::PROTOCOL_LINE_BUFFER_SIZE - 1)
    {
        protocolLineOverflow = true;
        protocolLineLength = 0;
        return;
    }

    protocolLine[protocolLineLength++] = c;
}

}  // namespace

void handleProtocol()
{
    while (Serial.available())
    {
        handleProtocolByte(static_cast<char>(Serial.read()));
    }
}

void sendProtocolPrint(const String& message)
{
    Serial.print(F("PRINT "));
    for (uint16_t i = 0; i < message.length(); i++)
    {
        char c = message.charAt(i);
        Serial.print((c == '\r' || c == '\n') ? ' ' : c);
    }
    Serial.println();
}

namespace {
void (*const protocolVoidEntryPoints[])() = {
    handleProtocol,
};

void (*const protocolPrintEntryPoints[])(const String&) = {
    sendProtocolPrint,
};
}
