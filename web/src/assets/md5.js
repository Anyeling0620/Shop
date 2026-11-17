// MD5（32 位小写），只为登录前处理密码，保持零依赖。
// 必须与浏览器端 md5.min.js / 后端 MD5Util 完全一致：标准 MD5、UTF-8、小写十六进制。
// 实现移植自仓库旧版 web/src/lib/format/md5.ts（已在上线链路上验证过）。
(function () {
  'use strict';

  function toUtf8Bytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i += 1) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push((code >> 6) | 0xc0, (code & 0x3f) | 0x80);
      } else if (code >= 0xd800 && code <= 0xdbff) {
        var next = str.charCodeAt(i + 1);
        var cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
        bytes.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
        i += 1;
      } else {
        bytes.push((code >> 12) | 0xe0, ((code >> 6) & 0x3f) | 0x80, (code & 0x3f) | 0x80);
      }
    }
    return bytes;
  }

  function rotl(x, c) {
    return (x << c) | (x >>> (32 - c));
  }

  var S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];

  var K = [];
  for (var k = 0; k < 64; k += 1) {
    K[k] = Math.floor(Math.abs(Math.sin(k + 1)) * 0x100000000) >>> 0;
  }

  function md5(input) {
    input = String(input);
    var bytes = toUtf8Bytes(input);
    var bitLen = bytes.length * 8;

    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);

    var lenLo = bitLen >>> 0;
    var lenHi = Math.floor(bitLen / 0x100000000) >>> 0;
    for (var i = 0; i < 4; i += 1) bytes.push((lenLo >>> (i * 8)) & 0xff);
    for (var j = 0; j < 4; j += 1) bytes.push((lenHi >>> (j * 8)) & 0xff);

    var a0 = 0x67452301;
    var b0 = 0xefcdab89;
    var c0 = 0x98badcfe;
    var d0 = 0x10325476;

    for (var chunk = 0; chunk < bytes.length; chunk += 64) {
      var M = [];
      for (var m = 0; m < 16; m += 1) {
        var off = chunk + m * 4;
        M[m] = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
      }

      var A = a0;
      var B = b0;
      var C = c0;
      var D = d0;

      for (var n = 0; n < 64; n += 1) {
        var F, g;
        if (n < 16) {
          F = (B & C) | (~B & D);
          g = n;
        } else if (n < 32) {
          F = (D & B) | (~D & C);
          g = (5 * n + 1) % 16;
        } else if (n < 48) {
          F = B ^ C ^ D;
          g = (3 * n + 5) % 16;
        } else {
          F = C ^ (B | ~D);
          g = (7 * n) % 16;
        }
        F = (F + A + K[n] + M[g]) >>> 0;
        A = D;
        D = C;
        C = B;
        B = (B + rotl(F, S[n])) >>> 0;
      }

      a0 = (a0 + A) >>> 0;
      b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0;
      d0 = (d0 + D) >>> 0;
    }

    function wordToHex(num) {
      var out = '';
      [0, 8, 16, 24].forEach(function (s) {
        var part = ((num >>> s) & 0xff).toString(16);
        out += part.length === 1 ? '0' + part : part;
      });
      return out;
    }

    return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
  }

  window.md5 = md5;
})();
