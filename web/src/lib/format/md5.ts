/**
 * MD5（32 位小写），用于登录前的密码预处理。
 *
 * 后端约定前端先 MD5 一次、后端再加盐 MD5，所以必须与浏览器端
 * md5.min.js 的结果完全一致（标准 MD5、UTF-8、小写十六进制）。
 * 这里实现一份自包含版本，避免为一次哈希引入额外依赖。
 */

function toUtf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push((code >> 6) | 0xc0, (code & 0x3f) | 0x80);
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      const cp = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
      i += 1;
    } else {
      bytes.push((code >> 12) | 0xe0, ((code >> 6) & 0x3f) | 0x80, (code & 0x3f) | 0x80);
    }
  }
  return bytes;
}

function rotl(x: number, c: number): number {
  return (x << c) | (x >>> (32 - c));
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15,
  21,
];

const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0);

/** 计算 MD5，返回 32 位小写十六进制。 */
export default function md5(input: string): string {
  const bytes = toUtf8Bytes(input);
  const bitLen = bytes.length * 8;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  // 64 位长度（低 32 位 + 高 32 位），小端
  const lenLo = bitLen >>> 0;
  const lenHi = Math.floor(bitLen / 0x100000000) >>> 0;
  for (let i = 0; i < 4; i += 1) bytes.push((lenLo >>> (i * 8)) & 0xff);
  for (let i = 0; i < 4; i += 1) bytes.push((lenHi >>> (i * 8)) & 0xff);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    const M: number[] = [];
    for (let i = 0; i < 16; i += 1) {
      const off = chunk + i * 4;
      M[i] = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i += 1) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, S[i])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const wordToHex = (n: number) =>
    [0, 8, 16, 24].map((s) => ((n >>> s) & 0xff).toString(16).padStart(2, '0')).join('');

  return wordToHex(a0) + wordToHex(b0) + wordToHex(c0) + wordToHex(d0);
}
