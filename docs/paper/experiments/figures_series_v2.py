"""Fig. 3 of the final paper: one real field's Sentinel-2 NDVI series with the app's gate and the independent reference mask.

Same data and logic as the series part of figures_examples.py, with two layout fixes:
proper typographic quotes in the title (the old one printed `` and ''), and legends placed in empty headroom
above the data instead of on top of the lines.

Usage: .venv/Scripts/python.exe -W ignore docs/paper/experiments/figures_series_v2.py <outdir> [FarmID]
Needs .local/datasets/labelled/telangana-mask-validation/images.csv (git-ignored research data).
"""
import csv, os, sys
from collections import defaultdict
from datetime import date
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
out = sys.argv[1]
FID = sys.argv[2] if len(sys.argv) > 2 else '1327654'
IMG = ROOT / '.local/datasets/labelled/telangana-mask-validation/images.csv'
plt.rcParams.update({'font.family': 'serif', 'font.size': 8, 'axes.labelsize': 8, 'legend.fontsize': 6.6, 'xtick.labelsize': 7,
                     'ytick.labelsize': 7, 'axes.spines.top': False, 'axes.spines.right': False, 'pdf.fonttype': 42})

rows = [r for r in csv.DictReader(open(IMG, encoding='utf-8'))
        if r['FarmID'] == FID and r['f_scl'] != '' and r['f_cs'] != '' and r['cs_mean'] != '']
cnt = defaultdict(int)
for r in rows:
    if float(r['f_scl']) >= .7 and r['ndvi_scl'] != '':
        cnt[r['tile']] += 1
tile = max(cnt, key=cnt.get)
rows = sorted([r for r in rows if r['tile'] == tile], key=lambda r: r['date'])
meta = {k: rows[0][k] for k in ('area_ha', 'crop', 'label')}
d = [date.fromisoformat(r['date']) for r in rows]
x = np.array([(a - d[0]).days for a in d])
fscl = np.array([float(r['f_scl']) for r in rows])
fcs = np.array([float(r['f_cs']) for r in rows])
csm = np.array([float(r['cs_mean']) for r in rows])
nd = np.array([float(r['ndvi_scl']) if r['ndvi_scl'] != '' else np.nan for r in rows])
acc = (fscl >= .7) & ~np.isnan(nd)
strong = acc & (csm < .30)
ai = np.where(acc)[0]

fig, axs = plt.subplots(2, 1, figsize=(3.45, 3.3), sharex=True, gridspec_kw={'height_ratios': [2.4, 1.15]})
ax = axs[0]
ax.scatter(x[~acc & ~np.isnan(nd)], nd[~acc & ~np.isnan(nd)], s=10, facecolors='none', edgecolors='#9a9a9a', lw=.7,
           label='Rejected by gate (clear share < 70%)')
ax.plot(x[acc], nd[acc], '-', color='#2e8b57', lw=.9, alpha=.8)
ax.scatter(x[acc], nd[acc], s=10, color='#2e8b57', zorder=3, label='Accepted (clear share $\\geq$ 70%)')
ax.scatter(x[strong], nd[strong], s=44, marker='o', facecolors='none', edgecolors='#1f5fa8', lw=1.3, zorder=4,
           label='Accepted, but Cloud Score+ mean < 0.3')
first = True
for a, b in zip(ai, ai[1:]):
    if 0 < x[b] - x[a] <= 30 and nd[b] - nd[a] <= -.10:
        ax.plot([x[a], x[b]], [nd[a], nd[b]], '-', color='#b5452b', lw=2.0, zorder=2,
                label='Decline rule fires ($\\Delta\\leq-0.10$)' if first else None)
        first = False
ax.set_ylabel('Field-mean NDVI')
ax.set_ylim(-0.08, 1.38)
ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8])
ax.legend(frameon=False, loc='upper left', bbox_to_anchor=(0.0, 1.02), fontsize=5.9, labelspacing=0.35)
ax.set_title('(a) Real field: %s, %.2f ha, survey label “%s”' % (meta['crop'], float(meta['area_ha']), meta['label']),
             fontsize=7, loc='left')

ax = axs[1]
ax.plot(x, 100 * fscl, '-', color='#2e8b57', lw=.9, label="Clear share, app's SCL mask")
ax.plot(x, 100 * fcs, '-', color='#1f5fa8', lw=.9, label='Clear share, Cloud Score+ ($\\geq$ 0.6)')
ax.axhline(70, ls='--', lw=.8, color='grey')
ax.text(133, 63, '70% gate', fontsize=6.0, color='#555555', ha='center', va='top',
        bbox=dict(fc='white', ec='none', pad=0.6, alpha=0.85))
ax.set_ylabel('Clear (%)')
ax.set_xlabel('Days since %s' % d[0].isoformat())
ax.set_ylim(-5, 190)
ax.set_yticks([0, 50, 100])
ax.legend(frameon=False, loc='upper left', fontsize=5.9, ncol=1, bbox_to_anchor=(0.0, 1.04), labelspacing=0.35)
fig.tight_layout()
fig.savefig(os.path.join(out, 'fig_example_series_v2.pdf'))
fig.savefig(os.path.join(out, 'fig_example_series_v2.png'), dpi=300)
print('series figure:', FID, tile, len(rows), 'images,', int(acc.sum()), 'accepted,', int(strong.sum()), 'strongly unclear accepted')
