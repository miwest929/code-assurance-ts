// New to the idea of RFCs? Read through https://www.mnot.net/blog/2018/07/31/read_rfc to familiarize yourself with the process
// of reading RFCs.

// You may get a feel for the CBOR format by exploring http://cbor.me/
//import * as textEncoding from 'text-encoding'; // npm install --save @types/text-encoding

// utility functions that lets you append bytes to a Uint8Array
function concatTypedArrays(a, b) { // a, b TypedArray of same type
    var c = new (a.constructor)(a.length + b.length);
    c.set(a, 0);
    c.set(b, a.length);
    return c;
}

function concatByte(ui8a, byte) {
    var b = new Uint8Array(1);
    b[0] = byte;
    return concatTypedArrays(ui8a, b);
}

/*
  Given a number generate an Array from 0 to that number exclusive
  rangeArray(5) => [0, 2, 3, 4]
*/
function range(n: number): number[] {
    return [...Array(n).keys()];
}

type EmitFnType = (value: any) => Uint8Array;
type DecodedDataType = { nextIndex: number, decodedItem: any };
type ConsumeFnType = (data: Uint8Array, idx: number) => DecodedDataType;
export class CBOR {
    public static encode(payload: Map<string, any>): Uint8Array {
        let bytes = new Uint8Array([CBOR.emitTypeByteForMap(payload)]);

        for(let key of payload.keys()) {
            const value = payload.get(key);

            // encode text key
            const textBytes = CBOR.emitStringBytes(key);
            bytes = concatTypedArrays(bytes, textBytes);

            // encode value of key
            const emitFn = CBOR.matchItemType(value);
            if (emitFn === undefined) {
                console.log("Error: Encountered unknown type when encoding");
                break;
            }
            const valueBytes = emitFn(value);
            bytes = concatTypedArrays(bytes, valueBytes);
        }

        return bytes;
    }

    public static decode(data: Uint8Array): any {
        const nextByte = data[0];

        const consumeTypeFn = CBOR.matchNextItemType(nextByte);
        if (consumeTypeFn === undefined) {
          console.log("Error. Couldn't match type of next data item")
        }

        const result = consumeTypeFn(data, 0);
        return result.decodedItem;
    }

    private static matchItemType(value: any): EmitFnType {
      if (typeof value === 'string') {
          return CBOR.emitStringBytes;
      } else if (Number.isInteger(value)) {
        return CBOR.emitIntegerBytes;
      } else if (typeof value === 'number') {
        return CBOR.emitFloatingPointBytes;
      } else if (value instanceof Array) {
        return CBOR.emitArrayBytes;
      } else if (value instanceof Map) {
          return CBOR.emitMapBytes;
      }

      return undefined;
    }

    private static emitTypeByteForArray(value: Array<any>): number {
        return 0x80 + value.length;
    }

    private static emitTypeByteForMap(payload: Map<string, any>): number {
        return 0xA0 + payload.size;
    }

    // IEEE 754
    private static emitFloatingPointBytes(value: number): Uint8Array {
        /*
           Components of a floating point number.
           (mantissa) significand => contains the number’s digits
           exponent => determines where the decimal (or binary) point is placed relative to the beginning of the significand

           The mantissa is normalized such that only 1 non-zero digit is to the left of the decimal point
           Ex: 200.26 => 2.0026 x 10^2
        */
        // TODO: For now store represent all floating points as double precision
        let mantissa = value;
        let exponent = 1;
        while (mantissa % 1 !== 0) {
          mantissa *= 10;

        }

        let bytes = [0xFB];

        // mantissa is 52 bits
        while (mantissa >= 256) {

            mantissa = mantissa << 8;
        }

        // exponent is 11 bits

        return new Uint8Array([0xFB, ]);
    }

    private static emitIntegerBytes(value: number): Uint8Array {
        if (value >= 0 && value <= 23) {
            return new Uint8Array([value]);
        }

        if (value >= 0 && value <= 255) {
            return new Uint8Array([0x18, value]);
        }

        if (value >= 0 && value <= 65535) {
            const firstByte = Math.floor(value / 256);
            const secondByte = value % 256;
            return new Uint8Array([0x19, firstByte, secondByte]);
        }

        return new Uint8Array([]);
    }

    private static emitArrayBytes(value: Array<any>): Uint8Array {
        let bytes = new Uint8Array([CBOR.emitTypeByteForArray(value)]);

        for (const val of value) {
            // encode value of key
            const emitFn = CBOR.matchItemType(val);
            if (emitFn === undefined) {
                console.log("Error: Encountered unknown type when encoding");
                break;
            }
            bytes = concatTypedArrays(bytes, emitFn(val));
        }
        return new Uint8Array(bytes);
    }

    private static emitMapBytes(value: Map<string, any>): Uint8Array {
        return new Uint8Array([]);
    }

    private static emitStringTypeBytes(value: string): Uint8Array {
        let bytes = [];

        if (value.length <= 23) {
            bytes = [0x60 + value.length];
        } else if (value.length <= 255) {
            bytes = [0x78, value.length] 
        } else if (value.length <= 65535) {
            const firstLenByte = (value.length & 0xFF00) >> 8;
            const secondLenByte = value.length & 0x00FF;
            bytes = [0x79, firstLenByte, secondLenByte]
        }
        // TODO: Support 4 byte, 8 byte, n byte (terminated by break byte) lengths

        return new Uint8Array(bytes);
    }

    private static emitStringBytes(value: string): Uint8Array {
      const typeBytes = CBOR.emitStringTypeBytes(value);
      const valueBytes = new Uint8Array(range(value.length).map((i) => value.charCodeAt(i)));
      return concatTypedArrays(typeBytes, valueBytes);
    }

    private static matchNextItemType(byte: number): ConsumeFnType {
        if (byte >= 0xA0 && byte <= 0xB7) {
            return CBOR.consumeMapObject;
        } else if (byte >= 0x60 && byte <= 0x77) {
            return CBOR.consumeTinyUtf8String;
        } else if (byte >= 0x00 && byte <= 0x17) {
            // tiny unsignd integer that's between 0 and 23
            return CBOR.consumeTinyUnsignedInteger;
        } else if (byte >= 0x80 && byte <= 0x97) {
            // small array
            return CBOR.consumeSmallArray;
        }
  
        return undefined;
      }
  
      // The consume functions are for decoding
      private static consumeSmallArray(bytes: Uint8Array, idx: number): DecodedDataType {
         const arrLen = bytes[idx] - 0x80;
         let obj = [];
         let nextIdx = idx + 1;
  
         for (let i = 0; i < arrLen; i++) {
             const consumeFn = CBOR.matchNextItemType(bytes[nextIdx]);
             const result = consumeFn(bytes, nextIdx);
             nextIdx = result.nextIndex;
             obj.push(result.decodedItem); 
         }
  
         return {nextIndex: nextIdx, decodedItem: obj};
      }
  
      private static consumeTinyUnsignedInteger(bytes: Uint8Array, idx: number): DecodedDataType {
          return {nextIndex: idx+1, decodedItem: bytes[idx]};
      }
  
      private static consumeTinyUtf8String(bytes: Uint8Array, idx: number): DecodedDataType {
          // utf8 string
          const strLen = bytes[idx] - 0x60;
          const strBytes = bytes.slice(idx+1, idx+strLen+1);
          return {nextIndex: idx+strLen+1, decodedItem: CBOR.toUtf8(strBytes)};
      }
  
      private static consumeMapObject(bytes: Uint8Array, idx: number): DecodedDataType {
          const mapKeyCount = bytes[idx] - 0xA0;
          const obj = new Map<any, any>();
          let nextIdx = idx + 1;
  
          for (let i = 0; i < mapKeyCount; i++) {
              // for each key verify the key is a utf8 string
              // value will be decoded recursively
              if (CBOR.isTinyUtf8Type(bytes[nextIdx])) { // TODO: Change to generic string type matcher
                  const keyResult = CBOR.consumeTinyUtf8String(bytes, nextIdx);
                  nextIdx = keyResult.nextIndex;
  
                  const valueConsumeFn = CBOR.matchNextItemType(bytes[nextIdx]);
                  const valueResult = valueConsumeFn(bytes, nextIdx);
                  obj.set(keyResult.decodedItem, valueResult.decodedItem);
              } else {
                  // ERROR: Keys must be strings
                  break;
              }
          }
  
          return {nextIndex: idx+1, decodedItem: obj};
      }
  
      private static isTinyUtf8Type(byte: number): boolean {
          // Between 0x60 and 0x77: utf8 string with (byte-0x60) bytes to follow
          return byte >= 0x60 && byte <= 0x77;
      }
      
      private static toUtf8(data: Uint8Array): string {
          return data.join();
          //return new textEncoding.TextDecoder('utf-8').decode(data);
      }
}