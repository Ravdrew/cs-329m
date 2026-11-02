#!/usr/bin/env python3
"""Extract an interface spec for a task from its fail-to-pass tests, by rule (v2).

The spec lists only what the tests need that does not exist at the base commit:
  1. files the tests import (or vi.mock) that are missing at base, with their exported declarations at the merge
     commit: signatures only, no bodies, no initializers, no default values;
  2. names the tests import from files that exist at base but do not export them at base;
  3. members (class methods, object-literal members) the tests reference on modules they import or mock, defined in
     the merge version of that file and not in the base version;
  4. the modules and members the tests replace with vi.mock.
Test files and test support files (task_overrides.json: hidden_support_files) are never listed: they ship with the
hidden tests.

v3 (2026-11-02, after an independent review of the hand edits) adds three things v2 missed:
  - `export { a, b }` clauses count as exports (#19626: a component that was default-only at base);
  - changed signatures: exported names and class members the tests reference (and the constructor of any class
    the tests construct with `new`) that exist at base and merge but with a different signature (#27378);
  - Prisma schema additions when the PR changes packages/prisma/schema.prisma: new enums and their members, new
    models and their fields, new fields on existing models (names and types only, no attributes or defaults);
and lists mocked members for new files too. Binding defaults (`{ a = 1 }`) are stripped as well.

v2 (2026-11-02) replaces v1's regex extraction with the TypeScript parser (ts_exports.js). That fixes the two v1
defects found in review: arrow-function exports lost their signature, and class-method/local-variable regexes
matched code inside bodies and copied it into the spec. It also drops parameter default values (v1 printed them)
and prints each type once.

Usage: make_spec.py [--tasks tasks.json] [--repo DIR] [--overrides task_overrides.json] [--out DIR] PULL [PULL ...]
"""
import argparse, json, os, re, subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ALIASES = {'@calcom/features/': 'packages/features/', '@calcom/lib/': 'packages/lib/', '@calcom/trpc/': 'packages/trpc/',
           '@calcom/prisma/': 'packages/prisma/', '@calcom/app-store/': 'packages/app-store/', '@calcom/ui/': 'packages/ui/',
           '@calcom/emails/': 'packages/emails/', '@calcom/web/': 'apps/web/', '~/': 'apps/web/modules/',
           '@lib/': 'apps/web/lib/', '@components/': 'apps/web/components/'}
EXTS = ['.ts', '.tsx', '/index.ts', '/index.tsx', '']
GIT = []


def show(c, f):
    r = subprocess.run(GIT + ['show', f'{c}:{f}'], capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def exists(c, f):
    return subprocess.run(GIT + ['cat-file', '-e', f'{c}:{f}'], capture_output=True).returncode == 0


_cache = {}


def squash(x):
    return re.sub(r'\s+', ' ', x).strip()


def type_delta(old, new):
    """For a changed type/interface/enum: its first line plus only the lines added or removed."""
    o = [l.strip() for l in old.splitlines()]
    n = [l.strip() for l in new.splitlines()]
    head = new.splitlines()[0].rstrip()
    added = [f'  {l}   // new' for l in n[1:] if l and l not in o and l not in ('};', '}')]
    removed = [f'  // removed: {l}' for l in o[1:] if l and l not in n and l not in ('};', '}')]
    return f'{head}   // existing; changes only\n' + '\n'.join(added + removed) + '\n}'


def show_change(old, new):
    if re.match(r'(export\s+)?(type|interface|enum)\b', new.strip()) and '\n' in new:
        return type_delta(old, new)
    return new


def parse(text, path):
    """Interface of a TypeScript file via ts_exports.js."""
    if text is None:
        return {'exports': {}, 'local_types': {}, 'members': {}, 'defined': [], 'reexports': [], 'class_members': {}}
    key = (path, hash(text))
    if key not in _cache:
        r = subprocess.run(['node', str(HERE / 'ts_exports.js'), path], input=text, capture_output=True, text=True)
        if r.returncode:
            raise SystemExit(f'ts_exports.js failed on {path}: {r.stderr[-800:]}')
        _cache[key] = json.loads(r.stdout)
    return _cache[key]


def resolve(spec, src, commit):
    if spec.startswith('.'):
        base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else:
        a = next((a for a in ALIASES if spec.startswith(a)), None)
        if not a:
            return None
        base = ALIASES[a] + spec[len(a):]
    base = re.sub(r'\.(ts|tsx|js)$', '', base)
    for e in EXTS:
        if exists(commit, base + e) and (base + e).endswith(('.ts', '.tsx')):
            return base + e
    return base + '.ts'  # missing at this commit


def used_local_types(info):
    """Non-exported types referenced by the exported signatures (transitively)."""
    text = '\n'.join(info['exports'].values())
    out, changed = {}, True
    while changed:
        changed = False
        for n, t in info['local_types'].items():
            if n not in out and re.search(rf'\b{re.escape(n)}\b', text):
                out[n] = t; text += '\n' + t; changed = True
    return out


SCHEMA = 'packages/prisma/schema.prisma'


def prisma_blocks(text):
    """{('enum'|'model', name): {member/field: type}} from a Prisma schema; attributes and defaults dropped."""
    out = {}
    for m in re.finditer(r'^(enum|model)\s+(\w+)\s*\{(.*?)^\}', text or '', re.M | re.S):
        body = {}
        for line in m.group(3).splitlines():
            line = line.split('//')[0].strip()
            if not line or line.startswith('@@'):
                continue
            parts = line.split()
            body[parts[0]] = parts[1] if m.group(1) == 'model' and len(parts) > 1 else ''
        out[(m.group(1), m.group(2))] = body
    return out


def prisma_changes(base, merge):
    b, m = prisma_blocks(show(base, SCHEMA)), prisma_blocks(show(merge, SCHEMA))
    lines = []
    for (kind, name), body in m.items():
        old = b.get((kind, name))
        if old is None:
            inner = '\n'.join(f'  {k}' + (f' {v}' if v else '') for k, v in body.items())
            lines.append(f'{kind} {name} {{\n{inner}\n}}')
        else:
            added = {k: v for k, v in body.items() if k not in old}
            changed = {k: v for k, v in body.items() if k in old and old[k] != v}
            if added or changed:
                inner = '\n'.join([f'  {k}' + (f' {v}' if v else '') + '   // new' for k, v in added.items()] +
                                   [f'  {k} {v}   // was {old[k]}' for k, v in changed.items()])
                lines.append(f'{kind} {name} {{   // existing; changes only\n{inner}\n}}')
    return lines


def _block(text, i):
    """Text of the balanced (...)/{...}/[...] group that starts at or after index i."""
    while i < len(text) and text[i] not in '({[':
        i += 1
    depth, j = 0, i
    while j < len(text):
        c = text[j]
        if c in '({[':
            depth += 1
        elif c in ')}]':
            depth -= 1
            if depth == 0:
                return text[i:j + 1]
        j += 1
    return text[i:]


def _top_keys(obj):
    """Top-level keys of an object literal's text ('{ a: 1, b() {}, c }' -> a, b, c)."""
    keys, depth, tok = [], 0, ''
    inner = obj.strip()[1:-1] if obj.strip().startswith('{') else obj
    for i, c in enumerate(inner):
        if c in '({[':
            depth += 1
        elif c in ')}]':
            depth -= 1
        if depth == 0 and c in ',':
            tok = ''
            continue
        tok += c
        if depth == 0:
            m = re.match(r'\s*(?:async\s+)?["\']?([A-Za-z_$][\w$]*)["\']?\s*[:(]$', tok)
            if m and m.group(1) not in keys:
                keys.append(m.group(1))
    for t in re.split(r',', re.sub(r'[({\[][^()\[\]{}]*[)}\]]', '', inner)):
        m = re.fullmatch(r'\s*([A-Za-z_$][\w$]*)\s*', t)
        if m and m.group(1) not in keys:
            keys.append(m.group(1))
    return keys


def _returned_object(fn_text):
    """The object literal a factory returns: `() => ({...})`, `() => { return {...} }`, or `async () => ...`."""
    m = re.search(r'=>\s*\(\s*\{', fn_text)
    if m:
        return _block(fn_text, m.end() - 1)
    m = re.search(r'return\s*\{', fn_text)
    if m:
        return _block(fn_text, m.end() - 1)
    m = re.search(r'=>\s*\{', fn_text)
    return None if not m else None


def mocked(body, all_bodies=''):
    """Modules the tests replace with vi.mock, and the members their factories define.
    Members: top-level keys of the object the factory returns; for `default: {...}` also `default.<key>`.
    A factory given by name (vi.mock("x", createMock)) is looked up in the test files. No factory = automock."""
    res = {}
    for m in re.finditer(r'''vi\.mock\(\s*['"]([^'"]+)['"]\s*(,|\))''', body):
        mod = m.group(1)
        if m.group(2) == ')':
            res[mod] = ['(automocked: every export replaced)']
            continue
        rest = body[m.end():]
        name = re.match(r'\s*([A-Za-z_$][\w$]*)\s*\)', rest)
        if name:
            d = re.search(rf'(?:const|let|function)\s+{name.group(1)}\b[^=({{]*[=(]', all_bodies)
            fn = all_bodies[d.start():d.start() + 4000] if d else ''
        else:
            fn = _block(body, m.start() + len('vi.mock'))
        obj = _returned_object(fn)
        if not obj:
            res[mod] = res.get(mod, [])
            continue
        keys = _top_keys(obj)
        out = [k for k in keys if k not in ('__esModule',)]
        if 'default' in keys:
            dm = re.search(r'default\s*:\s*\{', obj)
            if dm:
                out += [f'default.{k}' for k in _top_keys(_block(obj, dm.end() - 1))]
        res[mod] = sorted(set(res.get(mod, [])) | set(out))
    return res

def build(t, support):
    base, merge = t['base_commit'], t['merge_commit']
    hidden = set(t['test_files']) | set(support)
    new_files, new_exports, new_methods, changed = {}, {}, {}, {}
    for tf in t['test_files']:
        body = show(merge, tf) or ''
        idents = set(re.findall(r'\b\w+\b', body))
        specs = re.findall(r'''(?:import\s+(?:type\s+)?([\s\S]*?)\s+from\s*|vi\.mock\(\s*|import\(\s*)['"]([^'"]+)['"]''', body)
        for names_txt, spec in specs:
            path = resolve(spec, tf, merge)
            if not path or path in hidden:
                continue
            names = set(re.findall(r'\b(\w+)\b', re.sub(r'\bas\s+\w+', '', names_txt or ''))) - {'type', 'import', 'default'}
            if not exists(base, path):
                if exists(merge, path):
                    info = parse(show(merge, path), path)
                    new_files[path] = {**{f'__type:{n}': v for n, v in used_local_types(info).items()}, **info['exports']}
                continue
            bi, mi = parse(show(base, path), path), parse(show(merge, path), path)
            bexp = set(bi['exports']) | set(bi['reexports'])
            for n in sorted(names):
                if n in mi['exports'] and n not in bexp:
                    new_exports.setdefault(path, {})[n] = mi['exports'][n]
            # existing names whose signature changed between base and merge
            for n in sorted(idents):
                if n in mi['exports'] and n in bi['exports'] and squash(mi['exports'][n]) != squash(bi['exports'][n]) \
                        and n not in mi['class_members']:
                    changed.setdefault(path, {})[n] = show_change(bi['exports'][n], mi['exports'][n])
                    # types this signature uses that also changed (e.g. a props type)
                    for tn, tv in mi['local_types'].items():
                        if tn != n and re.search(rf'\b{re.escape(tn)}\b', mi['exports'][n]) and \
                                tn in bi['local_types'] and squash(bi['local_types'][tn]) != squash(tv):
                            changed[path][tn] = type_delta(bi['local_types'][tn], tv)
            for cls, mem in mi['class_members'].items():
                old = bi['class_members'].get(cls)
                if old is None or cls not in idents:
                    continue
                want = idents | ({'constructor'} if re.search(rf'new\s+{cls}\s*\(', body) else set())
                for k, sig in mem.items():
                    if k in want and k in old and squash(old[k]) != squash(sig):
                        changed.setdefault(path, {})[f'{cls}.{k}'] = f'{cls}: {sig}'
                        for tn, tv in {**mi['local_types'], **{x: y for x, y in mi['exports'].items()
                                                              if x not in bi['exports']}}.items():
                            if re.search(rf'\b{re.escape(tn)}\b', sig) and tn not in bi['defined']:
                                changed[path][tn] = tv
            added = (set(mi['defined']) - set(bi['defined'])) & idents
            for n in sorted(added):
                if n in mi['exports']:
                    new_exports.setdefault(path, {})[n] = mi['exports'][n]
                elif n in mi['members']:
                    new_methods.setdefault(path, {})[n] = re.sub(r'\s+', ' ', mi['members'][n]).strip()
    mocks = {}
    every = '\n'.join(show(merge, f) or '' for f in list(t['test_files']) + list(support))
    for tf in t['test_files']:
        for spec, names in mocked(show(merge, tf) or '', every).items():
            path = resolve(spec, tf, merge) or spec
            if path not in hidden and names:
                mocks.setdefault(path, {})[os.path.basename(tf)] = tuple(names)
    schema = prisma_changes(base, merge) if subprocess.run(
        GIT + ['diff', '--quiet', base, merge, '--', SCHEMA]).returncode else []
    return new_files, new_exports, new_methods, mocks, changed, schema




def render(new_files, new_exports, new_methods, mocks, changed=None, schema=None):
    lines = ['## Interface the tests expect\n',
             'The change is checked by unit tests that use the following code locations and signatures. '
             'Create or extend them exactly as named. Everything else about the implementation is up to you.\n']
    for p, ex in sorted(new_files.items()):
        lines.append(f'**New file `{p}`**, exporting:\n```ts')
        lines += list(ex.values())
        lines.append('```\n')
    for p, ex in sorted(new_exports.items()):
        lines.append(f'**Existing file `{p}`**, new exports:\n```ts')
        lines += list(ex.values())
        lines.append('```\n')
    for p, ms in sorted(new_methods.items()):
        lines.append(f'**Existing file `{p}`**, new methods:\n```ts')
        lines += [v + ';' for v in ms.values()]
        lines.append('```\n')
    for p, ex in sorted((changed or {}).items()):
        lines.append(f'**Existing file `{p}`**, changed signatures (new version shown):\n```ts')
        lines += list(ex.values())
        lines.append('```\n')
    if schema:
        lines.append(f'**Prisma schema (`{SCHEMA}`)**, additions:\n```prisma')
        lines += schema
        lines.append('```\n')
    if mocks:
        lines.append('**Dependencies the tests replace with mocks.** The code under test should get its data through '
                     'these modules and members, because the tests stub them instead of using a database. A mock '
                     'defines only the members listed, so importing anything else from these modules fails under '
                     'the tests:\n')
        for p, per_file in sorted(mocks.items()):
            variants = set(per_file.values())
            if len(variants) > 1:   # different test files mock the module differently
                lines.append(f'- `{p}`: ' + '; '.join(
                    ', '.join(f'`{n}`' for n in ns) + f' (in the {tf.split(".")[0]} tests)' for tf, ns in sorted(per_file.items())))
                continue
            ns = list(variants.pop())
            if ns == ['(automocked: every export replaced)']:
                lines.append(f'- `{p}`: the whole module (automocked: every export replaced by a mock)')
            else:
                lines.append(f'- `{p}`: ' + ', '.join(f'`{n}`' for n in ns))
        lines.append('')
    if len(lines) == 2:
        return ''  # nothing new: the tests use only interface that exists at base
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pulls', nargs='+', type=int)
    ap.add_argument('--tasks', default=os.environ.get('BENCH_TASKS', str(HERE.parent / 'benchmark' / 'tasks.json')))
    ap.add_argument('--repo', default=os.environ.get('CALCOM_DIR', '/home/claude/pilot/calcom'), help='Cal.com clone with full history')
    ap.add_argument('--overrides', default=str(HERE / 'task_overrides.json'))
    ap.add_argument('--out', default=str(HERE / 'specs-generated'))
    a = ap.parse_args()
    GIT[:] = ['git', '-C', a.repo]
    tasks = {t['pull_number']: t for t in json.load(open(a.tasks))}
    over = json.load(open(a.overrides)) if os.path.exists(a.overrides) else {}
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    for p in a.pulls:
        support = over.get(str(p), {}).get('hidden_support_files', [])
        nf, ne, nm, mk, ch, sc = build(tasks[p], support)
        (out / f'{p}.md').write_text(render(nf, ne, nm, mk, ch, sc))
        json.dump({'new_files': sorted(nf), 'new_exports': {k: sorted(v) for k, v in ne.items()},
                   'new_methods': {k: sorted(v) for k, v in nm.items()},
                   'mocks': {k: {f: list(n) for f, n in v.items()} for k, v in mk.items()},
                   'changed': {k: sorted(v) for k, v in ch.items()}, 'schema_blocks': len(sc)},
                  open(out / f'{p}.json', 'w'), indent=1)
        print(f'#{p}: {len(nf)} new files, {sum(map(len, ne.values()))} new exports, '
              f'{sum(map(len, nm.values()))} new methods, {sum(map(len, ch.values()))} changed, {len(sc)} schema blocks, '
              f'{len(mk)} mocked modules', file=sys.stderr)


if __name__ == '__main__':
    main()
