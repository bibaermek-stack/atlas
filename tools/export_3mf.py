#!/usr/bin/env python3
"""Extract every unique mesh of the ATLAS 3MF into one compact binary + JSON index.

Usage: python3 -I tools/export_3mf.py ATLAS.3mf site/models

Every mesh in the file is stored centred on the origin (the print-plate layout
lives in the component/build transforms only), so we keep the raw mesh and let
the web viewer place it.  Coordinates are remapped so that the beam axis
(mesh X) becomes scene Z and mesh Z becomes scene Y (up):
    scene = (mesh_y, mesh_z, mesh_x)
Units: 1 unit = 1 mm of the 1:100 model = 0.1 m of the real detector.
"""
import sys, os, json, hashlib, zipfile, struct
import xml.etree.ElementTree as ET
import numpy as np

NS = {'m': 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02',
      'p': 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06'}


def load_mesh_file(zf, path):
    root = ET.fromstring(zf.read(path.lstrip('/')))
    out = {}
    for o in root.find('m:resources', NS):
        me = o.find('m:mesh', NS)
        v = np.array([[float(x.get('x')), float(x.get('y')), float(x.get('z'))] for x in me.find('m:vertices', NS)])
        t = np.array([[int(x.get('v1')), int(x.get('v2')), int(x.get('v3'))] for x in me.find('m:triangles', NS)], dtype=np.uint32)
        out[int(o.get('id'))] = (v, t)
    return out


def main(src, outdir):
    zf = zipfile.ZipFile(src)
    root = ET.fromstring(zf.read('3D/3dmodel.model'))
    cfg = ET.fromstring(zf.read('Metadata/model_settings.config'))
    names, ext = {}, {}
    for o in cfg.findall('object'):
        oid = int(o.get('id'))
        for m in o.findall('metadata'):
            if m.get('key') == 'name': names[oid] = m.get('value')
            if m.get('key') == 'extruder': ext[oid] = int(m.get('value'))
    cache, uniq = {}, {}
    for o in root.find('m:resources', NS):
        oid = int(o.get('id'))
        for c in o.iter('{%s}component' % NS['m']):
            path = c.get('{%s}path' % NS['p'])
            cid = int(c.get('objectid'))
            if path not in cache: cache[path] = load_mesh_file(zf, path)
            v, t = cache[path][cid]
            h = hashlib.md5(np.round(v, 3).tobytes() + t.tobytes()).hexdigest()[:8]
            e = uniq.setdefault(h, {'v': v, 't': t, 'src': names.get(oid, '?'), 'ext': ext.get(oid), 'count': 0})
            e['count'] += 1
    index, blobs, off = [], [], 0
    for h, e in sorted(uniq.items()):
        v = e['v']; t = e['t']
        vs = np.stack([v[:, 1], v[:, 2], v[:, 0]], 1).astype('<f4')   # remap axes
        t = t.astype('<u4')   # cyclic axis permutation keeps handedness, so winding is unchanged
        vb, tb = vs.tobytes(), t.astype('<u4').tobytes()
        index.append({'id': h, 'src': e['src'], 'extruder': e['ext'], 'count': e['count'],
                      'nv': len(vs), 'nt': len(t), 'voff': off, 'toff': off + len(vb),
                      'min': vs.min(0).round(3).tolist(), 'max': vs.max(0).round(3).tolist()})
        blobs += [vb, tb]; off += len(vb) + len(tb)
    os.makedirs(outdir, exist_ok=True)
    with open(os.path.join(outdir, 'parts.bin'), 'wb') as f:
        for b in blobs: f.write(b)
    with open(os.path.join(outdir, 'parts.json'), 'w') as f:
        json.dump(index, f, separators=(',', ':'))
    print(len(index), 'unique meshes,', off / 1e6, 'MB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
