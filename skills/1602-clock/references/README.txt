This folder is the source of truth for the skill: SKILL.md, sim/, tools/ and
references/ are all edited here. (An earlier note said sim/ and tools/ were
generated from a separate project by tools/pack-skill.mjs; no such project or
script ships with the skill.)

hardware.md lists every hardware fact the skill relies on, with the datasheet
section it comes from. Start there if something looks wrong on the bench.

tools/extract-rom.mjs rebuilds sim/js/cgrom-a00.js from the ROM table (Table 2)
of the module datasheet, saved as a greyscale PGM. The extracted ROM is already
in sim/js/cgrom-a00.js and has been re-checked against the table; you only need
the extractor to verify or rebuild it.
