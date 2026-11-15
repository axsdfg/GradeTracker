import struct, sys, json

data = open(sys.argv[1], 'rb').read()
pos = 8  # skip file header (type 0x0003, size, ...)

strings = []
resmap = []

def u16(b, o): return struct.unpack_from('<H', b, o)[0]
def u32(b, o): return struct.unpack_from('<I', b, o)[0]

chunks = []
while pos < len(data):
    ctype = u16(data, pos)
    hsize = u16(data, pos+2)
    csize = u32(data, pos+4)
    if csize <= 0 or pos + csize > len(data):
        break
    chunks.append((ctype, hsize, csize, pos))
    pos += csize

for ctype, hsize, csize, off in chunks:
    if ctype == 0x0001:  # string pool
        scount = u32(data, off+8)
        flags = u32(data, off+16)
        sstart = u32(data, off+20)
        utf8 = flags & (1 << 8)
        offsets = [u32(data, off+hsize+i*4) for i in range(scount)]
        base = off + sstart
        for o in offsets:
            p = base + o
            if utf8:
                # utf16len varint
                n = data[p]; p += 1
                if n & 0x80: p += 1
                l = data[p]; p += 1
                if l & 0x80:
                    l = ((l & 0x7f) << 8) | data[p]; p += 1
                strings.append(data[p:p+l].decode('utf-8', 'replace'))
            else:
                l = u16(data, p); p += 2
                if l & 0x8000:
                    l = ((l & 0x7fff) << 16) | u16(data, p); p += 2
                strings.append(data[p:p+l*2].decode('utf-16-le', 'replace'))
    elif ctype == 0x0180:  # resource map
        n = (csize - hsize) // 4
        resmap = [u32(data, off+hsize+i*4) for i in range(n)]

TYPES = {0x00:'NULL',0x01:'REF',0x02:'ATTR',0x03:'STRING',0x04:'FLOAT',0x05:'DIM',0x06:'FRAC',
         0x07:'DYNAMIC_REF',0x10:'INT_DEC',0x11:'INT_HEX',0x12:'INT_BOOL',
         0x1c:'COLOR_ARGB8',0x1d:'COLOR_RGB8',0x1e:'COLOR_ARGB4',0x1f:'COLOR_RGB4'}

def fmt_attr(ns_idx, name_idx, raw_idx, dtype, ddata, size):
    name = strings[name_idx] if name_idx < len(strings) else '?'
    ns = strings[ns_idx] if ns_idx != 0xFFFFFFFF and ns_idx < len(strings) else ''
    if raw_idx != 0xFFFFFFFF:
        val = strings[raw_idx]
        return name, val, 'raw'
    t = TYPES.get(dtype, hex(dtype))
    if t == 'STRING' and ddata < len(strings):
        return name, strings[ddata], t
    if t == 'REF':
        return name, '@0x%08x' % ddata, t
    if dtype in (0x12, 0x1c):
        return name, '#%08x' % ddata, t
    if t == 'INT_BOOL':
        return name, str(bool(ddata)).lower(), t
    if t.startswith('INT') or t == 'DIM' or t == 'FRAC' or t == 'FLOAT':
        return name, str(ddata), t
    return name, str(ddata), t

out = []
indent = 0
for ctype, hsize, csize, off in chunks:
    if ctype == 0x0102:  # start element
        ns_idx = u32(data, off+16)
        name_idx = u32(data, off+20)
        astart = u16(data, off+24)
        asize = u16(data, off+26)
        acount = u16(data, off+28)
        name = strings[name_idx]
        attrs = []
        for i in range(acount):
            aoff = off + 16 + astart + i*asize
            a_ns = u32(data, aoff)
            a_name = u32(data, aoff+4)
            a_raw = u32(data, aoff+8)
            a_type = data[aoff+15]
            a_data = u32(data, aoff+16)
            rid = ''
            if a_name < len(resmap):
                rid = '0x%08x' % resmap[a_name]
            an, av, at = fmt_attr(a_ns, a_name, a_raw, a_type, a_data, asize)
            attrs.append((an, av, at, rid))
        out.append('  '*indent + '<' + name)
        for an, av, at, rid in attrs:
            out.append('  '*(indent+1) + '%s="%s"  [%s %s]' % (an, av.replace('\n','\\n'), at, rid))
        out.append('  '*indent + '>')
        indent += 1
    elif ctype == 0x0103:  # end element
        indent = max(0, indent-1)
        name_idx = u32(data, off+20)
        out.append('  '*indent + '</' + strings[name_idx] + '>')

print('\n'.join(out))
print('\n=== STRING POOL (%d) ===' % len(strings))
print('\n'.join(strings))
