/* zxing_mgmt16_patch.js
   ZXing(@zxing/library UMD) の Result から
   「最初の terminator(0000) の直後にある management 16bit」を抜き出すユーティリティ
*/
(function(){
  'use strict';

  function toUint8Array(raw){
    if (!raw) return null;
    if (raw instanceof Uint8Array) return raw;
    if (Array.isArray(raw)) return Uint8Array.from(raw);
    return null;
  }

  class BitReader {
    constructor(bytes){
      this.bytes = bytes;
      this.bitOffset = 0;
    }
    available(){
      return this.bytes.length * 8 - this.bitOffset;
    }
    readBits(n){
      if (n < 0 || n > 32) throw new Error('readBits: n must be 0..32');
      if (this.available() < n) return null;
      let v = 0;
      for (let i=0; i<n; i++){
        const idx = (this.bitOffset >> 3);
        const shift = 7 - (this.bitOffset & 7);
        const bit = (this.bytes[idx] >> shift) & 1;
        v = (v << 1) | bit;
        this.bitOffset++;
      }
      return v >>> 0;
    }
    skipBits(n){
      if (this.available() < n) return false;
      this.bitOffset += n;
      return true;
    }
  }

  function lengthBitsForByteMode(version){
    if (version >= 1 && version <= 9) return 8;
    if (version >= 10 && version <= 26) return 16;
    if (version >= 27 && version <= 40) return 16;
    return 8;
  }

  function versionFromDimension(d){
    const v = Math.round((d - 17) / 4);
    if (v < 1 || v > 40) return null;
    return v;
  }

  function extractMgmt16FromRawBytes(rawBytes, version){
    const bytes = toUint8Array(rawBytes);
    if (!bytes) return { ok:false, reason:'rawBytesが取得できません' };

    const br = new BitReader(bytes);

    while (br.available() >= 4){
      const mode = br.readBits(4);
      if (mode === null) break;

      // terminator
      if (mode === 0){
        if (br.available() < 16) return { ok:false, reason:'terminator後に16bit残っていません' };
        const mgmt = br.readBits(16);
        return {
          ok:true,
          mgmt16: mgmt & 0xFFFF,
          mgmtBits: (mgmt & 0xFFFF).toString(2).padStart(16,'0'),
        };
      }

      // Byte mode = 0100 (4)
      if (mode === 4){
        const lenBits = lengthBitsForByteMode(version || 1);
        const count = br.readBits(lenBits);
        if (count === null) return { ok:false, reason:'length読み取り失敗' };
        const dataBits = count * 8;
        if (!br.skipBits(dataBits)) return { ok:false, reason:'data部が不足' };
        continue;
      }

      // 他モードは今回は未対応
      return { ok:false, reason:'Byteモード以外は未対応（mode=' + mode + ')' };
    }

    return { ok:false, reason:'terminatorが見つかりません' };
  }

  window.ZXingMgmt16 = {
    versionFromDimension,
    extractMgmt16FromRawBytes
  };

  // Result.prototype に getManagement16 を追加（＝ZXing拡張）
  if (typeof window.ZXing !== 'undefined' && window.ZXing.Result && window.ZXing.Result.prototype){
    window.ZXing.Result.prototype.getManagement16 = function(qrDimension){
      const raw = (this.getRawBytes && this.getRawBytes()) || this.rawBytes;
      const version = (qrDimension ? versionFromDimension(qrDimension) : null);
      return extractMgmt16FromRawBytes(raw, version);
    };
  }
})();
