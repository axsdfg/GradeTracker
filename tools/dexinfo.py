import struct, sys, io

class Dex:
    def __init__(self, path):
        self.d = open(path, 'rb').read()
        d = self.d
        assert d[:4] == b'dex\n'
        self.version = d[4:8].decode()
        (self.string_ids_size, self.string_ids_off,
         self.type_ids_size, self.type_ids_off,
         self.proto_ids_size, self.proto_ids_off,
         self.field_ids_size, self.field_ids_off,
         self.method_ids_size, self.method_ids_off,
         self.class_defs_size, self.class_defs_off) = struct.unpack_from('<12I', d, 56)

    def uleb(self, off):
        r = 0; s = 0
        while True:
            b = self.d[off]; off += 1
            r |= (b & 0x7f) << s
            if not (b & 0x80): break
            s += 7
        return r, off

    def string(self, idx):
        off = struct.unpack_from('<I', self.d, self.string_ids_off + 4*idx)[0]
        n, off = self.uleb(off)
        end = self.d.index(b'\x00', off)
        return self.d[off:end].decode('utf-8', 'replace')

    def type_name(self, idx):
        sidx = struct.unpack_from('<I', self.d, self.type_ids_off + 4*idx)[0]
        return self.string(sidx)

    def method(self, idx):
        class_idx, proto_idx, name_idx = struct.unpack_from('<HHI', self.d, self.method_ids_off + 8*idx)
        return self.type_name(class_idx), self.string(name_idx), proto_idx

    def proto(self, idx):
        shorty, ret_idx, params_off = struct.unpack_from('<III', self.d, self.proto_ids_off + 12*idx)
        params = []
        if params_off:
            n = struct.unpack_from('<I', self.d, params_off)[0]
            for i in range(n):
                params.append(self.type_name(struct.unpack_from('<H', self.d, params_off+4+2*i)[0]))
        return self.type_name(ret_idx), params

    def classes(self):
        out = []
        for i in range(self.class_defs_size):
            (class_idx, access, super_idx, ifaces, src_idx, ann, class_data_off,
             static_vals) = struct.unpack_from('<8I', self.d, self.class_defs_off + 32*i)
            out.append((class_idx, access, src_idx, class_data_off))
        return out

    def methods_of(self, class_data_off):
        if not class_data_off: return []
        off = class_data_off
        sf, off = self.uleb(off); inf, off = self.uleb(off)
        dm, off = self.uleb(off); vm, off = self.uleb(off)
        res = []
        for _ in range(sf + inf):
            _, off = self.uleb(off); _, off = self.uleb(off)
        for kind, cnt in (('direct', dm), ('virtual', vm)):
            idx = 0
            for _ in range(cnt):
                diff, off = self.uleb(off)
                acc, off = self.uleb(off)
                code_off, off = self.uleb(off)
                idx += diff
                res.append((kind, idx, acc, code_off))
        return res

for path in sys.argv[1:]:
    dx = Dex(path)
    print('=' * 70)
    print(path, 'dex', dx.version, 'strings=%d types=%d methods=%d classes=%d' %
          (dx.string_ids_size, dx.type_ids_size, dx.method_ids_size, dx.class_defs_size))
    for class_idx, access, src_idx, cdo in dx.classes():
        cname = dx.type_name(class_idx)
        if 'gradetracker' not in cname:
            continue
        src = dx.string(src_idx) if src_idx != 0xffffffff else '?'
        print('\n-- class %s  (source: %s, methods):' % (cname, src))
        for kind, midx, acc, code_off in dx.methods_of(cdo):
            cls, name, pidx = dx.method(midx)
            ret, params = dx.proto(pidx)
            print('   [%s] %s %s(%s)  code_off=%#x' % (kind, ret, name, ', '.join(params), code_off))
