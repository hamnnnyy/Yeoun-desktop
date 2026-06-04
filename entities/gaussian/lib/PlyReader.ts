/**
 * PlyReader — ASCII / Little-endian Binary PLY 파서
 *
 * 3D / 4D Gaussian Splatting 출력물에서 다음 속성을 읽습니다:
 *   - position: x, y, z
 *   - color (DC): f_dc_0, f_dc_1, f_dc_2  (또는 red, green, blue)
 *   - scale: scale_0, scale_1, scale_2
 *   - rotation: rot_0, rot_1, rot_2, rot_3
 */

export interface ParsedSplat {
  positions: Float32Array; // [x, y, z, ...]
  colors: Float32Array;    // [r, g, b, ...] normalized 0–1
  scales: Float32Array;    // [sx, sy, sz, ...]
  rotations: Float32Array; // [qw, qx, qy, qz, ...]
  count: number;
}

// Spherical Harmonics DC band → linear color
const SH_C0 = 0.28209479177387814;

function shToLinear(sh: number): number {
  return Math.max(0, Math.min(1, sh * SH_C0 + 0.5));
}

// ───────────────────────────────────────────────
// Header Parsing
// ───────────────────────────────────────────────

interface PlyProperty {
  type: string;
  name: string;
  byteSize: number;
}

interface PlyHeader {
  format: 'ascii' | 'binary_little_endian' | 'binary_big_endian';
  vertexCount: number;
  properties: PlyProperty[];
  headerByteLength: number;
}

const TYPE_SIZES: Record<string, number> = {
  char: 1, uchar: 1, short: 2, ushort: 2,
  int: 4, uint: 4, float: 4, double: 8,
  int8: 1, uint8: 1, int16: 2, uint16: 2,
  int32: 4, uint32: 4, float32: 4, float64: 8,
};

function parseHeader(buffer: ArrayBuffer): PlyHeader {
  const bytes = new Uint8Array(buffer);
  let pos = 0;

  // Read lines until 'end_header'
  const lines: string[] = [];
  let lineStart = 0;
  while (pos < bytes.length) {
    if (bytes[pos] === 0x0a) { // \n
      lines.push(
        String.fromCharCode(...bytes.slice(lineStart, pos)).replace(/\r$/, ''),
      );
      if (lines[lines.length - 1] === 'end_header') {
        pos++;
        break;
      }
      lineStart = pos + 1;
    }
    pos++;
  }

  let format: PlyHeader['format'] = 'ascii';
  let vertexCount = 0;
  const properties: PlyProperty[] = [];
  let inVertexElement = false;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'format') {
      format = parts[1] as PlyHeader['format'];
    } else if (parts[0] === 'element') {
      inVertexElement = parts[1] === 'vertex';
      if (inVertexElement) vertexCount = parseInt(parts[2], 10);
    } else if (parts[0] === 'property' && inVertexElement) {
      properties.push({
        type: parts[1],
        name: parts[2],
        byteSize: TYPE_SIZES[parts[1]] ?? 4,
      });
    }
  }

  return { format, vertexCount, properties, headerByteLength: pos };
}

// ───────────────────────────────────────────────
// Binary little-endian reader
// ───────────────────────────────────────────────

function readBinary(buffer: ArrayBuffer, header: PlyHeader): ParsedSplat {
  const { vertexCount, properties, headerByteLength } = header;
  const view = new DataView(buffer, headerByteLength);

  // Map property name → byte offset within one vertex record
  let stride = 0;
  const offsets: Record<string, number> = {};
  for (const prop of properties) {
    offsets[prop.name] = stride;
    stride += prop.byteSize;
  }

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const scales = new Float32Array(vertexCount * 3);
  const rotations = new Float32Array(vertexCount * 4);

  const getFloat = (base: number, name: string): number => {
    if (!(name in offsets)) return 0;
    return view.getFloat32(base + offsets[name], true);
  };

  for (let i = 0; i < vertexCount; i++) {
    const base = i * stride;

    positions[i * 3]     = getFloat(base, 'x');
    positions[i * 3 + 1] = getFloat(base, 'y');
    positions[i * 3 + 2] = getFloat(base, 'z');

    // GS exports use SH coefficients (f_dc_*) or raw uint8 color
    if ('f_dc_0' in offsets) {
      colors[i * 3]     = shToLinear(getFloat(base, 'f_dc_0'));
      colors[i * 3 + 1] = shToLinear(getFloat(base, 'f_dc_1'));
      colors[i * 3 + 2] = shToLinear(getFloat(base, 'f_dc_2'));
    } else {
      // Fallback: normalised float or uint8
      const rOff = offsets['red'] ?? offsets['r'];
      const gOff = offsets['green'] ?? offsets['g'];
      const bOff = offsets['blue'] ?? offsets['b'];
      const isUint8 = properties.find(
        (p) => p.name === 'red' || p.name === 'r',
      )?.type === 'uchar';
      if (isUint8) {
        colors[i * 3]     = view.getUint8(base + (rOff ?? 0)) / 255;
        colors[i * 3 + 1] = view.getUint8(base + (gOff ?? 0)) / 255;
        colors[i * 3 + 2] = view.getUint8(base + (bOff ?? 0)) / 255;
      } else {
        colors[i * 3]     = Math.max(0, Math.min(1, view.getFloat32(base + (rOff ?? 0), true)));
        colors[i * 3 + 1] = Math.max(0, Math.min(1, view.getFloat32(base + (gOff ?? 0), true)));
        colors[i * 3 + 2] = Math.max(0, Math.min(1, view.getFloat32(base + (bOff ?? 0), true)));
      }
    }

    scales[i * 3]     = Math.exp(getFloat(base, 'scale_0'));
    scales[i * 3 + 1] = Math.exp(getFloat(base, 'scale_1'));
    scales[i * 3 + 2] = Math.exp(getFloat(base, 'scale_2'));

    rotations[i * 4]     = getFloat(base, 'rot_0');
    rotations[i * 4 + 1] = getFloat(base, 'rot_1');
    rotations[i * 4 + 2] = getFloat(base, 'rot_2');
    rotations[i * 4 + 3] = getFloat(base, 'rot_3');
  }

  return { positions, colors, scales, rotations, count: vertexCount };
}

// ───────────────────────────────────────────────
// ASCII reader
// ───────────────────────────────────────────────

function readAscii(buffer: ArrayBuffer, header: PlyHeader): ParsedSplat {
  const { vertexCount, properties, headerByteLength } = header;
  const text = new TextDecoder().decode(buffer).slice(headerByteLength);
  const lines = text.split('\n');

  const propIndex: Record<string, number> = {};
  properties.forEach((p, i) => { propIndex[p.name] = i; });

  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const scales = new Float32Array(vertexCount * 3);
  const rotations = new Float32Array(vertexCount * 4);

  const get = (vals: string[], name: string): number => {
    const idx = propIndex[name];
    return idx !== undefined ? parseFloat(vals[idx]) : 0;
  };

  for (let i = 0; i < vertexCount; i++) {
    const vals = lines[i]?.trim().split(/\s+/) ?? [];

    positions[i * 3]     = get(vals, 'x');
    positions[i * 3 + 1] = get(vals, 'y');
    positions[i * 3 + 2] = get(vals, 'z');

    if ('f_dc_0' in propIndex) {
      colors[i * 3]     = shToLinear(get(vals, 'f_dc_0'));
      colors[i * 3 + 1] = shToLinear(get(vals, 'f_dc_1'));
      colors[i * 3 + 2] = shToLinear(get(vals, 'f_dc_2'));
    } else {
      colors[i * 3]     = Math.max(0, Math.min(1, get(vals, 'red') / 255));
      colors[i * 3 + 1] = Math.max(0, Math.min(1, get(vals, 'green') / 255));
      colors[i * 3 + 2] = Math.max(0, Math.min(1, get(vals, 'blue') / 255));
    }

    scales[i * 3]     = Math.exp(get(vals, 'scale_0'));
    scales[i * 3 + 1] = Math.exp(get(vals, 'scale_1'));
    scales[i * 3 + 2] = Math.exp(get(vals, 'scale_2'));

    rotations[i * 4]     = get(vals, 'rot_0');
    rotations[i * 4 + 1] = get(vals, 'rot_1');
    rotations[i * 4 + 2] = get(vals, 'rot_2');
    rotations[i * 4 + 3] = get(vals, 'rot_3');
  }

  return { positions, colors, scales, rotations, count: vertexCount };
}

// ───────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────

export async function parsePly(buffer: ArrayBuffer): Promise<ParsedSplat> {
  const header = parseHeader(buffer);
  if (header.format === 'ascii') {
    return readAscii(buffer, header);
  }
  // binary_big_endian은 현재 미지원 (4DGS는 항상 little-endian 출력)
  return readBinary(buffer, header);
}
