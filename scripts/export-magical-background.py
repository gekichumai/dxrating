"""Export the editable MAGiCAL kingdom composition as one reusable SVG asset.

Run with python3 scripts/export-magical-background.py after editing kingdom.svg.
Standalone ornaments retain local coordinates; responsive CSS anchors them.
"""
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
source = ET.parse(ROOT / 'docs/assets/magical/kingdom.svg').getroot()
output = deepcopy(source)
for element in output:
    if element.get('id') in {'sky-orbit', 'water-orbit', 'wand', 'palace'}:
        element.attrib.pop('transform', None)
ET.indent(output, space='  ')
destination = ROOT / 'apps/web/src/assets/magical-background.svg'
destination.write_text(ET.tostring(output, encoding='unicode') + '\n')
print(f'Exported {destination.relative_to(ROOT)} ({destination.stat().st_size:,} bytes)')
