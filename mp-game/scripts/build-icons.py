#!/usr/bin/env python3
"""Build the mini-game UI icon font from the same Iconify JSON used by UnoCSS.

Run: python3 mp-game/scripts/build-icons.py
Outputs:
  mp-game/fonts/games-hub-icons.ttf
  mp-game/js/core/icon-glyphs.js

Only monochrome path icons belong here. Colored game art (mahjong sprite etc.)
stays as image assets; icon fonts cannot preserve multi-color fills.
"""
import json
import re
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path

ROOT = Path(__file__).resolve().parents[2]
OUT_FONT = ROOT / 'mp-game' / 'fonts' / 'games-hub-icons.ttf'
OUT_MAP = ROOT / 'mp-game' / 'js' / 'core' / 'icon-glyphs.js'

# name -> (collection, icon name). Keep this list small: only UI glyphs.
ICONS = {
    'home': ('mdi', 'home'),
    'help': ('mdi', 'help-circle-outline'),
    'add': ('carbon', 'add'),
    'subtract': ('carbon', 'subtract'),
    'undo': ('mdi', 'undo'),
    'redo': ('mdi', 'redo'),
    'backspace': ('mdi', 'backspace-outline'),
    'list-numbered': ('mdi', 'format-list-numbered'),
    'pencil': ('mdi', 'pencil-outline'),
    'close': ('mdi', 'close'),
    'settings': ('mdi', 'cogs'),
    'robot': ('mdi', 'robot-outline'),
    'robot-off': ('mdi', 'robot-off-outline'),
    'timer': ('carbon', 'timer'),
    'incognito': ('mdi', 'incognito'),
    'target': ('mdi', 'target'),
    'layers': ('mdi', 'layers-triple'),
    'idea': ('carbon', 'idea'),
    'calculator': ('mdi', 'calculator'),
    'counter': ('mdi', 'counter'),
    'numeric': ('mdi', 'numeric'),
    'numeric-3': ('mdi', 'numeric-3'),
    'snake': ('mdi', 'snake'),
    'link': ('mdi', 'link'),
    'wall': ('mdi', 'wall'),
    'puzzle': ('mdi', 'puzzle'),
    'mirror': ('mdi', 'mirror-variant'),
    'down': ('mdi', 'format-vertical-align-bottom'),
    'stopwatch': ('mdi', 'timer'),
    'hourglass': ('mdi', 'timer-sand'),
    'mode-emoji': ('mdi', 'emoticon-happy-outline'),
    'mode-poker': ('mdi', 'cards-playing-outline'),
    'mode-mahjong': ('dinkie-icons', 'three-of-circles-mahjong'),
    'dice-5': ('mdi', 'dice-5'),
    'dice-5-off': ('mdi', 'dice-5-outline'),
    'alchemy': ('mdi', 'flask-outline'),
    'quesheng': ('dinkie-icons', 'white-dragon-mahjong'),
    'legend': ('dinkie-icons', 'seven-of-bamboos-mahjong'),
    'gambler': ('dinkie-icons', 'eight-of-bamboos-mahjong'),
    'cowboy': ('mdi', 'account-cowboy-hat'),
    'arrow-right': ('mdi', 'arrow-right-bold'),
    'arrow-right-outline': ('mdi', 'arrow-right-bold-outline'),
    'bolt': ('mdi', 'lightning-bolt'),
    'trophy': ('mdi', 'trophy-outline'),
    'calendar': ('mdi', 'calendar-month-outline'),
    'infinity': ('mdi', 'infinity'),
    'share': ('mdi', 'share-variant-outline'),
    'check-all': ('mdi', 'check-all'),
    'bulb': ('mdi', 'lightbulb-on-50'),
    'crush': ('mdi', 'star-four-points'),
    'sudoku': ('mdi', 'grid'),
    'sort': ('mdi', 'test-tube'),
    'slide': ('mdi', 'arrow-all'),
    'volume': ('mdi', 'volume-high'),
    'volume-off': ('mdi', 'volume-off'),
    'monitor': ('mdi', 'monitor'),
    'sun': ('mdi', 'white-balance-sunny'),
    'moon': ('mdi', 'moon-waning-crescent'),
}

FAMILY = 'Games Hub Icons'
ASCENT = 800
DESCENT = -200
EM = 1000
GLYPH_SCALE = 900


def icon_sets():
    base = ROOT / 'node_modules' / '@iconify-json'
    out = {}
    for name in ('carbon', 'mdi', 'dinkie-icons'):
        with open(base / name / 'icons.json', encoding='utf-8') as f:
            out[name] = json.load(f)
    return out


def path_data(body):
    # Iconify bodies are SVG fragments. All icons in ICONS are path-only;
    # fail loudly if a future icon needs circle/rect conversion.
    if re.search(r'<(circle|rect|ellipse|line|polygon|polyline)\b', body):
        raise SystemExit('icon contains non-path shape; pick a path-only icon')
    paths = re.findall(r'<path\b[^>]*\bd="([^"]+)"', body)
    if not paths:
        raise SystemExit('icon has no path data')
    return ' '.join(paths)


def build():
    sets = icon_sets()
    fb = FontBuilder(EM, isTTF=True)
    glyph_order = ['.notdef']
    glyphs = {'.notdef': TTGlyphPen(None).glyph()}
    metrics = {'.notdef': (EM, 0)}
    cmap = {}
    mapping = {}
    code = 0xE001

    for name, (collection, icon_name) in ICONS.items():
        data = sets[collection]['icons'].get(icon_name)
        if not data:
            raise SystemExit(f'missing icon: {collection}:{icon_name}')
        size = data.get('width', sets[collection].get('width', 24))
        if data.get('height', size) != size:
            raise SystemExit(f'non-square icon not supported: {collection}:{icon_name}')
        d = path_data(data['body'])
        pen = TTGlyphPen(None)
        qpen = Cu2QuPen(pen, 1.0)
        scale = GLYPH_SCALE / size
        # SVG y-down -> font y-up; center horizontally, baseline at ASCENT.
        transform = (scale, 0, 0, -scale, EM / 2 - (size * scale) / 2, ASCENT)
        parse_path(d, TransformPen(qpen, transform))
        glyph = pen.glyph()
        glyph_order.append(name)
        glyphs[name] = glyph
        metrics[name] = (EM, 0)
        cmap[code] = name
        mapping[name] = code
        code += 1

    fb.setupGlyphOrder(glyph_order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT)
    fb.setupNameTable({
        'familyName': FAMILY,
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'GamesHubIcons-Regular',
        'fullName': FAMILY,
        'psName': 'GamesHubIcons-Regular',
        'version': 'Version 1.0',
    })
    fb.setupOS2(
        sTypoAscender=ASCENT,
        sTypoDescender=DESCENT,
        usWinAscent=ASCENT,
        usWinDescent=-DESCENT,
    )
    fb.setupPost()
    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    fb.save(OUT_FONT)

    js = ["// Generated by mp-game/scripts/build-icons.py — do not edit by hand.",
          "// Source: @iconify-json/{carbon,mdi,dinkie-icons} (same data UnoCSS uses).",
          "module.exports = {"]
    for name, cp in mapping.items():
        js.append(f"  '{name}': 0x{cp:04X},")
    js.append("};")
    OUT_MAP.write_text('\n'.join(js) + '\n', encoding='utf-8')
    print(f'wrote {OUT_FONT.relative_to(ROOT)} ({len(mapping)} glyphs)')
    print(f'wrote {OUT_MAP.relative_to(ROOT)}')


if __name__ == '__main__':
    build()
