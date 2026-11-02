/**
 * WebGL2 world-map renderer. It runs in the map runtime, the same page on every
 * platform: a WebView on iOS and Android, an iframe on the web.
 *
 * All static geometry lives in GPU buffers and never changes. Everything that
 * does change reads one "style table" texture with a texel per province:
 *
 *   row 0: fill colour and state flags (hover, selection, dimming, player);
 *   row 1: hatching colour;
 *   row 2: owner and political-unit group ids.
 *
 * A border segment carries the two province indices it separates, so the vertex
 * shader classifies it as internal, colonial or international from row 2 on every
 * frame. Ownership changes, map modes, hover and selection are therefore a single
 * small texture upload: no path, buffer or React work.
 *
 * Coasts come from the 1:10m land layer, which also masks the province fills
 * through the stencil buffer. Land outside the coarser province rings takes its
 * colour from the bundle's nearest-province raster, so fills meet the fine coast
 * with no gap and adjacent provinces show no seam.
 */

import type { Camera, MapBounds, MapViewportSize } from "./camera";
import { visibleBounds, visibleWorldOffsets } from "./camera";
import { MAP_HEIGHT, MAP_WIDTH } from "./projection";
import type { LineLayer, MeshLayer, RenderBundle, RenderChunk } from "./renderBundle";
import {
  GRATICULE_STRENGTH,
  RELIEF_STRENGTH,
  ZOOM_BANDS,
  bandMix,
  levelOfDetail,
  type MapPalette,
} from "./mapStyle";
import {
  STYLE_FLAG_HOVER,
  STYLE_FLAG_PLAYER,
  STYLE_FLAG_SELECTED_OWNER,
  STYLE_FLAG_SELECTED_PROVINCE,
  STYLE_FLAG_SELECTED_UNIT,
  STYLE_TABLE_ROWS,
  type ProvinceStyleTable,
} from "./mapModes";

const COMMON_VERTEX = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_center;
uniform float u_scale;
uniform vec2 u_viewport;
uniform float u_offset;
vec4 toClip(vec2 world) {
  vec2 px = (world + vec2(u_offset, 0.0) - u_center) * u_scale;
  return vec4(px.x * 2.0 / u_viewport.x, -px.y * 2.0 / u_viewport.y, 0.0, 1.0);
}
`;

const SHADE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform sampler2D u_style;
uniform sampler2D u_relief;
uniform vec2 u_mapSize;
uniform float u_pixelRatio;
uniform float u_reliefStrength;
uniform float u_landSaturation;
uniform vec3 u_tint;
uniform vec3 u_dim;
const int F_HOVER = 1, F_PROVINCE = 2, F_UNIT = 4, F_OWNER = 8, F_DIM = 16;
const float RELIEF_FLAT = 0.81;
vec3 shade(int id, vec2 world) {
  vec4 style = texelFetch(u_style, ivec2(id, 0), 0);
  vec3 color = style.rgb;
  int flags = int(style.a * 255.0 + 0.5);
  vec4 stripe = texelFetch(u_style, ivec2(id, 1), 0);
  if (stripe.a > 0.5) {
    float period = 9.0 * u_pixelRatio;
    float band = mod(gl_FragCoord.x + gl_FragCoord.y, period) / period;
    color = mix(color, stripe.rgb, step(0.5, band) * 0.86);
  }
  // The era takes saturation from the land as a whole.
  color = mix(vec3(dot(color, vec3(0.2126, 0.7152, 0.0722))), color, u_landSaturation);
  if ((flags & F_DIM) != 0) color = mix(color, u_dim, 0.72);
  if ((flags & F_OWNER) != 0) color = mix(color, u_tint, 0.04);
  if ((flags & F_UNIT) != 0) color = mix(color, u_tint, 0.09);
  if ((flags & F_PROVINCE) != 0) color = mix(color, u_tint, 0.15);
  if ((flags & F_HOVER) != 0) color = mix(color, u_tint, 0.1);
  float relief = texture(u_relief, world / u_mapSize).r - RELIEF_FLAT;
  // Mountains darken on the shadow side and only faintly lift on the lit side.
  color *= 1.0 + u_reliefStrength * (relief < 0.0 ? relief : relief * 0.55);
  return color;
}
`;

const FILL_VERTEX = `${COMMON_VERTEX}
in vec2 a_position;
in uint a_province;
flat out int v_id;
out vec2 v_world;
void main() {
  v_id = int(a_province);
  v_world = a_position;
  gl_Position = toClip(a_position);
}
`;

const FILL_FRAGMENT = `${SHADE_FRAGMENT}
flat in int v_id;
in vec2 v_world;
out vec4 fragColor;
void main() {
  fragColor = vec4(shade(v_id, v_world), 1.0);
}
`;

const LAND_VERTEX = `${COMMON_VERTEX}
in vec2 a_position;
out vec2 v_world;
void main() {
  v_world = a_position;
  gl_Position = toClip(a_position);
}
`;

const LAND_FRAGMENT = `${SHADE_FRAGMENT}
uniform usampler2D u_ids;
in vec2 v_world;
out vec4 fragColor;
void main() {
  ivec2 size = textureSize(u_ids, 0);
  float u = fract(v_world.x / u_mapSize.x);
  float v = clamp(v_world.y / u_mapSize.y, 0.0, 0.99999);
  uint cell = texelFetch(u_ids, ivec2(int(u * float(size.x)), int(v * float(size.y))), 0).r;
  fragColor = vec4(shade(int(cell & 32767u), v_world), 1.0);
}
`;

const SOLID_FRAGMENT = `#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 fragColor;
void main() {
  fragColor = vec4(u_color, 1.0);
}
`;

const SEA_VERTEX = `#version 300 es
precision highp float;
void main() {
  vec2 corner = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID & 2) * 2 - 1));
  gl_Position = vec4(corner, 0.0, 1.0);
}
`;

const SEA_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_ocean;
uniform vec2 u_center;
uniform float u_scale;
uniform vec2 u_viewport;
uniform vec2 u_mapSize;
uniform vec3 u_deep;
uniform vec3 u_shallow;
uniform vec3 u_graticule;
uniform float u_graticuleStrength;
uniform float u_pixelRatio;
out vec4 fragColor;
const float GALL_C = 1.7071067811865476;
const float GALL_K = 225.07907903927651;
void main() {
  vec2 px = vec2(gl_FragCoord.x, u_viewport.y - gl_FragCoord.y) - u_viewport * 0.5;
  vec2 world = u_center + px / u_scale;
  float depth = texture(u_ocean, world / u_mapSize).r;
  vec3 color = mix(u_deep, u_shallow, smoothstep(0.44, 0.72, depth));
  // Graticule every 15 degrees, drawn on the sea only.
  float north = GALL_C * GALL_K * 0.9004040442978399;
  float latitude = 2.0 * atan((north - world.y) / GALL_K / GALL_C) * 57.29577951308232;
  float longitude = world.x * 0.36 - 180.0;
  vec2 grid = vec2(longitude, latitude) / 15.0;
  vec2 lineDistance = abs(fract(grid - 0.5) - 0.5);
  vec2 perPixel = fwidth(grid);
  vec2 lineAmount = 1.0 - clamp(lineDistance / perPixel / max(u_pixelRatio * 0.75, 1.0), 0.0, 1.0);
  color = mix(color, u_graticule, max(lineAmount.x, lineAmount.y) * u_graticuleStrength);
  fragColor = vec4(color, 1.0);
}
`;

const LINE_VERTEX = `${COMMON_VERTEX}
uniform sampler2D u_style;
uniform int u_mode;
uniform float u_halfWidth;
uniform vec3 u_color;
in vec4 a_segment;
in uvec2 a_ids;
out vec3 v_color;
out float v_across;
out float v_half;
const int M_ALL = 0, M_PROVINCE = 1, M_UNIT = 2, M_NATIONAL = 3;
void main() {
  int a = int(a_ids.x);
  int b = int(a_ids.y);
  vec4 groupA = texelFetch(u_style, ivec2(a, 2), 0);
  vec4 groupB = texelFetch(u_style, ivec2(b, 2), 0);
  bool sameOwner = groupA.rg == groupB.rg;
  bool sameUnit = groupA.ba == groupB.ba;
  bool keep;
  if (u_mode == M_PROVINCE) keep = sameOwner && sameUnit;
  else if (u_mode == M_UNIT) keep = sameOwner && !sameUnit;
  else if (u_mode == M_NATIONAL) keep = !sameOwner;
  else keep = true;
  if (!keep) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  v_color = u_color;
  vec2 from = (a_segment.xy + vec2(u_offset, 0.0) - u_center) * u_scale;
  vec2 to = (a_segment.zw + vec2(u_offset, 0.0) - u_center) * u_scale;
  vec2 delta = to - from;
  float length2 = dot(delta, delta);
  vec2 direction = length2 > 0.0 ? delta / sqrt(length2) : vec2(1.0, 0.0);
  vec2 normal = vec2(-direction.y, direction.x);
  float reach = u_halfWidth + 1.0;
  int corner = gl_VertexID % 6;
  float end = (corner == 1 || corner == 2 || corner == 4) ? 1.0 : 0.0;
  float side = (corner == 0 || corner == 1 || corner == 3) ? -1.0 : 1.0;
  vec2 px = mix(from, to, end) + normal * side * reach + direction * (end * 2.0 - 1.0) * u_halfWidth * 0.5;
  v_across = side * reach;
  v_half = u_halfWidth;
  gl_Position = vec4(px.x * 2.0 / u_viewport.x, -px.y * 2.0 / u_viewport.y, 0.0, 1.0);
}
`;

const LINE_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_alpha;
in vec3 v_color;
in float v_across;
in float v_half;
out vec4 fragColor;
void main() {
  float distanceOut = abs(v_across);
  float coverage = clamp(v_half + 0.5 - distanceOut, 0.0, 1.0);
  fragColor = vec4(v_color, coverage * u_alpha);
}
`;

const LINE_MODE = {
  all: 0,
  province: 1,
  unit: 2,
  national: 3,
} as const;

/** Accent outlines, drawn in this order; each traces one province-flag edge. */
const ACCENT_STYLES = [
  { flag: STYLE_FLAG_SELECTED_OWNER, excludeFlag: STYLE_FLAG_SELECTED_UNIT, width: 0.9, color: "ownerRealm", alpha: 0.6 },
  { flag: STYLE_FLAG_PLAYER, excludeFlag: 0, width: 1, color: "player", alpha: 0.75 },
  { flag: STYLE_FLAG_SELECTED_UNIT, excludeFlag: 0, width: 1.8, color: "selection", alpha: 1 },
  { flag: STYLE_FLAG_HOVER, excludeFlag: 0, width: 1.1, color: "hover", alpha: 0.9 },
  { flag: STYLE_FLAG_SELECTED_PROVINCE, excludeFlag: 0, width: 2.2, color: "selectedProvince", alpha: 1 },
] as const;

interface AccentRange {
  borderStart: number;
  borderCount: number;
  coastStart: number;
  coastCount: number;
}

const offsetUniform = (program: Program): WebGLUniformLocation | null =>
  program.uniforms.get("u_offset") ?? null;

interface Program {
  readonly program: WebGLProgram;
  readonly uniforms: Map<string, WebGLUniformLocation>;
}

interface MeshBuffers {
  readonly vao: WebGLVertexArrayObject;
  readonly source: MeshLayer;
}

interface LineBuffers {
  readonly vao: WebGLVertexArrayObject;
  readonly segmentBuffer: WebGLBuffer;
  readonly idBuffer: WebGLBuffer;
  readonly source: LineLayer;
}

export interface FrameCounters {
  drawCalls: number;
  renderedSegments: number;
}

function compile(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (shader === null) throw new Error("WebGL: could not create a shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    throw new Error(`WebGL shader: ${gl.getShaderInfoLog(shader) ?? "compile failed"}`);
  }
  return shader;
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): Program {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertex));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(program);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    throw new Error(`WebGL program: ${gl.getProgramInfoLog(program) ?? "link failed"}`);
  }
  const uniforms = new Map<string, WebGLUniformLocation>();
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (info === null) continue;
    const location = gl.getUniformLocation(program, info.name);
    if (location !== null) uniforms.set(info.name, location);
  }
  return { program, uniforms };
}

function intersects(chunk: RenderChunk, offset: number, view: MapBounds): boolean {
  return !(
    chunk[4] + offset < view.minX ||
    chunk[2] + offset > view.maxX ||
    chunk[5] < view.minY ||
    chunk[3] > view.maxY
  );
}

export class MapGlRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly bundle: RenderBundle;
  private readonly fillProgram: Program;
  private readonly landProgram: Program;
  private readonly solidProgram: Program;
  private readonly seaProgram: Program;
  private readonly lineProgram: Program;
  private readonly seaVao: WebGLVertexArrayObject;
  private readonly fillVao: MeshBuffers;
  private readonly land: readonly MeshBuffers[];
  private readonly lakes: readonly MeshBuffers[];
  private readonly coast: readonly LineBuffers[];
  private readonly borders: readonly LineBuffers[];
  private readonly rivers: readonly LineBuffers[];
  private readonly styleTexture: WebGLTexture;
  private readonly idTexture: WebGLTexture;
  private readonly reliefTexture: WebGLTexture;
  private readonly oceanTexture: WebGLTexture;
  private styleWidth = 0;
  private styleData: Uint8Array | null = null;
  private readonly accentVao: WebGLVertexArrayObject;
  private readonly accentSegments: WebGLBuffer;
  private readonly accentIds: WebGLBuffer;
  private readonly accentSegmentLocation: number;
  private readonly accentIdLocation: number;
  private accentRanges: readonly AccentRange[] = [];
  /** Level of detail the accent buffers were built for; -1 means stale. */
  private accentLod = -1;
  private palette: MapPalette;
  readonly counters: FrameCounters = { drawCalls: 0, renderedSegments: 0 };

  constructor(gl: WebGL2RenderingContext, bundle: RenderBundle, palette: MapPalette) {
    this.gl = gl;
    this.bundle = bundle;
    this.palette = palette;
    this.fillProgram = link(gl, FILL_VERTEX, FILL_FRAGMENT);
    this.landProgram = link(gl, LAND_VERTEX, LAND_FRAGMENT);
    this.solidProgram = link(gl, LAND_VERTEX, SOLID_FRAGMENT);
    this.seaProgram = link(gl, SEA_VERTEX, SEA_FRAGMENT);
    this.lineProgram = link(gl, LINE_VERTEX, LINE_FRAGMENT);

    this.seaVao = this.createVao();
    this.fillVao = this.createMesh(bundle.fill, this.fillProgram, bundle.fillProvince);
    this.land = bundle.land.map((layer) => this.createMesh(layer, this.landProgram, null));
    this.lakes = bundle.lakes.map((layer) => this.createMesh(layer, this.solidProgram, null));
    this.coast = bundle.coast.map((layer) => this.createLines(layer));
    this.borders = bundle.borders.map((layer) => this.createLines(layer));
    this.rivers = bundle.rivers.map((layer) => this.createLines(layer));

    this.accentVao = this.createVao();
    gl.bindVertexArray(this.accentVao);
    this.accentSegmentLocation = gl.getAttribLocation(this.lineProgram.program, "a_segment");
    this.accentIdLocation = gl.getAttribLocation(this.lineProgram.program, "a_ids");
    this.accentSegments = gl.createBuffer();
    this.accentIds = gl.createBuffer();
    gl.enableVertexAttribArray(this.accentSegmentLocation);
    gl.vertexAttribDivisor(this.accentSegmentLocation, 1);
    gl.enableVertexAttribArray(this.accentIdLocation);
    gl.vertexAttribDivisor(this.accentIdLocation, 1);
    gl.bindVertexArray(null);

    this.styleTexture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.styleTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.idTexture = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.idTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R16UI,
      bundle.raster.width,
      bundle.raster.height,
      0,
      gl.RED_INTEGER,
      gl.UNSIGNED_SHORT,
      bundle.raster.cells,
    );
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    this.reliefTexture = this.createTexture();
    this.oceanTexture = this.createTexture();
    // Until a raster arrives the land reads flat and the sea reads deep.
    for (const [texture, value] of [
      [this.reliefTexture, 207],
      [this.oceanTexture, 96],
    ] as const) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([value]));
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    }
  }

  private createVao(): WebGLVertexArrayObject {
    return this.gl.createVertexArray();
  }

  private createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  private createMesh(layer: MeshLayer, program: Program, provinces: Uint16Array | null): MeshBuffers {
    const gl = this.gl;
    const vao = this.createVao();
    gl.bindVertexArray(vao);
    const positions = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);
    gl.bufferData(gl.ARRAY_BUFFER, layer.positions, gl.STATIC_DRAW);
    const location = gl.getAttribLocation(program.program, "a_position");
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    if (provinces !== null) {
      const ids = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ids);
      gl.bufferData(gl.ARRAY_BUFFER, provinces, gl.STATIC_DRAW);
      const idLocation = gl.getAttribLocation(program.program, "a_province");
      gl.enableVertexAttribArray(idLocation);
      gl.vertexAttribIPointer(idLocation, 1, gl.UNSIGNED_SHORT, 0, 0);
    }
    const indices = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, layer.indices, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, source: layer };
  }

  private createLines(layer: LineLayer): LineBuffers {
    const gl = this.gl;
    const vao = this.createVao();
    gl.bindVertexArray(vao);
    const segmentBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, segmentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, layer.segments, gl.STATIC_DRAW);
    const segment = gl.getAttribLocation(this.lineProgram.program, "a_segment");
    gl.enableVertexAttribArray(segment);
    gl.vertexAttribDivisor(segment, 1);
    const idBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, idBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, layer.ids, gl.STATIC_DRAW);
    const ids = gl.getAttribLocation(this.lineProgram.program, "a_ids");
    gl.enableVertexAttribArray(ids);
    gl.vertexAttribDivisor(ids, 1);
    gl.bindVertexArray(null);
    return { vao, segmentBuffer, idBuffer, source: layer };
  }

  setStyleTable(table: ProvinceStyleTable): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.styleTexture);
    if (table.width !== this.styleWidth) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, table.width, STYLE_TABLE_ROWS, 0, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
      this.styleWidth = table.width;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, table.width, STYLE_TABLE_ROWS, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
    }
    this.styleData = table.data;
    this.accentLod = -1;
  }

  /** Upload only row 0, the fill and flags row, after a hover or selection. */
  updateFlagsRow(table: ProvinceStyleTable): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.styleTexture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, table.width, 1, gl.RGBA, gl.UNSIGNED_BYTE, table.data);
    this.styleData = table.data;
    this.accentLod = -1;
  }

  /**
   * Rebuild the outline buffers from the province flags. This runs only when the
   * flags or the level of detail change: a pass over every segment here replaces
   * the same test in the vertex shader on every frame.
   */
  private prepareAccents(lod: number): void {
    if (lod === this.accentLod || this.styleData === null) return;
    this.accentLod = lod;
    const gl = this.gl;
    const flags = this.styleData;
    const border = this.bundle.borders[lod];
    const coast = this.bundle.coast[lod];
    if (border === undefined || coast === undefined) return;
    const flagOf = (id: number): number => (id === 0 ? 0 : (flags[id * 4 + 3] ?? 0));
    const selected: number[] = [];
    const collect = (layer: LineLayer, style: (typeof ACCENT_STYLES)[number]): number => {
      const before = selected.length;
      const count = layer.ids.length / 2;
      for (let segment = 0; segment < count; segment += 1) {
        const a = flagOf(layer.ids[segment * 2] ?? 0);
        const b = flagOf(layer.ids[segment * 2 + 1] ?? 0);
        if ((a & style.flag) === (b & style.flag)) continue;
        if (((a | b) & style.excludeFlag) !== 0) continue;
        selected.push(segment);
      }
      return selected.length - before;
    };
    const ranges: AccentRange[] = [];
    const borderStarts: number[] = [];
    for (const style of ACCENT_STYLES) {
      const start = selected.length;
      borderStarts.push(start);
      const borderCount = collect(border, style);
      ranges.push({ borderStart: start, borderCount, coastStart: 0, coastCount: 0 });
    }
    const borderTotal = selected.length;
    ACCENT_STYLES.forEach((style, index) => {
      const range = ranges[index];
      if (range === undefined) return;
      range.coastStart = selected.length;
      range.coastCount = collect(coast, style);
    });
    const segments = new Float32Array(selected.length * 4);
    const ids = new Uint16Array(selected.length * 2);
    selected.forEach((segment, position) => {
      const layer = position < borderTotal ? border : coast;
      segments.set(layer.segments.subarray(segment * 4, segment * 4 + 4), position * 4);
      ids[position * 2] = layer.ids[segment * 2] ?? 0;
      ids[position * 2 + 1] = layer.ids[segment * 2 + 1] ?? 0;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.accentSegments);
    gl.bufferData(gl.ARRAY_BUFFER, segments, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.accentIds);
    gl.bufferData(gl.ARRAY_BUFFER, ids, gl.DYNAMIC_DRAW);
    this.accentRanges = ranges;
  }

  /** Upload a raster as one channel: a quarter of the GPU memory of RGBA. */
  setImageTexture(kind: "relief" | "ocean", image: ImageBitmap | HTMLImageElement): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, kind === "relief" ? this.reliefTexture : this.oceanTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, image);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  setPalette(palette: MapPalette): void {
    this.palette = palette;
  }

  private bindCommon(program: Program, camera: Camera, viewport: MapViewportSize, dpr: number): void {
    const gl = this.gl;
    gl.useProgram(program.program);
    const uniform = (name: string): WebGLUniformLocation | null => program.uniforms.get(name) ?? null;
    gl.uniform2f(uniform("u_center"), camera.x, camera.y);
    gl.uniform1f(uniform("u_scale"), camera.scale * dpr);
    gl.uniform2f(uniform("u_viewport"), viewport.width * dpr, viewport.height * dpr);
    gl.uniform2f(uniform("u_mapSize"), MAP_WIDTH, MAP_HEIGHT);
    gl.uniform1f(uniform("u_pixelRatio"), dpr);
    gl.uniform1i(uniform("u_style"), 0);
    gl.uniform1i(uniform("u_relief"), 1);
    gl.uniform1i(uniform("u_ids"), 2);
    gl.uniform1i(uniform("u_ocean"), 3);
    gl.uniform1f(uniform("u_landSaturation"), this.palette.landSaturation);
    gl.uniform3fv(uniform("u_tint"), this.palette.hover);
    gl.uniform3fv(uniform("u_dim"), this.palette.seaDeep);
  }

  private drawMesh(buffers: MeshBuffers, program: Program, view: MapBounds, offsets: readonly number[]): void {
    const gl = this.gl;
    const offsetUniform = program.uniforms.get("u_offset") ?? null;
    gl.bindVertexArray(buffers.vao);
    for (const offset of offsets) {
      gl.uniform1f(offsetUniform, offset);
      let start = -1;
      let count = 0;
      const flush = (): void => {
        if (count > 0) {
          gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_INT, start * 4);
          this.counters.drawCalls += 1;
        }
        count = 0;
      };
      for (const chunk of buffers.source.chunks) {
        if (!intersects(chunk, offset, view)) {
          flush();
          continue;
        }
        if (count === 0) start = chunk[0];
        count += chunk[1];
      }
      flush();
    }
  }

  private drawLines(buffers: LineBuffers, view: MapBounds, offsets: readonly number[]): void {
    const gl = this.gl;
    const program = this.lineProgram;
    const offsetUniform = program.uniforms.get("u_offset") ?? null;
    const segmentLocation = gl.getAttribLocation(program.program, "a_segment");
    const idLocation = gl.getAttribLocation(program.program, "a_ids");
    gl.bindVertexArray(buffers.vao);
    for (const offset of offsets) {
      gl.uniform1f(offsetUniform, offset);
      let start = -1;
      let count = 0;
      const flush = (): void => {
        if (count > 0) {
          gl.bindBuffer(gl.ARRAY_BUFFER, buffers.segmentBuffer);
          gl.vertexAttribPointer(segmentLocation, 4, gl.FLOAT, false, 0, start * 16);
          gl.bindBuffer(gl.ARRAY_BUFFER, buffers.idBuffer);
          gl.vertexAttribIPointer(idLocation, 2, gl.UNSIGNED_SHORT, 0, start * 4);
          gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
          this.counters.drawCalls += 1;
          this.counters.renderedSegments += count;
        }
        count = 0;
      };
      for (const chunk of buffers.source.chunks) {
        if (!intersects(chunk, offset, view)) {
          flush();
          continue;
        }
        if (count === 0) start = chunk[0];
        count += chunk[1];
      }
      flush();
    }
  }

  /**
   * Draw one view into the lower-left of the drawing buffer. `lodOverride` lets
   * the loupe share the main view's geometry level, so one frame never rebuilds
   * the accent buffers twice.
   */
  render(camera: Camera, viewport: MapViewportSize, dpr: number, lodOverride?: number): void {
    const gl = this.gl;
    const PALETTE = this.palette;
    this.counters.drawCalls = 0;
    this.counters.renderedSegments = 0;
    const deviceWidth = Math.round(viewport.width * dpr);
    const deviceHeight = Math.round(viewport.height * dpr);
    gl.viewport(0, 0, deviceWidth, deviceHeight);
    gl.clearStencil(0);
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.styleTexture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.reliefTexture);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.idTexture);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.oceanTexture);

    const view = visibleBounds(camera, viewport);
    const deviceScale = camera.scale * dpr;
    const lod = lodOverride ?? levelOfDetail(deviceScale);
    const offsets = visibleWorldOffsets(view, this.bundle.extentMinX, this.bundle.extentMaxX);
    const coastLod = this.coast[lod];
    const borderLod = this.borders[lod];
    const riverLod = this.rivers[lod];
    const landLod = this.land[lod];
    const lakeLod = this.lakes[lod];
    if (coastLod === undefined || borderLod === undefined || riverLod === undefined || landLod === undefined || lakeLod === undefined) {
      return;
    }

    // Sea.
    gl.disable(gl.STENCIL_TEST);
    this.bindCommon(this.seaProgram, camera, viewport, dpr);
    const seaUniform = (name: string): WebGLUniformLocation | null => this.seaProgram.uniforms.get(name) ?? null;
    gl.uniform3fv(seaUniform("u_deep"), PALETTE.seaDeep);
    gl.uniform3fv(seaUniform("u_shallow"), PALETTE.seaShallow);
    gl.uniform3fv(seaUniform("u_graticule"), PALETTE.graticule);
    gl.uniform1f(
      seaUniform("u_graticuleStrength"),
      GRATICULE_STRENGTH * (1 - bandMix(deviceScale / dpr, ZOOM_BANDS.graticuleFadeStart, ZOOM_BANDS.graticuleFadeEnd)),
    );
    gl.bindVertexArray(this.seaVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Land paints the stencil; everything political is confined to it.
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.stencilFunc(gl.ALWAYS, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    this.bindCommon(this.landProgram, camera, viewport, dpr);
    const relief =
      RELIEF_STRENGTH * (1 - 0.9 * bandMix(camera.scale, ZOOM_BANDS.reliefFadeStart, ZOOM_BANDS.reliefFadeEnd));
    gl.uniform1f(this.landProgram.uniforms.get("u_reliefStrength") ?? null, relief);
    this.drawMesh(landLod, this.landProgram, view, offsets);

    gl.stencilFunc(gl.EQUAL, 1, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    this.bindCommon(this.fillProgram, camera, viewport, dpr);
    gl.uniform1f(this.fillProgram.uniforms.get("u_reliefStrength") ?? null, relief);
    this.drawMesh(this.fillVao, this.fillProgram, view, offsets);

    // Lakes cut the stencil, so borders do not run across open water.
    gl.stencilFunc(gl.ALWAYS, 0, 0xff);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    this.bindCommon(this.solidProgram, camera, viewport, dpr);
    gl.uniform3fv(this.solidProgram.uniforms.get("u_color") ?? null, PALETTE.lake);
    this.drawMesh(lakeLod, this.solidProgram, view, offsets);

    // Lines, weakest to strongest.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.bindCommon(this.lineProgram, camera, viewport, dpr);
    const uniforms = this.lineProgram.uniforms;
    const drawLine = (
      buffers: LineBuffers,
      mode: number,
      widthPx: number,
      color: Float32Array,
      alpha: number,
    ): void => {
      if (alpha <= 0.01) return;
      gl.uniform1i(uniforms.get("u_mode") ?? null, mode);
      gl.uniform1f(uniforms.get("u_halfWidth") ?? null, (widthPx * dpr) / 2);
      gl.uniform3fv(uniforms.get("u_color") ?? null, color);
      gl.uniform1f(uniforms.get("u_alpha") ?? null, alpha);
      this.drawLines(buffers, view, offsets);
    };
    const inside = (): void => {
      gl.stencilFunc(gl.EQUAL, 1, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    };
    const free = (): void => {
      gl.stencilFunc(gl.ALWAYS, 0, 0xff);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    };
    const scale = camera.scale;

    inside();
    const riverAmount = bandMix(scale, ZOOM_BANDS.riverStart, ZOOM_BANDS.riverFull);
    drawLine(riverLod, LINE_MODE.all, 0.6 + riverAmount * 0.4, PALETTE.river, 0.2 + riverAmount * 0.5);

    const provinceAmount = bandMix(scale, ZOOM_BANDS.provinceStart, ZOOM_BANDS.provinceFull);
    drawLine(borderLod, LINE_MODE.province, 0.6 + provinceAmount * 0.2, PALETTE.provinceLine, provinceAmount * 0.24);
    const unitAmount = bandMix(scale, ZOOM_BANDS.unitStart, ZOOM_BANDS.unitFull);
    drawLine(borderLod, LINE_MODE.unit, 0.7 + unitAmount * 0.2, PALETTE.border, 0.22 + unitAmount * 0.18);

    free();
    drawLine(coastLod, LINE_MODE.all, 0.7 + unitAmount * 0.2, PALETTE.coast, 0.8);

    inside();
    const nationalAmount = bandMix(scale, ZOOM_BANDS.nationalThin, ZOOM_BANDS.nationalFull);
    drawLine(borderLod, LINE_MODE.national, 0.8 + nationalAmount * 0.5, PALETTE.border, 0.62 + nationalAmount * 0.18);

    // Selection, always above the map's own line work.
    this.prepareAccents(lod);
    gl.uniform1i(uniforms.get("u_mode") ?? null, LINE_MODE.all);
    gl.uniform1f(offsetUniform(this.lineProgram), 0);
    gl.bindVertexArray(this.accentVao);
    const drawAccent = (start: number, count: number, widthPx: number, color: Float32Array, alpha: number): void => {
      if (count === 0) return;
      gl.uniform1f(uniforms.get("u_halfWidth") ?? null, (widthPx * dpr) / 2);
      gl.uniform3fv(uniforms.get("u_color") ?? null, color);
      gl.uniform1f(uniforms.get("u_alpha") ?? null, alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.accentSegments);
      gl.vertexAttribPointer(this.accentSegmentLocation, 4, gl.FLOAT, false, 0, start * 16);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.accentIds);
      gl.vertexAttribIPointer(this.accentIdLocation, 2, gl.UNSIGNED_SHORT, 0, start * 4);
      for (const offset of offsets) {
        gl.uniform1f(offsetUniform(this.lineProgram), offset);
        gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, count);
        this.counters.drawCalls += 1;
      }
    };
    for (const [index, style] of ACCENT_STYLES.entries()) {
      const range = this.accentRanges[index];
      if (range === undefined) continue;
      const color = PALETTE[style.color];
      inside();
      drawAccent(range.borderStart, range.borderCount, style.width + 1.4, PALETTE.casing, style.alpha * 0.4);
      drawAccent(range.borderStart, range.borderCount, style.width, color, style.alpha);
      free();
      drawAccent(range.coastStart, range.coastCount, style.width + 1.4, PALETTE.casing, style.alpha * 0.4);
      drawAccent(range.coastStart, range.coastCount, style.width, color, style.alpha);
    }

    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
}
