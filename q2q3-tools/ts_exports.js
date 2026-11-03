#!/usr/bin/env node
// Read TypeScript source on stdin and print its interface as JSON, using the TypeScript parser (no regexes).
//
//   node ts_exports.js FILENAME < source      (FILENAME only decides .ts vs .tsx parsing)
//
// Output: {
//   exports:     {name: declaration text with bodies, initializers and default values removed},
//   local_types: {name: full text of non-exported type aliases and interfaces},
//   members:     {name: signature} for members of top-level classes and of top-level object literals,
//   defined:     [every name declared at top level, as a class member, or as a top-level object-literal member],
//   reexports:   [names re-exported with `export { ... }`]
// }
// Nothing inside function or method bodies is visited, so local variables never show up as "new methods".
// TS_PATH can point at a typescript package; the default is Cal.com's own copy.
const ts = require(process.env.TS_PATH || '/home/claude/pilot/calcom/node_modules/typescript');

const fname = process.argv[2] || 'x.ts';
const text = require('fs').readFileSync(0, 'utf8');
const sf = ts.createSourceFile(fname, text, ts.ScriptTarget.Latest, true,
  fname.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

const src = (n) => text.slice(n.getStart(sf), n.end);
const squash = (s) => s.replace(/\s+/g, ' ').trim();
const has = (n, k) => (ts.getCombinedModifierFlags ? (ts.getCombinedModifierFlags(n) & k) !== 0 : false);
const isExported = (n) => has(n, ts.ModifierFlags.Export);
const isPrivate = (n) => has(n, ts.ModifierFlags.Private) || (n.name && ts.isPrivateIdentifier(n.name));

// Binding names without default values: `{ a = 1, b }` -> `{ a, b }`.
function binding(n) {
  if (ts.isIdentifier(n)) return n.text;
  if (ts.isObjectBindingPattern(n))
    return '{ ' + n.elements.map((e) => (e.dotDotDotToken ? '...' : '') +
      (e.propertyName ? src(e.propertyName) + ': ' : '') + binding(e.name)).join(', ') + ' }';
  if (ts.isArrayBindingPattern(n))
    return '[' + n.elements.map((e) => (ts.isOmittedExpression(e) ? '' : (e.dotDotDotToken ? '...' : '') + binding(e.name))).join(', ') + ']';
  return src(n);
}
// Parameter list without default values: `a = 1` -> `a?`, keeping type annotations.
function params(ps) {
  return '(' + ps.map((p) => {
    let s = (p.dotDotDotToken ? '...' : '') + binding(p.name);
    const optional = p.questionToken || p.initializer;
    if (optional) s += '?';
    if (p.type) s += ': ' + src(p.type);
    return s;
  }).join(', ') + ')';
}
const typeParams = (n) => (n.typeParameters && n.typeParameters.length ? '<' + n.typeParameters.map(src).join(', ') + '>' : '');
const ret = (n) => (n.type ? ': ' + src(n.type) : '');
const asyncKw = (n) => (has(n, ts.ModifierFlags.Async) ? 'async ' : '');

function fnLike(name, n) {
  // n: function declaration/expression, arrow, method, constructor
  return `${asyncKw(n)}${name}${typeParams(n)}${params(n.parameters)}${ret(n)}`;
}

function memberSig(m) {
  const name = m.name ? src(m.name) : '';
  const stat = has(m, ts.ModifierFlags.Static) ? 'static ' : '';
  const ro = has(m, ts.ModifierFlags.Readonly) ? 'readonly ' : '';
  if (ts.isConstructorDeclaration(m)) return { name: 'constructor', sig: 'constructor' + params(m.parameters) };
  if (ts.isMethodDeclaration(m) || ts.isMethodSignature(m)) return { name, sig: stat + fnLike(name, m) };
  if (ts.isGetAccessor(m)) return { name, sig: `${stat}get ${name}()${ret(m)}` };
  if (ts.isSetAccessor(m)) return { name, sig: `${stat}set ${name}${params(m.parameters)}` };
  if (ts.isPropertyDeclaration(m)) {
    const init = m.initializer;
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) return { name, sig: stat + fnLike(name, init) };
    return { name, sig: `${stat}${ro}${name}${m.questionToken ? '?' : ''}${m.type ? ': ' + src(m.type) : ''}` };
  }
  return null;
}

function objectMembers(obj) {
  const out = {};
  for (const p of obj.properties) {
    if (!p.name) continue;
    const name = src(p.name);
    if (ts.isMethodDeclaration(p)) out[name] = fnLike(name, p);
    else if (ts.isPropertyAssignment(p) && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer)))
      out[name] = fnLike(name, p.initializer);
    else out[name] = name;
  }
  return out;
}

const exportsOut = {}, localTypes = {}, members = {}, defined = new Set(), reexports = [], decls = {}, classMembers = {};

function classText(c, exported) {
  const cname = c.name ? c.name.text : 'default';
  classMembers[cname] = classMembers[cname] || {};
  const head = `${exported ? 'export ' : ''}${has(c, ts.ModifierFlags.Default) ? 'default ' : ''}${has(c, ts.ModifierFlags.Abstract) ? 'abstract ' : ''}class ${c.name ? c.name.text : ''}${typeParams(c)}` +
    (c.heritageClauses ? ' ' + c.heritageClauses.map(src).join(' ') : '');
  const lines = [];
  for (const m of c.members) {
    const s = memberSig(m);
    if (!s) continue;
    defined.add(s.name);
    if (!isPrivate(m) || s.name === 'constructor') {
      members[s.name] = s.sig; classMembers[cname][s.name] = squash(s.sig);
      if (!isPrivate(m)) lines.push('  ' + squash(s.sig) + ';');
    }
  }
  return squash(head) + ' {\n' + lines.join('\n') + '\n}';
}

for (const st of sf.statements) {
  const exp = isExported(st);
  if (ts.isFunctionDeclaration(st) && st.name) {
    defined.add(st.name.text);
    if (exp) {
      const prev = exportsOut[st.name.text];
      const sig = `export ${has(st, ts.ModifierFlags.Default) ? 'default ' : ''}${asyncKw(st)}function ${st.name.text}${typeParams(st)}${params(st.parameters)}${ret(st)}`;
      exportsOut[st.name.text] = prev && !st.body ? prev + '\n' + squash(sig) : (prev && st.body ? prev : squash(sig));
    } else {
      decls[st.name.text] = squash(`${asyncKw(st)}function ${st.name.text}${typeParams(st)}${params(st.parameters)}${ret(st)}`);
    }
  } else if (ts.isClassDeclaration(st)) {
    const name = st.name ? st.name.text : 'default';
    defined.add(name);
    const t = classText(st, exp);
    if (exp) exportsOut[name] = t; else decls[name] = t;
  } else if (ts.isInterfaceDeclaration(st) || ts.isTypeAliasDeclaration(st) || ts.isEnumDeclaration(st)) {
    defined.add(st.name.text);
    if (exp) exportsOut[st.name.text] = src(st);
    else { decls[st.name.text] = src(st); if (!ts.isEnumDeclaration(st)) localTypes[st.name.text] = src(st); }
  } else if (ts.isVariableStatement(st)) {
    const kw = st.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let';
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name)) continue;
      const name = d.name.text, init = d.initializer;
      defined.add(name);
      let sig;
      if (d.type) sig = `export ${kw} ${name}: ${src(d.type)}`;
      else if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) sig = `export ${kw} ${name} = ${squash(fnLike('', init))} => ...`;
      else if (init && ts.isObjectLiteralExpression(init)) {
        const om = objectMembers(init);
        for (const [k, v] of Object.entries(om)) { defined.add(k); members[k] = v; }
        sig = `export ${kw} ${name}: { ${Object.values(om).map(squash).join('; ')} }`;
      } else if (init && ts.isAsExpression(init) && ts.isObjectLiteralExpression(init.expression)) {
        const om = objectMembers(init.expression);
        for (const k of Object.keys(om)) defined.add(k);
        sig = `export ${kw} ${name}: { ${Object.keys(om).join('; ')} } (as const)`;
      } else sig = `export ${kw} ${name}`;
      if (exp) exportsOut[name] = sig; else decls[name] = sig.replace(/^export /, '');
    }
  } else if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause)) {
    for (const e of st.exportClause.elements) {
      reexports.push(e.name.text);
      const local = (e.propertyName || e.name).text;
      // `export { a, b }` of declarations in this file: same as exporting them directly
      if (!st.moduleSpecifier && decls[local] !== undefined) {
        const d = decls[local];
        exportsOut[e.name.text] = d.startsWith('export ') ? d : 'export ' + d;
      }
    }
  } else if (ts.isExportAssignment(st)) {
    reexports.push('default');
  }
}

process.stdout.write(JSON.stringify({ exports: exportsOut, local_types: localTypes, members, defined: [...defined], reexports, class_members: classMembers }));
