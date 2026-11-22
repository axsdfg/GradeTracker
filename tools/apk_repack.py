# -*- coding: utf-8 -*-
"""
APK 外科手术式重打包
  1) 用新版本替换 assets/index.html
  2) 字节级补丁 AndroidManifest.xml（debuggable/allowBackup/usesCleartextTraffic=false，
     versionCode 递增，versionName 等长替换）
  3) 对 method=0（stored）条目重新做 4 字节对齐（zipalign 等价），其余条目字节级原样保留

用法: python apk_repack.py <src.apk> <new_index.html> <out.apk>
        [--no-net]                 不加 INTERNET 权限
        [--version-code N]         versionCode，缺省为当前值 +1
        [--version-name X.Y]       versionName，必须与原值等长（如 2.1 -> 2.2）
"""
import struct, sys, zlib, zipfile

LFH_SIG = b'PK\x03\x04'
CD_SIG = b'PK\x01\x02'
EOCD_SIG = b'PK\x05\x06'


# ============ 二进制 XML ============
class Axml:
    def __init__(self, data: bytes):
        self.d = bytearray(data)
        if struct.unpack_from('<H', self.d, 0)[0] != 0x0003:
            raise ValueError('not a binary XML')
        self.strings, self.str_offs = [], []
        self.elems = []
        pos = 8
        while pos + 8 <= len(self.d):
            ctype, hsize, csize = struct.unpack_from('<HHI', self.d, pos)
            if csize <= 0:
                break
            if ctype == 0x0001:
                self._pool(pos, hsize)
            elif ctype == 0x0102:
                self._elem(pos)
            pos += csize

    def _pool(self, pos, hsize):
        count, _, flags, s_start = struct.unpack_from('<IIII', self.d, pos + 8)
        self.utf8 = bool(flags & 0x100)
        base = pos + s_start
        for i in range(count):
            o = struct.unpack_from('<I', self.d, pos + hsize + 4 * i)[0]
            p = base + o
            if self.utf8:
                n = self.d[p]; p += 1
                if n & 0x80:
                    n = ((n & 0x7f) << 8) | self.d[p]; p += 1
                n2 = self.d[p]; p += 1
                if n2 & 0x80:
                    p += 1
                self.str_offs.append(p)
                self.strings.append(bytes(self.d[p:p + n]).decode('utf-8', 'replace'))
            else:
                n = struct.unpack_from('<H', self.d, p)[0]; p += 2
                if n & 0x8000:
                    n = ((n & 0x7fff) << 16) | struct.unpack_from('<H', self.d, p)[0]; p += 2
                self.str_offs.append(p)
                self.strings.append(bytes(self.d[p:p + n * 2]).decode('utf-16-le', 'replace'))

    def _elem(self, pos):
        line, comment, ns, name = struct.unpack_from('<IIII', self.d, pos + 8)
        astart, asize, acount = struct.unpack_from('<HHH', self.d, pos + 24)
        apos = pos + 16 + astart
        attrs = []
        for i in range(acount):
            p = apos + i * asize
            ans, aname, raw, tsz, res0, dtype, data = struct.unpack_from('<IIiHBBI', self.d, p)
            attrs.append({'name': self.strings[aname] if aname < len(self.strings) else '',
                          'dtype': dtype, 'data': data, 'off': p})
        self.elems.append({'tag': self.strings[name] if name < len(self.strings) else '',
                           'pos': pos, 'attrs': attrs})

    def _find(self, tag, attr):
        for e in self.elems:
            if e['tag'] == tag:
                for a in e['attrs']:
                    if a['name'] == attr:
                        return a
        return None

    def set_bool(self, tag, attr, value):
        a = self._find(tag, attr)
        if not a:
            return False
        if a['dtype'] != 0x12:
            raise ValueError('%s 不是 bool (0x%02x)' % (attr, a['dtype']))
        struct.pack_into('<I', self.d, a['off'] + 16, 1 if value else 0)
        return True

    def set_int(self, tag, attr, value):
        a = self._find(tag, attr)
        if not a:
            return False
        struct.pack_into('<I', self.d, a['off'] + 16, value)
        return True

    def replace_string(self, old, new):
        enc = 'utf-8' if self.utf8 else 'utf-16-le'
        ob, nb = old.encode(enc), new.encode(enc)
        if len(ob) != len(nb):
            raise ValueError('字符串长度不同，放弃原位替换')
        n = 0
        for i, s in enumerate(self.strings):
            if s == old:
                p = self.str_offs[i]
                if bytes(self.d[p:p + len(ob)]) != ob:
                    continue
                self.d[p:p + len(ob)] = nb
                n += 1
        return n


# ============ ZIP ============
def parse_apk(blob):
    eocd = blob.rfind(EOCD_SIG)
    total, cd_size, cd_off = struct.unpack_from('<HII', blob, eocd + 10)
    comment = blob[eocd + 22:eocd + 22 + struct.unpack_from('<H', blob, eocd + 20)[0]]
    entries, p = [], cd_off
    for _ in range(total):
        if blob[p:p + 4] != CD_SIG:
            raise ValueError('bad CD at %d' % p)
        (vmade, vneed, flag, method, mtime, mdate, crc, csize, usize,
         nlen, elen, clen, disk, iattr, eattr, loff) = struct.unpack_from('<HHHHHHIIIHHHHHII', blob, p + 4)
        name = blob[p + 46:p + 46 + nlen]
        lname_len, lextra_len = struct.unpack_from('<HH', blob, loff + 26)
        extra = blob[loff + 30 + lname_len:loff + 30 + lname_len + lextra_len]
        dstart = loff + 30 + lname_len + lextra_len
        entries.append({
            'name': name.decode('utf-8'), 'name_b': name, 'method': method, 'crc': crc,
            'csize': csize, 'usize': usize, 'flag': flag, 'mtime': mtime, 'mdate': mdate,
            'vneed': vneed, 'vmade': vmade, 'iattr': iattr, 'eattr': eattr, 'disk': disk,
            'loff': loff, 'dstart': dstart, 'extra': extra,
            'ccomment': blob[p + 46 + nlen + elen:p + 46 + nlen + elen + clen],
        })
        p += 46 + nlen + elen + clen
    return eocd, comment, entries


def deflate(data):
    c = zlib.compressobj(9, zlib.DEFLATED, -15)
    return c.compress(data) + c.flush()


def clean_extra(extra):
    """原 APK 中部分条目的 extra 是不足 4 字节的零填充（非法字段链），无法安全追加，直接丢弃"""
    q = 0
    while q + 4 <= len(extra):
        tp, ln = struct.unpack_from('<HH', extra, q)
        if q + 4 + ln > len(extra):
            return b''
        q += 4 + ln
    return extra if q == len(extra) else b''


def align_extra(base_extra, fixed_len):
    """返回 (extra, pad)：使 (fixed_len + len(extra)) % 4 == 0"""
    base_extra = clean_extra(base_extra)
    k = (-(fixed_len + len(base_extra))) % 4
    if k:
        k += 4
    if not k:
        return base_extra, 0
    return base_extra + struct.pack('<HH', 0xD935, k - 4) + b'\x00' * (k - 4), k


def build(src, replacements, out_path):
    blob = open(src, 'rb').read()
    eocd, comment, entries = parse_apk(blob)

    import re
    skip = re.compile(r'^META-INF/(MANIFEST\.MF|[^/]+\.(SF|RSA|DSA|EC))$', re.I)
    entries = [e for e in entries if not skip.match(e['name'])]

    out = bytearray()
    newoff, newextra, newfields = {}, {}, {}
    for e in entries:
        newoff[e['name']] = len(out)
        if e['name'] in replacements:
            raw = replacements[e['name']]
            comp = deflate(raw)
            newfields[e['name']] = (zlib.crc32(raw) & 0xffffffff, len(comp), len(raw), 8)
            extra = clean_extra(e['extra'])
            newextra[e['name']] = extra
            out += LFH_SIG + struct.pack('<HHHHHIIIHH', e['vneed'], e['flag'] & ~0x08, 8,
                                         e['mtime'], e['mdate'],
                                         newfields[e['name']][0], len(comp), len(raw),
                                         len(e['name_b']), len(extra))
            out += e['name_b'] + extra + comp
        elif e['method'] == 0:
            extra, _ = align_extra(e['extra'], len(out) + 30 + len(e['name_b']))
            newextra[e['name']] = extra
            out += LFH_SIG + struct.pack('<HHHHHIIIHH', e['vneed'], e['flag'], 0,
                                         e['mtime'], e['mdate'], e['crc'], e['csize'],
                                         e['usize'], len(e['name_b']), len(extra))
            out += e['name_b'] + extra + blob[e['dstart']:e['dstart'] + e['csize']]
        else:
            newextra[e['name']] = clean_extra(e['extra'])
            out += blob[e['loff']:e['dstart'] + e['csize']]

    cd_start = len(out)
    for e in entries:
        crc, csize, usize, method = newfields.get(
            e['name'], (e['crc'], e['csize'], e['usize'], e['method']))
        extra = newextra[e['name']]
        out += CD_SIG + struct.pack(
            '<HHHHHHIIIHHHHHII', e['vmade'], e['vneed'], e['flag'], method, e['mtime'], e['mdate'],
            crc, csize, usize, len(e['name_b']), len(extra), len(e['ccomment']),
            e['disk'], e['iattr'], e['eattr'], newoff[e['name']])
        out += e['name_b'] + extra + e['ccomment']
    cd_size = len(out) - cd_start

    out += EOCD_SIG + struct.pack('<HHHHIIH', 0, 0, len(entries), len(entries),
                                  cd_size, cd_start, len(comment)) + comment
    open(out_path, 'wb').write(bytes(out))
    return len(entries), len(out)


def add_uses_permission(data, perm='android.permission.INTERNET'):
    """向二进制清单插入一条 <uses-permission android:name="..."/>。
    做法：语句池尾部追加字符串（不打乱既有索引）→ 重建语句池 → 在 <application> 前插入
    START_ELEMENT + END_ELEMENT 两个 chunk → 修正根节点总长度。"""
    d = bytearray(data)
    ax = Axml(bytes(d))
    for e in ax.elems:
        if e['tag'] == 'uses-permission':
            for a in e['attrs']:
                if a['name'] == 'name' and a['dtype'] == 0x03 and a['data'] < len(ax.strings):
                    if ax.strings[a['data']] == perm:
                        return bytes(d), False

    idx_perm = len(ax.strings)
    idx_el = ax.strings.index('uses-permission')
    idx_name = ax.strings.index('name')
    app_pos = next(e['pos'] for e in ax.elems if e['tag'] == 'application')

    pool_pos = 8
    ptype, phsize, psize = struct.unpack_from('<HHI', d, pool_pos)
    if ptype != 0x0001 or phsize != 28:
        raise ValueError('语句池结构不符合预期')
    cnt, stycnt, flags, sstart, stystart = struct.unpack_from('<IIIII', d, pool_pos + 8)
    if stycnt != 0 or (flags & 0x100):
        raise ValueError('仅支持无 style 的 UTF-16 语句池')

    strings = list(ax.strings) + [perm]
    chunk, offs = b'', []
    for s in strings:
        offs.append(len(chunk))
        enc = s.encode('utf-16-le')
        n = len(enc) // 2
        if n > 0x7fff:
            raise ValueError('字符串过长')
        chunk += struct.pack('<H', n) + enc + b'\x00\x00'
    if len(chunk) % 4:
        chunk += b'\x00' * (4 - len(chunk) % 4)

    sstart_new = 28 + 4 * len(strings)
    pool_new = struct.pack('<HHI', 0x0001, 28, sstart_new + len(chunk))
    pool_new += struct.pack('<IIIII', len(strings), 0, 0, sstart_new, 0)
    pool_new += b''.join(struct.pack('<I', o) for o in offs) + chunk

    start = struct.pack('<HHIII', 0x0102, 16, 56, 1, 0xffffffff)
    start += struct.pack('<IIHHHHHH', 0xffffffff, idx_el, 20, 20, 1, 0, 0, 0)
    start += struct.pack('<IIIHBBI', 0xffffffff, idx_name, idx_perm, 8, 0, 0x03, idx_perm)
    end = struct.pack('<HHIII', 0x0103, 16, 24, 1, 0xffffffff)
    end += struct.pack('<II', 0xffffffff, idx_el)

    out = bytearray(d[:8]) + pool_new + d[pool_pos + psize:app_pos] \
        + start + end + d[app_pos:]
    struct.pack_into('<I', out, 4, len(out))
    return bytes(out), True


def read_version(ax):
    """读取当前清单的 (versionCode, versionName)"""
    code = None
    name = None
    for e in ax.elems:
        if e['tag'] != 'manifest':
            continue
        for a in e['attrs']:
            if a['name'] == 'versionCode':
                code = a['data']
            elif a['name'] == 'versionName':
                name = ax.strings[a['data']] if a['dtype'] == 0x03 else str(a['data'])
    return code, name


def patch_manifest(src, add_net=True, version_code=None, version_name=None):
    """改清单。version_code 缺省为「当前值 + 1」（覆盖安装必须递增）；
    version_name 缺省保持不变，给了就必须与原值等长，否则字符串池要重建，脚本会跳过。"""
    z = zipfile.ZipFile(src)
    man = z.read('AndroidManifest.xml')
    ax = Axml(man)
    log = []
    for attr in ('debuggable', 'allowBackup', 'usesCleartextTraffic'):
        if ax.set_bool('application', attr, False):
            log.append('%s=false' % attr)

    old_code, old_name = read_version(ax)
    want_code = old_code + 1 if version_code is None else version_code
    if old_code is not None and want_code <= old_code:
        raise SystemExit('versionCode 必须递增：当前 %s，要求 %s' % (old_code, want_code))
    if ax.set_int('manifest', 'versionCode', want_code):
        log.append('versionCode=%s->%d' % (old_code, want_code))

    if version_name is not None and version_name != old_name:
        try:
            if ax.replace_string(old_name, version_name):
                log.append('versionName=%s->%s' % (old_name, version_name))
            else:
                log.append('versionName 未命中，保持 %s' % old_name)
        except Exception as ex:
            log.append('versionName 跳过（长度不同，需重建字符串池）: %s' % ex)
    else:
        log.append('versionName 保持 %s' % old_name)

    out = bytes(ax.d)
    if add_net:
        out, added = add_uses_permission(out)
        log.append(('新增 ' if added else '已存在 ') + 'uses-permission INTERNET')
    return out, log


if __name__ == '__main__':
    argv = sys.argv[1:]
    add_net = '--no-net' not in argv

    def take(flag, cast=str):
        if flag not in argv:
            return None
        i = argv.index(flag)
        if i + 1 >= len(argv):
            raise SystemExit('%s 缺少参数值' % flag)
        val = argv[i + 1]
        del argv[i:i + 2]
        return cast(val)

    v_code = take('--version-code', int)
    v_name = take('--version-name')

    args = [a for a in argv if not a.startswith('--')]
    if len(args) != 3:
        raise SystemExit('用法: python apk_repack.py <src.apk> <new_index.html> <out.apk> '
                         '[--no-net] [--version-code N] [--version-name X.Y]')
    src, html, out = args
    man, log = patch_manifest(src, add_net=add_net, version_code=v_code, version_name=v_name)
    print('清单补丁:', ', '.join(log))
    n, size = build(src, {'assets/index.html': open(html, 'rb').read(),
                          'AndroidManifest.xml': man}, out)
    print('条目 %d，输出 %d 字节 -> %s' % (n, size, out))
