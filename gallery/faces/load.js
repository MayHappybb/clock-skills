// Faces are loaded one module at a time. The workers import each skill's
// player.js through lazy/<id>.js, whose design registry starts empty
// (tools/lazy.mjs), and add a design to it the first time a face needs it.

/** Add design `key` (module `file`, in the `designs` directory URL) to `DESIGNS`, and return it. */
export async function loadDesign(DESIGNS, designs, key, file) {
  if (!DESIGNS[key]) {
    const mod = await import(new URL(file, designs).href);
    if (!mod.default?.frame) throw new Error(`${file} has no default export with a frame() function`);
    DESIGNS[key] ??= mod.default;
  }
  return DESIGNS[key];
}
