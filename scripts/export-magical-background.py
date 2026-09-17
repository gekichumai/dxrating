"""Export the editable MAGiCAL composition as reusable SVG groups.

Run with python3 scripts/export-magical-background.py after editing the source.
Standalone ornaments keep their local coordinates; the React scene anchors them.
"""
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
source = ET.parse(ROOT / 'docs/assets/magical/background.svg').getroot()
groups = {element.get('id'): element for element in source if element.get('id')}
output = ET.Element(f'{{{SVG}}}svg', {'viewBox': '0 0 2000 2400'})
defs = ET.SubElement(output, f'{{{SVG}}}defs')
for section in source.findall(f'{{{SVG}}}defs'):
    for element in section:
        if element.get('id') != 'character-art-crop':
            defs.append(deepcopy(element))


def layer(name, *ids, local=False):
    group = ET.SubElement(output, f'{{{SVG}}}g', {'id': name})
    for source_id in ids:
        element = deepcopy(groups[source_id])
        element.attrib.pop('id')
        if local:
            element.attrib.pop('transform', None)
        group.append(element)


layer('paper', 'mint-paper', 'allover-diamond-grid')
layer('pattern', 'allover-star-and-wand-pattern', 'magical-sparkles')
layer('atmosphere', 'floating-garden-islands', 'kingdom-cloud-banks')
layer('ribbons', 'edge-ribbons', 'sweeping-musical-trails')
layer('edge-magic', 'star-constellations', 'floating-melodies', 'clockwork-corners', 'floating-spell-pages')
layer('emblems', 'central-magical-emblems')
layer('clock', 'clock-dial', local=True)
layer('lower-clock', 'lower-clock', local=True)
layer('wand', 'magic-wand', local=True)
layer('lagoon', 'turquoise-lagoon', 'water-sparkles')
layer('palace', 'blue-and-gold-palace', local=True)
layer('corners', 'arcade-corner-bands')

ET.indent(output, space='  ')
destination = ROOT / 'apps/web/src/assets/magical-background.svg'
destination.write_text(ET.tostring(output, encoding='unicode') + '\n')
print(f'Exported {destination.relative_to(ROOT)} ({destination.stat().st_size:,} bytes)')
