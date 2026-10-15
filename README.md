# clock-skills

Backup of the Claude Code skills for designing clock faces, with every face design.

Browse the faces in the simulators: https://mayhappybb.github.io/clock-skills/

| Skill | Display | Designs |
|---|---|---|
| `skills/1602-clock` | 16x2 character LCD (HD44780) | `sim/designs/` |
| `skills/oled-clock` | 128x64 / 128x32 monochrome OLED (SSD1306, SH1106) | `sim/designs/` |
| `skills/ws2812-clock` | WS2812 boards and HUB75 RGB panels | `sim/designs/` |
| `skills/tft-clock` | 0.96" 160x80 ST7735S TFT | `sim/designs/` |

`prompts/` holds the design briefs and per-round prompts from `1602display` and `lcd_clock`.

Renders (`out/`) are not stored. Regenerate them from a skill folder, e.g.
`node tools/render.mjs <design> --sheet`.

## Updating

`./sync.sh --push` copies the skills from `~/coding/1602display/.claude/skills` and
`~/coding/lcd_clock/.claude/skills`, commits any changes and pushes.

To use a skill elsewhere, copy its folder into a project's `.claude/skills/`.
