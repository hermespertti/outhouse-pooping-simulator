#!/usr/bin/env python3
"""1200x630 OG image for outhouse-pooping-simulator (warm dusk game scene)."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np

W, H = 1200, 630
FONTB = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT  = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

hero = Image.open('/tmp/outhouse_hero.png').convert('RGB')
hw, hh = hero.size
# central gameplay window: outhouse + splat + a bit of HUD, skip far edges
cx, cy = int(hw * 0.46), int(hh * 0.46)
cw, ch = int(hw * 0.62), int(hh * 0.92)
crop = hero.crop((cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2))

# deep dusk-purple bg matching the game
bg = Image.new('RGB', (W, H), (24, 18, 38))
d = ImageDraw.Draw(bg)
# warm magenta glow behind the object (bottom-right)
glow = Image.new('RGB', (W, H), (24, 18, 38))
gd = ImageDraw.Draw(glow)
for r, c in ((560, (60, 26, 58)), (430, (86, 34, 84)), (300, (120, 40, 110))):
    gd.ellipse((770 - r, 320 - r, 770 + r, 320 + r), fill=c)
glow = glow.filter(ImageFilter.GaussianBlur(70))
bg = Image.blend(bg, glow, 0.9)

# place the game frame as a soft vignette-edged panel on the right
tw = 600
th = int(tw * ch / cw)
crop = crop.resize((tw, th), Image.LANCZOS)
# darken its own edges into the bg
mask = Image.new('L', (tw, th), 255)
md = ImageDraw.Draw(mask)
md.rectangle((0, 0, tw, th), fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(28))
bg.paste(crop, (W - tw - 70, 320 - th // 2 - 20), mask)

d = ImageDraw.Draw(bg)

def font(sz, bold=True):
    return ImageFont.truetype(FONTB if bold else FONT, sz)

# gradient title (sunset pink -> gold)
title = 'OUTHOUSE'
tf = font(104)
tb = d.textbbox((0, 0), title, font=tf)
tl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
td = ImageDraw.Draw(tl)
td.text((78, 140), title, font=tf, fill=(255, 255, 255, 255))
xs = np.linspace(0, 1, W)
r_row = (255 * (1 - xs) + 255 * xs).astype(np.uint8)
g_row = (110 * (1 - xs) + 210 * xs).astype(np.uint8)
b_row = (190 * (1 - xs) + 90 * xs).astype(np.uint8)
arr = np.zeros((H, W, 3), dtype=np.uint8)
arr[:, :, 0] = r_row; arr[:, :, 1] = g_row; arr[:, :, 2] = b_row
tarr = np.array(tl); alpha = tarr[:, :, 3].astype(bool)
tarr[:, :, :3] = np.where(alpha[:, :, None], arr, tarr[:, :, :3])
tarr[:, :, 3] = alpha.astype(np.uint8) * 255
bg = Image.alpha_composite(bg.convert('RGBA'), Image.fromarray(tarr, 'RGBA'))
d = ImageDraw.Draw(bg)

d.text((82, 270), 'POOPING SIMULATOR', font=font(46), fill=(255, 214, 140))
d.text((82, 345), 'Strain, aim, and drop the perfect splat', font=font(30, bold=False), fill=(232, 226, 240))
d.text((82, 392), 'into the bucket.', font=font(30, bold=False), fill=(232, 226, 240))
d.text((82, 460), 'Comedy physics \u00b7 throne & bucket unlocks \u00b7 combo scoring', font=font(26, bold=False), fill=(210, 200, 224))
d.text((82, 545), 'hermespertti.github.io/outhouse-pooping-simulator', font=font(26, bold=False), fill=(180, 160, 200))

# top accent bar (sunset)
for i in range(8):
    t = i / 8
    r = int(255); g = int(110 + 100 * t); b = int(190 - 100 * t)
    d.rectangle((82 + i * 40, 92, 82 + i * 40 + 36, 98), fill=(r, g, b))

bg.convert('RGB').save('/home/lex/.hermes/outhouse-pooping-simulator/public/og-image.png', optimize=True)
print('OK outhouse og-image.png')
