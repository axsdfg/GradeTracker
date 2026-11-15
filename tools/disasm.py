import struct, sys
sys.path.insert(0, r'C:/Users/Administrator/WorkBuddy/2026-10-25-13-58-04/tools')
from dexinfo import Dex

SIZE = {}
def setr(a, b, s):
    for o in range(a, b+1): SIZE[o] = s
setr(0x00,0x00,1); setr(0x01,0x01,1); setr(0x02,0x02,2); setr(0x03,0x03,3)
setr(0x04,0x04,1); setr(0x05,0x05,2); setr(0x06,0x06,3)
setr(0x07,0x07,1); setr(0x08,0x08,2); setr(0x09,0x09,3)
setr(0x0a,0x11,1); setr(0x12,0x12,1); setr(0x13,0x13,2); setr(0x14,0x14,3)
setr(0x15,0x15,2); setr(0x16,0x16,2); setr(0x17,0x17,3); setr(0x18,0x18,5)
setr(0x19,0x19,2); setr(0x1a,0x1a,2); setr(0x1b,0x1b,3); setr(0x1c,0x1c,2)
setr(0x1d,0x1e,1); setr(0x1f,0x1f,2); setr(0x20,0x20,2); setr(0x21,0x21,1)
setr(0x22,0x22,2); setr(0x23,0x23,2); setr(0x24,0x24,3); setr(0x25,0x25,3)
setr(0x26,0x26,3); setr(0x27,0x27,1); setr(0x28,0x28,1); setr(0x29,0x29,2)
setr(0x2a,0x2a,3); setr(0x2b,0x2c,3); setr(0x2d,0x3d,2)
setr(0x3e,0x43,1)   # unused
setr(0x44,0x51,2); setr(0x52,0x6d,2); setr(0x6e,0x72,3)
setr(0x73,0x73,1); setr(0x74,0x78,3); setr(0x79,0x7a,1)
setr(0x7b,0x8f,1); setr(0x90,0xaf,2); setr(0xb0,0xcf,1)
setr(0xd0,0xd7,2); setr(0xd8,0xe2,2); setr(0xe3,0xf9,1)
setr(0xfa,0xfa,4); setr(0xfb,0xfb,4); setr(0xfc,0xfc,3); setr(0xfd,0xfd,3)
setr(0xfe,0xfe,2); setr(0xff,0xff,2)

NAMES = {0x0e:'return-void',0x1a:'const-string',0x1b:'const-string/jumbo',0x1c:'const-class',
         0x22:'new-instance',0x6e:'invoke-virtual',0x6f:'invoke-super',0x70:'invoke-direct',
         0x71:'invoke-static',0x72:'invoke-interface',0x74:'invoke-virtual/range',
         0x12:'const/4',0x13:'const/16',0x14:'const',0x15:'const/high16',0x0f:'return',
         0x11:'return-object',0x1f:'check-cast',0x28:'goto',0x38:'if-eqz',0x39:'if-nez',
         0x3a:'if-ltz',0x3b:'if-gez',0x3c:'if-gtz',0x3d:'if-lez',0x27:'throw',0x21:'array-length'}

def dump(path, only_prefix='gradetracker'):
    dx = Dex(path)
    d = dx.d
    for class_idx, access, src_idx, cdo in dx.classes():
        cname = dx.type_name(class_idx)
        if only_prefix not in cname: continue
        print('\n' + '#'*70)
        print('CLASS', cname, ' sourceFile=', dx.string(src_idx) if src_idx != 0xffffffff else '?')
        for kind, midx, acc, code_off in dx.methods_of(cdo):
            cls, mname, pidx = dx.method(pidx) if False else dx.method(midx)
            ret, params = dx.proto(pidx)
            print('\n== %s %s(%s)' % (mname, '', ', '.join(params)))
            if not code_off: 
                print('   (no code / abstract)'); continue
            regs, ins, outs, tries, dbg, insns_size = struct.unpack_from('<4H2I', d, code_off)
            print('   registers=%d ins=%d insns=%d' % (regs, ins, insns_size))
            p = code_off + 16
            pc = 0
            while pc < insns_size:
                u = struct.unpack_from('<H', d, p + 2*pc)[0]
                op = u & 0xff
                sz = SIZE.get(op, 1)
                name = NAMES.get(op, 'op_%02x' % op)
                extra = ''
                if op in (0x1a, 0x1b):
                    idx = struct.unpack_from('<H', d, p + 2*pc + 2)[0]
                    if op == 0x1b:
                        idx = struct.unpack_from('<I', d, p + 2*pc + 2)[0]
                    extra = '"%s"' % dx.string(idx)
                elif op in (0x6e,0x6f,0x70,0x71,0x72,0x74,0x75,0x76,0x77,0x78):
                    idx = struct.unpack_from('<H', d, p + 2*pc + 2)[0]
                    c, mn, pi = dx.method(idx)
                    r, ps = dx.proto(pi)
                    extra = '%s->%s(%s)%s' % (c, mn, ','.join(ps), r)
                elif op in (0x1c,0x22,0x1f):
                    idx = struct.unpack_from('<H', d, p + 2*pc + 2)[0]
                    try: extra = dx.type_name(idx)
                    except Exception: extra = '?'
                elif op == 0x12:
                    b1 = u >> 8
                    v = b1 >> 4
                    if v > 7: v -= 16
                    extra = 'v%d, #%d' % (b1 & 0xf, v)
                elif op == 0x13:
                    extra = '#%d' % struct.unpack_from('<h', d, p+2*pc+2)[0]
                elif op == 0x14:
                    extra = '#%d' % struct.unpack_from('<i', d, p+2*pc+2)[0]
                print('   %04x: %-18s %s' % (pc, name, extra))
                pc += sz

dump(sys.argv[1])
