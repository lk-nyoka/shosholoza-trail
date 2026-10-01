// Lettered boards for the 3D world.
//
// A station without its name on it is a shed. Signage is also the cheapest
// localisation there is: one board reading PRETORIA does more to place the
// scene than any amount of geometry.
//
// Text is drawn to a canvas and used as a texture, so there is no font file to
// ship and no glyph geometry to build. Boards are deliberately plain - enamel
// lettering on a plain ground, which is what platform signs actually look like
// - and every string is a place name or plain wayfinding. No operator branding
// or logos are reproduced.
import * as THREE from 'three';

export type BoardStyle = {
  background: string;
  ink: string;
  /** Drawn inside the edge; set to null for no border. */
  border?: string | null;
  /** 0-1 of the board height. */
  fontScale?: number;
  weight?: number;
  letterSpacing?: number;
};

export const SIGN_STYLES = {
  /** Dark green ground, cream letters: the classic South African platform board. */
  station: { background: '#17392c', ink: '#f2ead6', border: '#f2ead6', fontScale: 0.5, weight: 700, letterSpacing: 0.14 },
  /** Reversed, for platform numbers and smaller wayfinding. */
  platform: { background: '#f2ead6', ink: '#17392c', border: '#17392c', fontScale: 0.6, weight: 700, letterSpacing: 0.06 },
  /** Yellow warning ground, for lineside and crossing notices. */
  warning: { background: '#e8b93f', ink: '#20211c', border: '#20211c', fontScale: 0.46, weight: 700, letterSpacing: 0.05 },
} satisfies Record<string, BoardStyle>;

/** Pixels per metre of board. Enough that lettering stays sharp up close. */
const RESOLUTION = 128;

/**
 * Render a line of text to a texture sized for a board of the given metres.
 * Returns null where there is no DOM - the tests run in Node.
 */
export function signTexture(text: string, widthMetres: number, heightMetres: number, style: BoardStyle) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(32, Math.round(widthMetres * RESOLUTION));
  canvas.height = Math.max(16, Math.round(heightMetres * RESOLUTION));
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = style.background;
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (style.border) {
    const inset = canvas.height * 0.07;
    context.strokeStyle = style.border;
    context.lineWidth = Math.max(2, canvas.height * 0.035);
    context.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
  }

  const size = canvas.height * (style.fontScale ?? 0.5);
  context.fillStyle = style.ink;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `${style.weight ?? 700} ${size}px "Helvetica Neue", Arial, sans-serif`;
  // letterSpacing is not universally supported, so tracking is done by hand:
  // measure the string, then draw glyph by glyph.
  const tracking = size * (style.letterSpacing ?? 0);
  const glyphs = [...text];
  const total = glyphs.reduce((sum, glyph) => sum + context.measureText(glyph).width + tracking, -tracking);
  // Shrink to fit rather than overflow, so a long name never runs off the board.
  const usable = canvas.width * 0.88;
  const scale = total > usable ? usable / total : 1;
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.scale(scale, scale);
  let x = -total / 2;
  for (const glyph of glyphs) {
    const advance = context.measureText(glyph).width;
    context.fillText(glyph, x + advance / 2, 0);
    x += advance + tracking;
  }
  context.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type Board = { mesh: THREE.Mesh; dispose(): void };

/**
 * A flat lettered board. Faces +Z in its own space; rotate the returned mesh
 * to aim it.
 */
export function createBoard(text: string, widthMetres: number, heightMetres: number, style: BoardStyle, doubleSided = true): Board {
  const texture = signTexture(text, widthMetres, heightMetres, style);
  const material = new THREE.MeshStandardMaterial({
    color: texture ? '#ffffff' : style.background,
    roughness: 0.62,
    side: THREE.FrontSide,
  });
  // Assigned only when there is one: passing `map: undefined` to the
  // constructor makes three.js warn on every board built without a DOM.
  if (texture) material.map = texture;
  const geometry = new THREE.PlaneGeometry(widthMetres, heightMetres);
  const mesh = new THREE.Mesh(geometry, material);
  if (doubleSided) {
    // DoubleSide mirrors the lettering from behind. Use a second outward face.
    const back = new THREE.Mesh(geometry, material);
    back.rotation.y = Math.PI; back.position.z = -.002;
    back.receiveShadow = true; mesh.add(back);
  }
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() { geometry.dispose(); material.dispose(); texture?.dispose(); },
  };
}

/** A board on two posts, planted on the ground. Returns the whole assembly. */
export function createPostedSign(
  text: string,
  widthMetres: number,
  heightMetres: number,
  style: BoardStyle,
  postMaterial: THREE.Material,
  standHeight = 1.9,
): Board {
  const group = new THREE.Group();
  const board = createBoard(text, widthMetres, heightMetres, style);
  board.mesh.position.y = standHeight + heightMetres / 2;
  group.add(board.mesh);

  const postGeometry = new THREE.BoxGeometry(0.11, standHeight + heightMetres * 0.5, 0.11);
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(postGeometry, postMaterial);
    post.position.set(sign * (widthMetres / 2 - 0.35), (standHeight + heightMetres * 0.5) / 2, -0.06);
    post.castShadow = true;
    group.add(post);
  }

  // The group is returned through `mesh` so callers treat it like any board.
  return {
    mesh: group as unknown as THREE.Mesh,
    dispose() { board.dispose(); postGeometry.dispose(); },
  };
}
